import assert from "node:assert/strict";
import test from "node:test";
import {CATALOG} from "../src/lib/priority/catalog";
import {SCENARIO_EVENTS} from "../src/lib/priority/scenarios";
import {addIncident,advanceSimulation,compareWhatIf,createSimulation,getRankedIncidents,startRepair} from "../src/lib/priority/engine";
import {estimatedRepairMinutes} from "../src/lib/priority/repair";
import type {FaultAssessment} from "../src/lib/priority/types";
const isolated=()=>({...createSimulation(),incidents:[],previousOrder:[],rankChanges:[],injectedEventIds:SCENARIO_EVENTS.map(e=>e.id)});
const camera=CATALOG.find(e=>e.id==="final-gate-camera")!.assessment;

test("every repairable catalog and prepared scenario completes inside its displayed estimate",()=>{
  const assessments:FaultAssessment[]=[...CATALOG.map(c=>c.assessment),...SCENARIO_EVENTS.map(e=>e.assessment),{...camera,repairMinutes:{min:4,max:4}},{...camera,repairMinutes:{min:4.2,max:5.4}}];
  for(const assessment of assessments){
    if(assessment.needsReview||assessment.kind==="unknown"||!assessment.stationId||assessment.repairMinutes.max<=0) continue;
    let state=addIncident(isolated(),assessment,"Repair timing check","job");
    const ranked=getRankedIncidents(state)[0];
    assert.equal(ranked.restorationMinutes,Math.round(estimatedRepairMinutes(assessment)*10)/10);
    state=startRepair(state,"job");
    const job=state.incidents[0];
    const duration=job.repairCompletesAtMinute!-job.repairStartedAtMinute!;
    assert.ok(duration>=assessment.repairMinutes.min&&duration<=assessment.repairMinutes.max,assessment.catalogId??assessment.title);
    assert.equal(duration,(assessment.repairMinutes.min+assessment.repairMinutes.max)/2);
    state=advanceSimulation(state,duration-.01);
    assert.equal(state.incidents[0].status,"repairing");
    state=advanceSimulation(state,.01);
    assert.equal(state.incidents[0].status,"resolved");
    assert.ok(Math.abs(state.incidents[0].resolvedAtMinute!-duration)<1e-7);
  }
});

test("one fixed five-minute estimate matches priority, actual completion and both forecasts",()=>{
  const initial=addIncident(isolated(),camera,"Camera retries","camera");
  assert.equal(estimatedRepairMinutes(camera),5);
  assert.equal(getRankedIncidents(initial)[0].restorationMinutes,5);
  const preview=compareWhatIf(initial,{kind:"repair",incidentId:"camera",delayMinutes:null},10);
  assert.equal(preview.baseline.frames.at(-1)!.state.incidents[0].resolvedAtMinute,5);
  assert.equal(preview.alternative.frames.at(-1)!.state.incidents[0].status,"open");
  const live=advanceSimulation(startRepair(initial,"camera"),5);
  assert.equal(live.incidents[0].resolvedAtMinute,5);
  assert.equal(live.incidents[0].status,"resolved");
  assert.match(live.incidents[0].history.map(e=>e.text).join(" "),/5 min total, matching the displayed estimate/);
});
