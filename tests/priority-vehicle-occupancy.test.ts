import assert from "node:assert/strict";
import test from "node:test";
import { advanceFactoryVehicleSlots, createFactoryVehicleSlots, VEHICLE_ENTRY_X, VEHICLE_EXIT_X, VEHICLE_SPACING } from "../src/lib/priority/factory-motion";
import { createSimulation, getStationReadings } from "../src/lib/priority/engine";
const healthy = () => getStationReadings({ ...createSimulation(), incidents: [] });

test("conveyor starts with more than three full-size vehicles and keeps admitting cars", () => {
  let slots = createFactoryVehicleSlots();
  const initial = slots.filter(x => x !== null).length;
  assert.ok(initial > 3);
  let entered = 0, exited = 0, mostVisible = initial;
  for (let frame = 0; frame < 1800; frame++) {
    const next = advanceFactoryVehicleSlots(slots, healthy(), .05, true);
    entered += next.filter((x, i) => x === VEHICLE_ENTRY_X && slots[i] !== VEHICLE_ENTRY_X).length;
    exited += next.filter((x, i) => x === null && slots[i] !== null).length;
    const positions = next.filter((x): x is number => x !== null).sort((a,b) => a-b);
    mostVisible = Math.max(mostVisible, positions.length);
    assert.ok(positions.every(x => x >= VEHICLE_ENTRY_X && x <= VEHICLE_EXIT_X));
    for (let i = 1; i < positions.length; i++) assert.ok(positions[i] - positions[i-1] >= VEHICLE_SPACING - 1e-8, "car bodies cannot overlap");
    slots = next;
  }
  assert.ok(entered > 5 && exited > 5, "the fleet continuously enters and leaves rather than deadlocking");
  assert.ok(mostVisible > initial, "occupancy can increase while space is available");
});

test("no cars enter through a stopped input, while existing downstream cars can leave", () => {
  let slots = createFactoryVehicleSlots();
  const readings = healthy().map(row => row.id === "GA-12" ? { ...row, ratePerHour: 0, state: "stopped" as const } : row);
  const initial = slots.filter(x => x !== null).length;
  for (let frame = 0; frame < 1800; frame++) {
    const next = advanceFactoryVehicleSlots(slots, readings, .05, true);
    assert.ok(next.every((x, index) => slots[index] !== null || x === null));
    slots = next;
  }
  assert.ok(slots.filter(x => x !== null).length < initial);
});

test("pause and reduced-motion input freeze the fleet, including arrivals and departures", () => {
  const slots = [null, VEHICLE_EXIT_X, 0, null];
  assert.deepEqual(advanceFactoryVehicleSlots(slots, healthy(), .05, false), slots);
  assert.deepEqual(advanceFactoryVehicleSlots(slots, healthy(), 0, true), slots);
});
