import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { addIncident, advanceSimulation, createSimulation, getRankedIncidents } from "../src/lib/priority/engine";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import { getRankingReason } from "../src/lib/priority/ranking-reason";
import { getIncidentPresentation } from "../src/lib/priority/presentation";
import type { FaultAssessment } from "../src/lib/priority/types";
const isolated=()=>({...createSimulation(),incidents:[],previousOrder:[],rankChanges:[],injectedEventIds:SCENARIO_EVENTS.map(event=>event.id)});
const fault=(catalogId:string,changes:Partial<FaultAssessment>={})=>({...CATALOG.find(item=>item.id===catalogId)!.assessment,...changes});

test("a long repair with a deeply negative window does not outrank production stopped now",()=>{
  let state=addIncident(isolated(),fault("cockpit-locator",{catalogId:null,capacityFactor:1,criticalAfterMinutes:10,repairMinutes:{min:40,max:40}}),"Future hold","future");
  state=addIncident(state,fault("final-gate-camera",{capacityFactor:0,repairMinutes:{min:2,max:2}}),"Stopped","stop");
  const rows=getRankedIncidents(state);
  assert.deepEqual(rows.map(row=>row.incident.id),["stop","future"]);
  assert.ok(rows.every(row=>getIncidentPresentation(row,0).timingLabel==="Start now"));
  assert.match(getRankingReason(rows[0],rows),/Production stopped.*current production effect/);
});

test("equal start-now slowdowns prioritize the larger visible production loss, not repair length",()=>{
  let state=addIncident(isolated(),fault("final-gate-camera",{capacityFactor:.7,repairMinutes:{min:40,max:40}}),"30% slower","mild");
  state=addIncident(state,fault("glass-servo",{capacityFactor:.4,repairMinutes:{min:2,max:2}}),"60% slower","severe");
  // Fill the input to the next station so the slowdown has an immediate effect on upstream flow.
  state={...state,buffers:state.buffers.map((n,index)=>index===2?6:n)};
  const rows=getRankedIncidents(state);
  assert.equal(rows[0].incident.id,"severe");
  assert.match(getRankingReason(rows[0],rows),/60% slower.*size of production slowdown/);
});

test("positive start windows and the visible comparison agree",()=>{
  const state=advanceSimulation(createSimulation(),2);
  const rows=getRankedIncidents(state);
  assert.match(getRankingReason(rows[0],rows),/55% slower.*time left to start/);
});

test("same-time ties are explained as stable ordering, not a made-up difference in urgency",()=>{
  let state=addIncident(isolated(),fault("cockpit-locator",{capacityFactor:1}),"First","A");
  state=addIncident(state,fault("cockpit-locator",{capacityFactor:1}),"Second","B");
  const rows=getRankedIncidents(state);
  assert.match(getRankingReason(rows[0],rows),/Equal decision factors/);
  assert.doesNotMatch(getRankingReason(rows[0],rows),/reported earlier/);
});
