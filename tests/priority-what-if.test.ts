import assert from "node:assert/strict";
import test from "node:test";
import { addIncident, applyWhatIfChange, compareWhatIf, createSimulation, startRepair } from "../src/lib/priority/engine";
import { CATALOG } from "../src/lib/priority/catalog";
import { STATIONS } from "../src/lib/priority/config";

const repair = {kind:"repair",incidentId:"SIM-01",delayMinutes:null} as const;

test("a paired repair forecast propagates depleted stock downstream without revealing future alarms", () => {
  const state = createSimulation();
  const before = JSON.stringify(state);
  const result = compareWhatIf(state,repair);
  assert.equal(JSON.stringify(state),before,"forecast must not mutate the live snapshot");
  assert.equal(result.baseline.frames.at(-1)!.produced,45);
  assert.equal(result.alternative.frames.at(-1)!.produced,40);
  assert.equal(result.outputDifference,-5);
  assert.equal(result.stoppedDifference,5);
  assert.deepEqual(result.alternative.events.map(e=>[e.stationId,e.elapsed]),[
    ["GA-12",20],["GA-18",24],["GA-24",27],["GA-28",30],["GA-32",34],["GA-36",37],["EOL-41",39],["EOL-45",40],
  ]);
  for(const branch of [result.baseline,result.alternative]) {
    assert.equal(branch.frames.length,46);
    branch.frames.forEach((frame,i)=>{
      assert.equal(frame.elapsed,i);
      assert.equal(frame.state.minute,state.minute+i);
      assert.deepEqual(frame.state.injectedEventIds,state.injectedEventIds);
      assert.deepEqual(frame.state.incidents.map(i=>i.id),["SIM-01"]);
      frame.state.buffers.forEach((units,j)=>assert.ok(units>=0&&units<=STATIONS[j].bufferCapacity));
    });
  }
  assert.equal(result.alternative.frames.at(-1)!.state.incidents[0].status,"open");
});

test("zero delay produces identical futures, while a delayed repair starts at its eligible time", () => {
  const state=createSimulation();
  const identical=compareWhatIf(state,{...repair,delayMinutes:0});
  assert.deepEqual(identical.baseline.frames,identical.alternative.frames);
  const delayed=compareWhatIf(state,{...repair,delayMinutes:25});
  assert.equal(delayed.baseline.frames[0].state.incidents[0].repairStartedAtMinute,0);
  assert.equal(delayed.alternative.frames.at(-1)!.state.incidents[0].repairStartedAtMinute,25);
  assert.equal(delayed.alternative.frames[24].state.incidents[0].status,"open");
});

test("committed repairs are preserved while another repair is deliberately deferred", () => {
  let state=createSimulation();
  state=addIncident(state,CATALOG.find(c=>c.id==="glass-servo")!.assessment,"Glass repair","glass");
  state=startRepair(state,"glass");
  const committed=state.incidents.find(i=>i.id==="glass")!;
  const result=compareWhatIf(state,{...repair,delayMinutes:30});
  for(const branch of [result.baseline,result.alternative]) {
    const projected=branch.frames[0].state.incidents.find(i=>i.id==="glass")!;
    assert.equal(projected.assignedTeamId,committed.assignedTeamId);
    assert.equal(projected.repairCompletesAtMinute,committed.repairCompletesAtMinute);
    const finished=branch.frames.at(-1)!.state.incidents.find(i=>i.id==="glass")!;
    assert.equal(finished.resolvedAtMinute,committed.repairCompletesAtMinute);
  }

});

test("stock assumptions change only the selected buffer and can alter the downstream result", () => {
  const state=createSimulation();
  const result=compareWhatIf(state,{kind:"buffer",stationId:"GA-12",units:0});
  assert.equal(result.outputDifference,0,"downstream stock absorbs a short upstream interruption");
  assert.equal(result.alternative.frames[0].readings[0].state,"starved");
  assert.equal(result.baseline.frames[0].readings[0].state,"running");
  assert.equal(result.alternative.frames[0].state.buffers[0],0);
  assert.deepEqual(result.alternative.frames[0].state.buffers.slice(1),state.buffers.slice(1));
  const same=compareWhatIf(state,{kind:"buffer",stationId:"GA-12",units:state.buffers[0]});
  assert.equal(same.outputDifference,0);
  assert.equal(same.stoppedDifference,0);
});

test("safety deferral and unverified repairs cannot be simulated as repair choices", () => {
  const initial=createSimulation();
  const safety=addIncident(initial,{...initial.incidents[0].assessment,safety:"suspected"},"Danger","unsafe");
  assert.throws(()=>compareWhatIf(safety,{...repair,incidentId:"unsafe"}),/Safety concerns/);
  const unknown=addIncident(initial,{...initial.incidents[0].assessment,needsReview:true},"Unclear","unknown");
  assert.throws(()=>compareWhatIf(unknown,{...repair,incidentId:"unknown"}),/established repair/);
  assert.throws(()=>compareWhatIf(initial,{...repair,incidentId:"absent"}),/established repair/);
});

test("preview validation rejects invalid durations and inventory", () => {
  const state=createSimulation();
  for(const units of [-1,25,NaN,Infinity]) assert.throws(()=>compareWhatIf(state,{kind:"buffer",stationId:"GA-12",units}),/buffer capacity/);
  for(const delayMinutes of [-1,61,NaN,Infinity]) assert.throws(()=>compareWhatIf(state,{...repair,delayMinutes}),/delay between/);
  for(const horizon of [0,61,NaN,Infinity]) assert.throws(()=>compareWhatIf(state,repair,horizon),/forecast between/);
});

test("fractional horizons and repair boundaries remain synchronized across futures", () => {
  const result=compareWhatIf(createSimulation(),{...repair,delayMinutes:2.4},6.7);
  assert.deepEqual(result.baseline.frames.map(f=>f.elapsed),[0,1,2,3,4,5,6,6.7]);
  assert.deepEqual(result.alternative.frames.map(f=>f.elapsed),result.baseline.frames.map(f=>f.elapsed));
  assert.equal(result.alternative.frames.at(-1)!.state.incidents[0].repairStartedAtMinute,2.4);
});

test("applying a decision preserves live time and future arrivals rather than committing a forecast", () => {
  const state=createSimulation();
  compareWhatIf(state,repair);
  for(const change of [repair,{kind:"buffer",stationId:"GA-12",units:4}] as const) {
    const applied=applyWhatIfChange(state,change);
    assert.equal(applied.minute,state.minute);
    assert.equal(applied.producedUnits,state.producedUnits);
    assert.deepEqual(applied.injectedEventIds,state.injectedEventIds);
    assert.equal(applied.incidents.length,state.incidents.length);
  }
  assert.equal(applyWhatIfChange(state,repair).incidents[0].status,"repairing");
});
