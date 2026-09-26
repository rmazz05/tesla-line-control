import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { addIncident, advanceSimulation, createSimulation, getStationReadings, startRepair } from "../src/lib/priority/engine";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import { getStationEffect, getStationStatus } from "../src/lib/priority/station-effect";

function isolated() {
  return { ...createSimulation(), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: SCENARIO_EVENTS.map(event => event.id) };
}

test("healthy inspection waits for roller-test repair only after its input runs out, then resumes", () => {
  const fault = CATALOG.find(item => item.id === "roller-calibration")!.assessment;
  let state = startRepair(addIncident(isolated(), fault, "Roller fault", "roller"), "roller");
  const inspection = () => getStationReadings(state).find(reading => reading.id === "EOL-45")!;
  assert.equal(getStationStatus(inspection()).label, "Running");
  assert.equal(getStationStatus(getStationReadings(state).find(reading => reading.id === "EOL-41")!).tone, "stopped");
  state = advanceSimulation(state, 1.5);
  assert.equal(inspection().state, "starved");
  assert.deepEqual(inspection().activeIncidentIds, []);
  assert.equal(getStationStatus(inspection()).label, "Waiting for EOL-41");
  assert.equal(getStationStatus(inspection()).tone, "waiting");
  assert.equal(getStationEffect(inspection()).speedFactor, 0, "waiting still stops car motion");
  state = advanceSimulation(state, 4);
  assert.equal(getStationStatus(inspection()).label, "Running");
  assert.equal(getStationEffect(inspection()).speedFactor, 1);
});

test("a local inspection fault stays a stopped fault, while a full buffer explains upstream waiting", () => {
  const fault = { ...CATALOG.find(item => item.id === "final-gate-camera")!.assessment, capacityFactor: 0 };
  const state = advanceSimulation(addIncident(isolated(), fault, "Camera stopped", "camera"), 5);
  const readings = getStationReadings(state);
  const inspection = readings.find(reading => reading.id === "EOL-45")!;
  const roller = readings.find(reading => reading.id === "EOL-41")!;
  assert.equal(getStationStatus(inspection).label, "Stopped");
  assert.equal(getStationStatus(inspection).tone, "stopped");
  assert.equal(roller.state, "blocked");
  assert.equal(getStationStatus(roller).label, "Output held at EOL-45");
  assert.equal(getStationStatus(roller).tone, "waiting");
  assert.deepEqual(roller.activeIncidentIds, []);
});
