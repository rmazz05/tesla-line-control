import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { STATIONS } from "../src/lib/priority/config";
import { addIncident, advanceSimulation, createSimulation, getRankedIncidents, getStationReadings, resolveIncident, startRepair } from "../src/lib/priority/engine";
import { advanceFactoryVehicles, FACTORY_STATION_X, VEHICLE_EXIT_X } from "../src/lib/priority/factory-motion";
import { getIncidentPresentation } from "../src/lib/priority/presentation";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import { getStationEffect } from "../src/lib/priority/station-effect";
import type { FaultAssessment } from "../src/lib/priority/types";

function isolated() {
  return {...createSimulation(), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: SCENARIO_EVENTS.map(event=>event.id)};
}
function fault(changes:Partial<FaultAssessment>={}) {
  return {...CATALOG.find(item=>item.id==="final-gate-camera")!.assessment,...changes};
}

test("a 30% production slowdown drives matching queue copy and vehicle speed",()=>{
  const state=addIncident(isolated(),fault({capacityFactor:.7}),"Camera slow","camera");
  const readings=getStationReadings(state);
  const row=getRankedIncidents(state)[0];
  assert.equal(row.stationReading?.ratePerHour,42);
  assert.equal(getIncidentPresentation(row,0).calculation,"Production running 30% slower · 5 min repair");
  assert.equal(getStationEffect(readings.at(-1)!).label,"30% slower");
  const x=FACTORY_STATION_X["EOL-45"];
  const normal=advanceFactoryVehicles([x],getStationReadings(isolated()),.05,true)[0]-x;
  const slowed=advanceFactoryVehicles([x],readings,.05,true)[0]-x;
  assert.ok(Math.abs(slowed/normal-.7)<1e-9);
  assert.ok(x<VEHICLE_EXIT_X,"vehicles must reach final inspection before leaving the scene");
});

test("stopped production freezes the affected station, while buffered upstream stations still run",()=>{
  const state=addIncident(isolated(),fault({capacityFactor:0}),"Camera stopped","camera");
  const readings=getStationReadings(state);
  assert.match(getIncidentPresentation(getRankedIncidents(state)[0],0).calculation!,/^Production stopped ·/);
  const x=FACTORY_STATION_X["EOL-45"];
  assert.equal(advanceFactoryVehicles([x],readings,.05,true)[0],x);
  assert.ok(advanceFactoryVehicles([-9.5],readings,.05,true)[0]>-9.5);
  const later=advanceSimulation(state,10);
  assert.ok(getStationReadings(later).filter(reading=>getStationEffect(reading).kind==="stopped").length>1,"full downstream buffers propagate stoppages upstream");
});

test("supply depletion changes from a future buffer deadline into stopped production",()=>{
  const supply=CATALOG.find(item=>item.id==="body-feed-interruption")!.assessment;
  const state=addIncident(isolated(),supply,"No replenishment","supply");
  assert.match(getIncidentPresentation(getRankedIncidents(state)[0],0).calculation!,/^Stored bodies last 20 min/);
  const depleted=advanceSimulation(state,20);
  assert.match(getIncidentPresentation(getRankedIncidents(depleted)[0],20).calculation!,/^Production stopped/);
  assert.equal(getStationEffect(getStationReadings(depleted)[0]).speedFactor,0);
});

test("repair stops the station; completing it restores the same production rate used by the scene",()=>{
  let state=addIncident(isolated(),fault(),"Camera fault","camera");
  state=startRepair(state,"camera");
  assert.equal(getStationEffect(getStationReadings(state).at(-1)!).kind,"stopped");
  state=advanceSimulation(state,5);
  assert.equal(state.incidents[0].status,"resolved");
  assert.equal(getStationEffect(getStationReadings(state).at(-1)!).speedFactor,1);
});

test("multiple faults use actual combined production, not an individual catalog percentage",()=>{
  let state=addIncident(isolated(),fault({capacityFactor:.7}),"First fault","one");
  state=addIncident(state,fault({capacityFactor:.5}),"Second fault","two");
  for(const row of getRankedIncidents(state)) assert.match(getIncidentPresentation(row,0).calculation!,/^Production running 65% slower/);
  state=resolveIncident(state,"one");
  assert.match(getIncidentPresentation(getRankedIncidents(state)[0],0).calculation!,/^Production running 50% slower/);
});

test("vehicle motion respects pause, stopped lead vehicles and every station's rate",()=>{
  const normal=getStationReadings(isolated());
  assert.deepEqual(advanceFactoryVehicles([0,6.1],normal,.05,false),[0,6.1]);
  const stopped=normal.map(reading=>({...reading,ratePerHour:0,state:"stopped" as const}));
  assert.deepEqual(advanceFactoryVehicles([0,6.1],stopped,.05,true),[0,6.1]);
  for(const station of STATIONS) {
    const local=normal.map(reading=>reading.id===station.id?{...reading,ratePerHour:0,state:"stopped" as const}:reading);
    const x=FACTORY_STATION_X[station.id];
    assert.equal(advanceFactoryVehicles([x],local,.05,true)[0],x);
  }
});
