import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import { addIncident, advanceSimulation, createSimulation, getRankedIncidents, startRepair, resolveIncident } from "../src/lib/priority/engine";
import { getLineActivity } from "../src/lib/priority/activity";
import { getIncidentPresentation } from "../src/lib/priority/presentation";
import type { FaultAssessment, SimulationState } from "../src/lib/priority/types";
const template = CATALOG.find(c => c.id === "cockpit-locator")!.assessment;
const fault = (changes: Partial<FaultAssessment> = {}) => ({...template, catalogId: null, ...changes});
const empty = (): SimulationState => ({...createSimulation(), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: SCENARIO_EVENTS.map(e => e.id)});

test("20-minute buffer minus the displayed 6.5-minute repair leaves 13.5 minutes to act", () => {
  const row = getRankedIncidents(createSimulation())[0];
  assert.equal(row.criticalInMinutes,20);
  assert.equal(row.responseMinutes,6.5);
  assert.equal(row.slackMinutes,13.5);
  assert.equal(getIncidentPresentation(row,0).timingLabel,"Start within 13 min");
  const later = advanceSimulation(createSimulation(),13.5);
  const feed = getRankedIncidents(later).find(r => r.incident.id === "SIM-01")!;
  assert.equal(feed.slackMinutes,0);
  assert.equal(getIncidentPresentation(feed,13.5).urgency,"critical");
  assert.ok(feed.criticalInMinutes! > 0,"act before the buffer is empty");
});

test("a later impact with a long repair outranks an earlier impact with a short repair", () => {
  let state = addIncident(empty(),fault({criticalAfterMinutes:12,repairMinutes:{min:2,max:2},stationId:"EOL-41"}),"Short repair","short");
  state = addIncident(state,fault({criticalAfterMinutes:20,repairMinutes:{min:15,max:15}}),"Long repair","long");
  const rows = getRankedIncidents(state);
  assert.deepEqual(rows.map(r=>r.incident.id),["long","short"]);
  assert.ok(rows[0].criticalInMinutes! > rows[1].criticalInMinutes!);
  assert.ok(rows[0].slackMinutes! < rows[1].slackMinutes!);
  assert.equal(getIncidentPresentation(rows[0],0).timingLabel,"Start within 5 min");
});

test("ongoing repairs do not consume another incident's response window", () => {
  let state=empty();
  for(let i=0;i<6;i++) {
    state=addIncident(state,fault({criticalAfterMinutes:40,repairMinutes:{min:8,max:8}}),"Ongoing repair",`busy-${i}`);
    state=startRepair(state,`busy-${i}`);
  }
  state=addIncident(state,fault({criticalAfterMinutes:20,repairMinutes:{min:2,max:2}}),"Unstarted job","waiting");
  const waiting=getRankedIncidents(state).find(r=>r.incident.id==="waiting")!;
  const alone=getRankedIncidents(addIncident(empty(),fault({criticalAfterMinutes:20,repairMinutes:{min:2,max:2}}),"Same job","waiting"))[0];
  assert.equal(waiting.teamWaitMinutes,0);
  assert.equal(waiting.restorationMinutes,alone.restorationMinutes);
  assert.equal(waiting.slackMinutes,alone.slackMinutes);
  assert.equal(startRepair(state,"waiting").incidents.filter(i=>i.status==="repairing").length,7);
});

test("activity announces arrivals, dispatch and restoration but stays quiet on ordinary ticks", () => {
  const initial = createSimulation();
  assert.equal(getLineActivity(initial,advanceSimulation(initial,.5)),null);
  const arrived = advanceSimulation(initial,2);
  assert.equal(getLineActivity(initial,arrived)?.kind,"reported");
  const started=startRepair(arrived,"SIM-02");
  assert.equal(getLineActivity(arrived,started)?.kind,"repairing");
  const done=resolveIncident(started,"SIM-02");
  assert.equal(getLineActivity(started,done)?.kind,"resolved");
  assert.match(getLineActivity(started,done)!.title,/repair completed/);
});

test("a fault masked by existing line holds is distinguished from missing information", () => {
  const initial=addIncident(empty(),CATALOG.find(c=>c.id==="body-feed-interruption")!.assessment,"Supply issue","SIM-01");
  const state=addIncident(initial,{...fault(),stationId:"GA-18",kind:"safety",safety:"suspected"},"Station held","hold");
  const feed = getRankedIncidents(state).find(r=>r.incident.id==="SIM-01")!;
  assert.equal(feed.impactEvent,"no_additional_impact");
  const view=getIncidentPresentation(feed,state.minute);
  assert.equal(view.timingLabel,"Monitor production");
  assert.doesNotMatch(view.calculation!,/information needed/);
});

test("unstarted restoration allowances never age during the full manual demo", () => {
  let state=createSimulation();
  const estimates=new Map<string,number|null>();
  for(let minute=0;minute<=40;minute++) {
    for(const row of getRankedIncidents(state)) {
      assert.equal(row.incident.status,"open");
      assert.equal(row.teamWaitMinutes,0);
      if(estimates.has(row.incident.id)) assert.equal(row.restorationMinutes,estimates.get(row.incident.id),`${row.incident.id} changed without maintenance or a new response assumption`);
      else estimates.set(row.incident.id,row.restorationMinutes);
    }
    if(minute<40) state=advanceSimulation(state,1);
  }
  assert.equal(estimates.size,10);
});

test("maintenance availability never appears as a second countdown", () => {
  let state=addIncident(empty(),fault({criticalAfterMinutes:40}),"Unstarted job","job");
  const first=getRankedIncidents(state)[0];
  state=advanceSimulation(state,5);
  const later=getRankedIncidents(state)[0];
  assert.equal(later.restorationMinutes,first.restorationMinutes);
  assert.equal(later.teamWaitMinutes,0);
  assert.doesNotMatch(JSON.stringify(getIncidentPresentation(later,state.minute)),/crew|maintenance available in/i);
});

test("remaining repair time decreases only after that repair is dispatched", () => {
  let state=addIncident(empty(),fault({criticalAfterMinutes:40,repairMinutes:{min:8,max:8}}),"Waiting repair","job");
  const original=getRankedIncidents(state)[0];
  state=advanceSimulation(state,2);
  assert.equal(getRankedIncidents(state)[0].restorationMinutes,original.restorationMinutes);
  state=startRepair(state,"job");
  const started=getIncidentPresentation(getRankedIncidents(state)[0],state.minute);
  state=advanceSimulation(state,2);
  const progressing=getRankedIncidents(state)[0];
  assert.equal(progressing.incident.status,"repairing");
  assert.equal(progressing.incident.repairStartedAtMinute,2);
  assert.notEqual(getIncidentPresentation(progressing,state.minute).timingLabel,started.timingLabel);
  assert.deepEqual(progressing.incident.assessment.repairMinutes,{min:8,max:8});
});
