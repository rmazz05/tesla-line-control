import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation, startRepair, advanceSimulation, confirmContainment, getRankedIncidents, getStationReadings, resolveIncident } from "../src/lib/priority/engine";
import { keepsRunningDuringRepair } from "../src/lib/priority/repair";
import { compareResponseTiming, RESPONSE_DELAYS } from "../src/lib/priority/response-impact";
import { getLineActivity } from "../src/lib/priority/activity";
import { DEMO_EVENTS, scenarioEvents } from "../src/lib/priority/scenarios";

function completedDemo() {
  let state = startRepair(advanceSimulation(createSimulation("demo"), 2), "DEMO-SUPPLY");
  state = startRepair(state, "DEMO-BACKUP");
  state = confirmContainment(state, "DEMO-VIBRATION");
  state = startRepair(state, "DEMO-VIBRATION");
  return advanceSimulation(state, 7);
}

test("focused demo uses the same rules: injury history moves a running machine ahead of production faults", () => {
  let state = createSimulation("demo");
  assert.equal(state.buffers[0], 12);
  state = advanceSimulation(state, 2);
  assert.equal(getRankedIncidents(state).find(row => row.incident.id === "DEMO-SUPPLY")!.slackMinutes, 5.5);
  const ranked = getRankedIncidents(state);
  assert.equal(state.incidents.length, 3);
  assert.equal(ranked[0].incident.id, "DEMO-VIBRATION");
  assert.equal(ranked[0].decision.evidence.injuryCases, 2);
  assert.equal(ranked[0].stationReading?.state, "running");
  state = advanceSimulation(state, 40);
  assert.equal(state.incidents.length, 3, "shift events do not leak into the focused demo");
  assert.equal(scenarioEvents().length, 10, "full shift is retained");
});

test("only an explicit authored isolated-backup intervention preserves output during repair", () => {
  let state = advanceSimulation(createSimulation("demo"), 4);
  state = startRepair(state, "DEMO-BACKUP");
  assert.equal(getStationReadings(state).find(r => r.id === "GA-32")!.ratePerHour, 54);
  const backup = DEMO_EVENTS[1].assessment;
  assert.equal(keepsRunningDuringRepair(backup), true);
  assert.equal(keepsRunningDuringRepair({ ...backup, source: "openai" }), false);
  assert.equal(keepsRunningDuringRepair({ ...backup, repairMode: undefined }), false);
  assert.equal(keepsRunningDuringRepair({ ...backup, safety: "suspected" }), false);
  assert.equal(keepsRunningDuringRepair({ ...backup, verifiedControl: "independent-check" }), false);
  state = confirmContainment(state, "DEMO-BACKUP");
  assert.equal(getStationReadings(state).find(r => r.id === "GA-32")!.ratePerHour, 0, "confirmed isolation overrides backup plan");
});

test("prompt action can preserve finished output without eliminating necessary station repair holds", () => {
  const state = completedDemo();
  assert.equal(state.stoppedMinutes, 0);
  assert.ok(state.incidents.every(i => i.status === "resolved"));
  assert.equal(state.incidents.find(i => i.id === "DEMO-VIBRATION")!.repairCompletesAtMinute, 7.5);
});

test("response sensitivity includes recovery and all repairs, and never invents containment", () => {
  const state = completedDemo();
  const copy = JSON.stringify(state);
  const rows = RESPONSE_DELAYS.map(delay => compareResponseTiming(state, delay)!);
  assert.ok(rows.every(row => row.horizon === rows[0].horizon));
  assert.ok(rows.every(row => row.actual.unresolved === 0 && row.delayed.unresolved === 0));
  assert.ok(rows.every(row => row.actual.produced === rows[0].actual.produced));
  assert.equal(rows[0].outputDifference, 0, "short delays genuinely absorbed by stock remain zero");
  assert.ok(rows[2].outputDifference > 0, "longer deferral reaches finished output");
  assert.equal(rows[0].containments[0].actual, 0);
  assert.equal(rows[0].containments[0].delayed, 10);
  const recovered = advanceSimulation(state, rows[0].horizon - state.minute);
  assert.ok(Math.abs(rows[0].actual.produced - recovered.producedUnits) < 1e-7, "replay matches the actual run through recovery");
  assert.ok(Math.abs(rows[0].actual.stopped - recovered.stoppedMinutes) < 1e-7);
  assert.equal(JSON.stringify(state), copy, "comparison cannot alter live decisions");
  const same = compareResponseTiming(state, 0)!;
  assert.deepEqual(same.actual, same.delayed);
  const unconfirmed = { ...state, incidents: state.incidents.map(i => ({ ...i, containmentConfirmedAtMinute: null })) };
  assert.deepEqual(compareResponseTiming(unconfirmed)!.containments, []);
});

