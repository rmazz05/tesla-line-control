import assert from "node:assert/strict";
import test from "node:test";
import { placeAttention } from "../src/lib/attention/bucket";
import { CATALOG } from "../src/lib/priority/catalog";
import { addIncident, createSimulation, getRankedIncidents, startRepair } from "../src/lib/priority/engine";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import type { FaultAssessment, RankedIncident, SimulationState } from "../src/lib/priority/types";

function isolated(): SimulationState {
  return { ...createSimulation(), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: SCENARIO_EVENTS.map((event) => event.id) };
}

function ranked(catalogId: string, changes: Partial<FaultAssessment> = {}, id = "incident"): RankedIncident {
  const assessment = CATALOG.find((entry) => entry.id === catalogId)!.assessment;
  const state = addIncident(isolated(), { ...assessment, ...changes }, "Observed event", id);
  return getRankedIncidents(state)[0];
}

test("a current safety concern stays with the supervisor", () => {
  const item = ranked("battery-guard");
  assert.deepEqual(placeAttention(item), { bucket: "needs_you", reason: "Supervisor required" });
});

test("an uncontained quality issue stays with the supervisor", () => {
  const item = ranked("roller-calibration", { verifiedControl: undefined, quality: "confirmed", capacityFactor: 0 });
  assert.equal(placeAttention(item).bucket, "needs_you");
});

test("a contacted team that has not answered stays visible as waiting", () => {
  const item = ranked("glass-servo");
  item.incident.handoff = { team: "maintenance", contactedAtMinute: 1, acknowledgedAtMinute: null };
  assert.deepEqual(placeAttention(item), { bucket: "waiting_ack", reason: "Maintenance contacted" });
});

test("an acknowledged repair is being handled, even if it still has a rank", () => {
  const item = ranked("glass-servo");
  const repairing = startRepair({ ...isolated(), incidents: [item.incident] }, item.incident.id);
  const handled = getRankedIncidents(repairing)[0];
  assert.equal(placeAttention(handled).bucket, "being_handled");
});

test("a contained production fault with time left is only monitored", () => {
  const item = ranked("torque-backup");
  assert.equal(placeAttention(item).bucket, "monitor");
});

test("resolution leaves the supervisor's active attention", () => {
  const item = ranked("glass-servo");
  item.incident.status = "resolved";
  assert.equal(placeAttention(item).bucket, "resolved");
});
