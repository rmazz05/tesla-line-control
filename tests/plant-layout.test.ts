import assert from "node:assert/strict";
import test from "node:test";
import { GA_WIDTH, GA_OUTLINE, LINE_CENTER, LINE_ENTRY, LINE_EXIT, LINE_STATIONS, PLANT_BUILDINGS, CAR_PITCH, CAR_LENGTH, advancePlantVehicles, createPlantVehicleSlots, isInsideGA } from "../src/lib/priority/plant-layout";
import { createSimulation, getStationReadings } from "../src/lib/priority/engine";
const healthy = () => getStationReadings({ ...createSimulation(), incidents: [] });

test("line, vehicles and line-side access fit inside the chamfered GA footprint", () => {
  assert.equal(GA_WIDTH, 310.44);
  assert.equal(GA_OUTLINE.length, 5);
  assert.equal(isInsideGA(0,252), false, "southwest corner is cut away");
  assert.equal(isInsideGA(64,252), true);
  for (const station of LINE_STATIONS) {
    for (const x of [station.x - 8, station.x + 8]) for (const z of [LINE_CENTER[2]-12, LINE_CENTER[2]+12]) assert.ok(isInsideGA(x,z));
  }
  assert.ok(CAR_LENGTH < CAR_PITCH);
  assert.ok(LINE_STATIONS.at(-1)!.x + CAR_LENGTH/2 < LINE_EXIT);
  assert.ok(LINE_ENTRY + CAR_LENGTH/2 < LINE_STATIONS[0].x);
});

test("campus preserves source adjacency: GA south of BIW/casting, battery and drive east", () => {
  const body=PLANT_BUILDINGS.find(b=>b.id==="body")!;
  const casting=PLANT_BUILDINGS.find(b=>b.id==="casting")!;
  assert.equal(body.z+body.depth,0);
  assert.equal(casting.z+casting.depth,0);
  assert.equal(body.x+body.width,casting.x);
  const battery=PLANT_BUILDINGS.find(b=>b.id==="cell")!, drive=PLANT_BUILDINGS.find(b=>b.id==="drive")!;
  assert.ok(battery.x>GA_WIDTH && drive.x>GA_WIDTH);
  assert.equal(battery.z+battery.depth,drive.z);
});

test("representative WIP traverses every station, exits, replenishes and never overlaps", () => {
  let slots=createPlantVehicleSlots(), entries=0, exits=0;
  const readings=healthy();
  for(let frame=0;frame<7000;frame++) {
    const next=advancePlantVehicles(slots,readings,.05,true);
    entries+=next.filter((x,i)=>x===LINE_ENTRY&&slots[i]===null).length;
    exits+=next.filter((x,i)=>x===null&&slots[i]!==null).length;
    const occupied=next.filter((x):x is number=>x!==null).sort((a,b)=>a-b);
    assert.ok(occupied.every(x=>x>=LINE_ENTRY&&x<=LINE_EXIT));
    for(let i=1;i<occupied.length;i++)assert.ok(occupied[i]-occupied[i-1]>=CAR_PITCH-1e-8);
    slots=next;
  }
  assert.ok(entries>16 && exits>16);
});

test("pause/reduced motion preserve fleet; a stopped station holds its local cars", () => {
  const readings=healthy(), slots=createPlantVehicleSlots();
  assert.deepEqual(advancePlantVehicles(slots,readings,1,false),slots);
  assert.deepEqual(advancePlantVehicles(slots,readings,0,true),slots);
  const stopped=readings.map(r=>r.id==="GA-28"?{...r,state:"stopped" as const,ratePerHour:0}:r);
  const next=advancePlantVehicles([138,192,null],stopped,.05,true);
  assert.equal(next[0],138);
  assert.ok(next[1]!>192,"downstream production can continue");
});
