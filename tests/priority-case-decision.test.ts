import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import { addIncident, advanceSimulation, confirmContainment, createSimulation, getRankedIncidents, getStationReadings, resolveIncident, setAutoDispatch, startRepair } from "../src/lib/priority/engine";
import { getIncidentPresentation } from "../src/lib/priority/presentation";
import { getLineActivity } from "../src/lib/priority/activity";
import { retrieveCases } from "../src/lib/priority/case-library";
import type { FaultAssessment } from "../src/lib/priority/types";
const empty = () => ({ ...createSimulation(), incidents: [], rankChanges: [], previousOrder: [], injectedEventIds: SCENARIO_EVENTS.map(event => event.id) });
const fault = (id: string, changes: Partial<FaultAssessment> = {}) => ({ ...CATALOG.find(entry => entry.id === id)!.assessment, ...changes });

test("comparable injury history outranks stopped production even while the affected machine runs normally", () => {
  let state = addIncident(empty(), fault("final-gate-camera", { capacityFactor: 0 }), "Camera stopped", "stop");
  state = addIncident(state, fault("cockpit-locator", { capacityFactor: 1 }), "Increasing vibration", "vibration");
  const row = getRankedIncidents(state)[0];
  assert.equal(row.incident.id, "vibration");
  assert.equal(row.decision.evidence.injuryCases, 2);
  assert.equal(row.decision.evidence.cases.length, 3, "a benign historical outcome cannot average away serious injuries");
  assert.equal(row.decision.evidence.safetyBasis, "history");
  assert.equal(getIncidentPresentation(row, 0).timingLabel, "Safety review now");
  assert.equal(row.incident.assessment.safety, "none", "history is not confirmation of a present hazard");
  assert.match(row.priorityReason, /synthetic.*injury/);
});

test("equipment mismatch and unknown symptoms do not inherit unrelated injury cases", () => {
  let state = addIncident(empty(), fault("cockpit-locator", { stationId: "GA-24" }), "Vibration", "different-asset");
  state = addIncident(state, fault("cockpit-locator", { needsReview: true }), "Unknown code", "unverified");
  for (const incident of state.incidents) assert.deepEqual(retrieveCases(incident), []);
  assert.match(getRankedIncidents(state).find(r => r.incident.id === "unverified")!.priorityReason, /unknown/);
});

test("supervisor containment removes the exposure gate, stops the equipment and leaves repair open", () => {
  let state = addIncident(empty(), fault("cockpit-locator", { capacityFactor: 1 }), "Vibration", "vibration");
  state = addIncident(state, fault("fluid-meter-drift"), "Unverified fills", "quality");
  assert.equal(getRankedIncidents(state)[0].incident.id, "vibration");
  const before = state;
  state = confirmContainment(state, "vibration");
  const rows = getRankedIncidents(state);
  assert.equal(getLineActivity(before, state)?.kind, "contained");
  assert.equal(rows[0].incident.id, "quality");
  assert.equal(rows.find(r => r.incident.id === "vibration")!.decision.evidence.safetyReview, false);
  assert.equal(state.incidents[0].status, "open");
  assert.equal(before.incidents[0].containmentConfirmedAtMinute, undefined, "immutable transition");
  assert.equal(getStationReadings(state).find(r => r.id === "GA-18")!.state, "stopped");
  assert.equal(confirmContainment(state, "vibration"), state, "confirmation is idempotent");
  state = startRepair(state, "vibration");
  const completion = state.incidents[0].repairCompletesAtMinute!;
  state = advanceSimulation(state, completion);
  assert.equal(state.incidents[0].status, "resolved");
  assert.equal(state.incidents[1].status, "open", "repair never clears another fault");
});

test("auto-dispatch does not manufacture containment or resolve a safety review", () => {
  const state = setAutoDispatch(addIncident(empty(), fault("cockpit-locator"), "Vibration", "vibration"), true);
  assert.equal(state.incidents[0].status, "open");
  assert.equal(state.incidents[0].containmentConfirmedAtMinute, undefined);
  const later = advanceSimulation(state, 30);
  assert.equal(later.incidents[0].status, "open");
  assert.equal(getIncidentPresentation(getRankedIncidents(later)[0], 30).timingLabel, "Safety review now");
});

test("verified independent checks contain propagation but AI cannot assert an effective control", () => {
  const event = SCENARIO_EVENTS.find(event => event.assessment.catalogId === "fluid-meter-drift")!;
  const scenario = getRankedIncidents(addIncident(empty(), event.assessment, event.reportText))[0];
  assert.equal(scenario.decision.evidence.uncontainedSpread, false);
  const live = getRankedIncidents(addIncident(empty(), { ...event.assessment, source: "openai" }, "Checks are okay"))[0];
  assert.equal(live.decision.evidence.uncontainedSpread, true);
});

test("confirmed backup affects ordering only after equal production urgency and effect", () => {
  const base = fault("torque-backup", { capacityFactor: 0.7, criticalAfterMinutes: 0 });
  let state = addIncident(empty(), { ...base, verifiedControl: "calibrated-backup" }, "Backup", "backup");
  state = addIncident(state, { ...base, stationId: "GA-24" }, "Required operation", "required");
  assert.equal(getRankedIncidents(state)[0].incident.id, "required");
  assert.equal(getRankedIncidents(state)[1].decision.evidence.dependency, "backup");
});

test("retrieval and ranking leave input evidence untouched and containment does not erase history", () => {
  const state = addIncident(empty(), fault("cockpit-locator"), "Increasing vibration", "vibration");
  const saved = JSON.stringify(state);
  getRankedIncidents(state); getRankedIncidents(state);
  assert.equal(JSON.stringify(state), saved);
  const contained = confirmContainment(state, "vibration");
  assert.equal(getRankedIncidents(contained)[0].decision.evidence.cases.length, 3);
  assert.match(contained.rankChanges.at(-1)!.reason, /containment|New incident/);
  assert.equal(resolveIncident(contained, "vibration").incidents[0].status, "resolved");
});


test("vibration without comparable equipment history asks for verification rather than assuming low risk", () => {
  const state = addIncident(empty(), fault("reported-vibration", { stationId: "EOL-45" }), "Vibration at a different machine", "unknown-history");
  const row = getRankedIncidents(state)[0];
  assert.equal(row.decision.evidence.cases.length, 0);
  assert.equal(row.decision.group, 2);
  assert.equal(getIncidentPresentation(row, 0).timingLabel, "Verify impact now");
});
