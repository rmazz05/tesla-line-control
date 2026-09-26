import assert from "node:assert/strict";
import test from "node:test";
import {SCENARIO_EVENTS} from "../src/lib/priority/scenarios";
import {addIncident,advanceSimulation,createSimulation,getRankedIncidents} from "../src/lib/priority/engine";
import {getIncidentPresentation} from "../src/lib/priority/presentation";

test("six prepared incidents have planning time or verified protection; four require immediate attention",()=>{
  const planned:string[]=[]; const urgent:string[]=[];
  for(const event of SCENARIO_EVENTS){
    const initial={...createSimulation(),minute:event.minute,incidents:[],previousOrder:[],rankChanges:[],injectedEventIds:SCENARIO_EVENTS.map(e=>e.id)};
    const row=getRankedIncidents(addIncident(initial,event.assessment,event.reportText,event.id))[0];
    if(row.decision.urgency === "critical") urgent.push(event.id);
    else {assert.ok(row.slackMinutes === null || row.slackMinutes >= 8, `${event.id} should leave time to respond`);planned.push(event.id);}
  }
  assert.equal(planned.length,6);
  assert.deepEqual(urgent,["SIM-02","SIM-05","SIM-07","SIM-10"]);
});

test("historical injury risk stays visible without inventing a time-to-injury countdown",()=>{
  const event=SCENARIO_EVENTS.find(e=>e.id==="SIM-05")!;
  const initial={...createSimulation(),incidents:[],previousOrder:[],rankChanges:[],injectedEventIds:SCENARIO_EVENTS.map(e=>e.id)};
  let state=addIncident(initial,event.assessment,event.reportText,event.id);
  assert.equal(getIncidentPresentation(getRankedIncidents(state)[0],0).timingLabel,"Safety review now");
  state=advanceSimulation(state,30);
  const view=getIncidentPresentation(getRankedIncidents(state)[0],state.minute);
  assert.equal(view.timingLabel,"Safety review now");
  assert.equal(event.assessment.criticalAfterMinutes,null);
});

test("all negative or exhausted repair windows say only Start now",()=>{
  const row=getRankedIncidents(createSimulation())[0];
  for(const slackMinutes of [0,-.5,-1,-30,-100]) {
    const view=getIncidentPresentation({...row,slackMinutes},0);
    assert.equal(view.timingLabel,"Start now");
    assert.equal(view.urgency,"critical");
  }
});
