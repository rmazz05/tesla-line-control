import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { addIncident, advanceSimulation, createSimulation, getRankedIncidents, startRepair } from "../src/lib/priority/engine";
import { getIncidentPresentation } from "../src/lib/priority/presentation";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import type { FaultAssessment, SimulationState } from "../src/lib/priority/types";

function isolated(): SimulationState {
  return { ...createSimulation(), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: SCENARIO_EVENTS.map((event) => event.id) };
}

function report(catalogId: string, changes: Partial<FaultAssessment> = {}) {
  const assessment = CATALOG.find((entry) => entry.id === catalogId)!.assessment;
  const state = addIncident(isolated(), { ...assessment, ...changes }, "Observed event", "incident");
  return { state, item: getRankedIncidents(state)[0] };
}

test("T2:30 clearly distinguishes current camera loss from protected body supply", () => {
  const state = advanceSimulation(createSimulation(), 2.5);
  const rows = getRankedIncidents(state);
  const camera = getIncidentPresentation(rows[0], state.minute);
  const feed = getIncidentPresentation(rows[1], state.minute);
  assert.equal(camera.title, "Camera fault is slowing final inspection");
  assert.equal(camera.timingLabel, "Start now");
  assert.equal(camera.calculation, "Production running 55% slower · 5 min repair");
  assert.equal(camera.impactLabel, "Production running 55% slower");
  assert.equal(feed.title, "Car body supply has stopped");
  assert.equal(feed.timingLabel, "Start within 11 min");
  assert.equal(feed.calculation, "Stored bodies last 17.5 min · 6.5 min repair");
  assert.equal(feed.urgency, "buffered");
  assert.deepEqual(rows.map((row) => row.rank), [1, 2], "presentation never changes the repair order");
});

test("buffer urgency includes the time required to restore supply", () => {
  const { item } = report("body-feed-interruption");
  assert.equal(getIncidentPresentation(item, 0).urgency, "buffered");
  const tight = getIncidentPresentation({ ...item, criticalInMinutes: 3, slackMinutes: -1, delayLossUnits: 0 }, 17);
  assert.equal(tight.urgency, "critical");
  assert.equal(tight.timingLabel, "Start now");
  assert.equal(getIncidentPresentation({ ...item, criticalInMinutes: 3, slackMinutes: -1, delayLossUnits: 1 }, 17).urgency, "critical");
  const blocked = getIncidentPresentation({ ...item, criticalInMinutes: null, slackMinutes: null }, 17);
  assert.equal(blocked.timingLabel, "Timing unknown");
  assert.equal(blocked.urgencyLabel, "Timing unknown", "an unknown deadline cannot promise time is available");
  assert.doesNotMatch(blocked.consequence, /keep assembly running/);
});

test("quality deadlines describe station holds, never injury or an invented safety concern", () => {
  const { state, item } = report("fluid-meter-drift", { criticalAfterMinutes: 9, verifiedControl: "independent-check" });
  const initial = getIncidentPresentation(item, 0);
  assert.equal(initial.impactLabel, "Station stops in about 9 min");
  assert.notEqual(initial.urgencyLabel, "Safety first");
  const later = advanceSimulation(state, 9);
  const held = getIncidentPresentation(getRankedIncidents(later)[0], later.minute);
  assert.equal(held.impactLabel, "Production stopped");
  assert.match(held.consequence, /held until.*readings are checked/);
  assert.doesNotMatch(JSON.stringify([initial, held]), /injury|personnel|unsafe/i);
});

test("an already held station needs repair rather than a future due-soon label", () => {
  const { state } = report("fluid-meter-drift", { criticalAfterMinutes: 9, verifiedControl: "independent-check" });
  const held = advanceSimulation(state, 9);
  const item = getRankedIncidents(held)[0];
  for (const delayLossUnits of [0, -0.5]) {
    const result = getIncidentPresentation({ ...item, delayLossUnits }, held.minute);
    assert.equal(result.urgency, "critical");
    assert.equal(result.urgencyLabel, "Start now");
    assert.equal(result.impactLabel, "Production stopped");
  }
});

test("an unlocated safety report requires containment without claiming a station is held", () => {
  const { item } = report("reported-safety-concern", { title: "Operator reports smoke near the line" });
  const result = getIncidentPresentation(item, 0);
  assert.equal(result.title, "Operator reports smoke near the line");
  assert.equal(result.urgency, "critical");
  assert.equal(result.urgencyLabel, "Safety review now");
  assert.equal(result.timingLabel, "Safety review now");
  assert.doesNotMatch(result.consequence, /station is held|confirmed hazard/);
});

test("unknown reports preserve observed language without inventing equipment or impact", () => {
  const { item } = report("reported-electrical-stop", { title: "Operator saw code Z-917", kind: "unknown", needsReview: true, stationId: null });
  assert.deepEqual(getIncidentPresentation(item, 0), {
    title: "Operator saw code Z-917",
    consequence: "Confirm the equipment before estimating its production effect.",
    urgency: "review",
    urgencyLabel: "Verify impact now",
    timingLabel: "Verify impact now",
    calculation: "Consequences unknown · verification required",
  });
});

test("generic live reports retain their observed titles across supported symptom templates", () => {
  for (const catalogId of ["reported-electrical-stop", "reported-mechanical-jam", "reported-cycle-slowdown"]) {
    const { item } = report(catalogId, { stationId: "GA-24", title: "Operator observed the glass carrier stop", source: "openai" });
    const result = getIncidentPresentation(item, 0);
    assert.equal(result.title, "Operator observed the glass carrier stop");
    assert.doesNotMatch(result.consequence, /motor failure|drive failure|electrical cause/);
  }
});

test("repairing has a distinct status and remaining time even for a safety incident", () => {
  const { state } = report("battery-guard");
  const repairing = startRepair(state, "incident");
  const item = getRankedIncidents(repairing)[0];
  const result = getIncidentPresentation(item, 1);
  assert.equal(result.urgency, "repairing");
  assert.equal(result.urgencyLabel, "In repair");
  assert.match(result.timingLabel, /^About \d+(?:\.\d+)? min remaining$/);
  assert.match(result.consequence, /station stays held/);
});

test("all ten authored incidents receive plain operator titles and physical consequences", () => {
  assert.equal(SCENARIO_EVENTS.length, 10);
  for (const event of SCENARIO_EVENTS) {
    const { item } = report(event.assessment.catalogId!);
    const result = getIncidentPresentation(item, 0);
    assert.notEqual(result.title, item.incident.assessment.title);
    assert.ok(result.consequence.length > 15);
    assert.doesNotMatch(result.title, /replenishment|servo|spindle|calibration discrepancy|camera retries/i);
    assert.doesNotMatch(result.consequence, /% capacity|5-min|lost units|slack/i);
  }
});

test("camera consequence uses its actual catalog assumption rather than a hardcoded half-rate claim", () => {
  const { item } = report("final-gate-camera", { capacityFactor: 0.9 });
  assert.doesNotMatch(getIncidentPresentation(item, 0).consequence, /half/);
});