test("results wait for completion and faithfully replay manual releases without pretending a timed repair", () => {
  const open = createSimulation("demo");
  assert.equal(compareResponseTiming(open), null);
  let manual = advanceSimulation(open, 3);
  for (const incident of manual.incidents) manual = resolveIncident(manual, incident.id);
  assert.equal(compareResponseTiming(manual)!.manualReleases, 3);
  assert.throws(() => compareResponseTiming(manual, -10));
});


test("opening and resetting the focused demo starts healthy, and the all three reports arrive together only at their scheduled time", () => {
  for (let reset = 0; reset < 2; reset++) {
    const initial = createSimulation("demo");
    assert.deepEqual(initial.incidents, []);
    assert.deepEqual(getRankedIncidents(initial), []);
    assert.ok(getStationReadings(initial).every(reading => reading.state === "running" && reading.ratePerHour === 60));
    const before = advanceSimulation(initial, 1.99);
    assert.deepEqual(before.incidents, []);
    const arrived = advanceSimulation(before, .01);
    assert.equal(arrived.incidents.length, 3);
    assert.equal(arrived.incidents[0].id, "DEMO-SUPPLY");
    assert.ok(arrived.incidents.every(incident => incident.reportedAtMinute === 2 && incident.status === "open"));
    assert.deepEqual(getRankedIncidents(arrived).map(row => row.incident.id), ["DEMO-VIBRATION", "DEMO-SUPPLY", "DEMO-BACKUP"]);
    assert.equal(arrived.buffers[0], 12);
  }
});


test("instant response to the first-ranked incident leaves two concurrent production decisions", () => {
  const batch = advanceSimulation(createSimulation("demo"), 2);
  const first = getRankedIncidents(batch)[0];
  const responding = startRepair(confirmContainment(batch, first.incident.id), first.incident.id);
  const waiting = getRankedIncidents(responding).filter(row => row.incident.status === "open");
  assert.deepEqual(waiting.map(row => row.incident.id), ["DEMO-SUPPLY", "DEMO-BACKUP"]);
  assert.equal(responding.incidents.filter(incident => incident.status === "repairing").length, 1);
  assert.ok(responding.incidents.every(incident => incident.reportedAtMinute === 2));
});


test("response activity exposes a changed window for another incident without inventing a new rank", () => {
  const before = advanceSimulation(createSimulation("demo"), 2);
  const after = startRepair(before, "DEMO-VIBRATION");
  const oldSupply = getRankedIncidents(before).find(item => item.incident.id === "DEMO-SUPPLY")!;
  const newSupply = getRankedIncidents(after).find(item => item.incident.id === "DEMO-SUPPLY")!;
  const activity = getLineActivity(before, after)!;
  assert.equal(activity.kind, "repairing");
  assert.match(activity.detail, /GA-12 repair-start window changed/);
  assert.ok(activity.detail.includes(`from ${Math.floor(oldSupply.slackMinutes!)} to ${Math.floor(newSupply.slackMinutes!)} min`));
  assert.equal(getLineActivity(after, advanceSimulation(after, .01)), null);
});


test("a known repair completion restores a finite forecast after an indefinite containment hold", () => {
  const contained = confirmContainment(advanceSimulation(createSimulation("demo"), 2), "DEMO-VIBRATION");
  const repairing = startRepair(contained, "DEMO-VIBRATION");
  const activity = getLineActivity(contained, repairing)!;
  assert.match(activity.detail, /GA-12 repair-start window recalculated: start within/);
  assert.doesNotMatch(activity.detail, /from null|NaN|Infinity/);
});
