import { confirmContainment } from "../src/lib/priority/engine";
import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { STATIONS } from "../src/lib/priority/config";
import { addIncident, advanceSimulation, createSimulation, getRankedIncidents, getStationReadings, resolveIncident, runBenchmark, setAutoDispatch, startRepair } from "../src/lib/priority/engine";
import { SCENARIO_EVENTS } from "../src/lib/priority/scenarios";
import type { FaultAssessment, SimulationState } from "../src/lib/priority/types";

function assessment(id: string, changes: Partial<FaultAssessment> = {}): FaultAssessment {
  const reference = CATALOG.find((entry) => entry.id === id);
  assert.ok(reference);
  return { ...reference.assessment, ...changes };
}

function isolated(): SimulationState {
  // Mark future arrivals consumed: tests of isolated physics must not acquire
  // unrelated scripted faults while advancing their clock.
  return { ...createSimulation(), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: SCENARIO_EVENTS.map((event) => event.id) };
}

test("healthy finite buffers conserve nominal flow and inventory", () => {
  const state = isolated();
  const next = advanceSimulation(state, 30);
  assert.equal(next.producedUnits, 30);
  assert.equal(next.lostUnits, 0);
  assert.deepEqual(next.buffers, state.buffers);
  assert.equal(state.minute, 0, "public transitions must not mutate input state");
});

test("stopped external replenishment conserves all bodies and respects buffer bounds", () => {
  let state = addIncident(isolated(), assessment("body-feed-interruption"), "External feed stopped", "feed");
  const initialInventory = state.buffers.reduce((sum, count) => sum + count, 0);
  state = advanceSimulation(state, 60);
  const finalInventory = state.buffers.reduce((sum, count) => sum + count, 0);
  assert.ok(Math.abs(finalInventory + state.producedUnits - initialInventory) < 1e-6);
  state.buffers.forEach((count, index) => assert.ok(count >= 0 && count <= STATIONS[index].bufferCapacity));
  assert.equal(state.producedUnits, initialInventory);
  assert.equal(state.buffers[0], 0);
});

test("injury history overrides output-only urgency while independent checks contain quality spread", () => {
  const ranks=getRankedIncidents(advanceSimulation(createSimulation(),11.5));
  const camera=ranks.find(r=>r.incident.id==="SIM-02")!;
  const cockpit=ranks.find(r=>r.incident.id==="SIM-05")!;
  const fluid=ranks.find(r=>r.incident.id==="SIM-03")!;
  assert.equal(ranks[0].incident.id,"SIM-05");
  assert.equal(camera.criticalInMinutes,0);
  assert.equal(cockpit.decision.evidence.safetyReview,true);
  assert.equal(fluid.decision.evidence.uncontainedSpread,false);
  assert.ok(cockpit.rank<camera.rank);
  assert.match(camera.priorityReason,/Start now/);
});

test("a deadline count alone cannot promote a buffer fault over measurable production loss", () => {
  const ranks = getRankedIncidents(advanceSimulation(createSimulation(), 13));
  const feeder = ranks.find((row) => row.incident.id === "SIM-01")!;
  const camera = ranks.find((row) => row.incident.id === "SIM-02")!;
  assert.ok(feeder.delayMissedWindows > 0);
  assert.equal(feeder.delayLossUnits, 0);
  assert.ok(camera.delayLossUnits > feeder.delayLossUnits);
  assert.ok(camera.rank < feeder.rank);
});

test("a buffered fault rises above a slowdown when assembly actually runs out of bodies", () => {
  const initial = isolated();
  let state = addIncident({ ...initial, buffers: initial.buffers.map((buffer, index) => index === 0 ? buffer : 0.25) }, assessment("body-feed-interruption"), "Buffered supply fault", "feed");
  state = addIncident(state, assessment("final-gate-camera", { capacityFactor: 0.9 }), "Inspection delays", "camera");
  state = advanceSimulation(state, 17);
  const before = getRankedIncidents(state).find((row) => row.incident.id === "feed")!;
  const next = advanceSimulation(state, 3);
  const after = getRankedIncidents(next).find((row) => row.incident.id === "feed")!;
  assert.equal(before.rank, 2);
  assert.equal(before.criticalInMinutes, 3);
  assert.equal(after.criticalInMinutes, 0);
  assert.equal(after.impactEvent, "buffer_empty");
  assert.equal(after.rank, 1, "stopped work precedes slowed work when both are happening now");
  assert.deepEqual(next.injectedEventIds, state.injectedEventIds);
  assert.ok(next.incidents.every((incident) => incident.status === "open"));
});

test("a quality containment deadline raises urgency only through its projected station hold", () => {
  let state = addIncident(isolated(), assessment("fluid-meter-drift", { stationId: "EOL-45", capacityFactor: 1, criticalAfterMinutes: 9, verifiedControl: "independent-check" }), "Contained quality concern", "quality");
  const before = getRankedIncidents(state)[0];
  state = advanceSimulation(state, 5);
  const after = getRankedIncidents(state)[0];
  assert.equal(before.delayLossUnits, 0);
  assert.equal(after.criticalInMinutes, 4);
  assert.ok(after.delayLossUnits > before.delayLossUnits);
  assert.ok(after.deferredLossUnits > after.immediateLossUnits);
  assert.equal(after.incident.assessment.safety, "none", "a quality deadline never invents a personnel hazard");
});

test("downstream blockage changes feeder depletion forecast instead of aging its deadline", () => {
  let state = addIncident(isolated(), assessment("body-feed-interruption"), "Feed stopped", "feed");
  const freeFlow = getRankedIncidents(state).find((item) => item.incident.id === "feed")!.criticalInMinutes;
  assert.equal(freeFlow, 20);
  state = addIncident(state, assessment("torque-backup", { stationId: "GA-18", capacityFactor: 0 }), "Adjacent station stopped", "downstream");
  const blocked = getRankedIncidents(state).find((item) => item.incident.id === "feed")!.criticalInMinutes;
  assert.equal(blocked, null, "blocked load station stops consuming the external body buffer");
  const resumed = resolveIncident(state, "downstream");
  assert.equal(getRankedIncidents(resumed).find((item) => item.incident.id === "feed")!.criticalInMinutes, 20);
});

test("independent same-station faults compose and resolving one preserves the other", () => {
  let state = addIncident(isolated(), assessment("torque-backup", { capacityFactor: 0.5 }), "Fault one", "one");
  state = addIncident(state, assessment("torque-backup", { capacityFactor: 0.5 }), "Fault two", "two");
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-32")!.ratePerHour, 15);
  state = resolveIncident(state, "one");
  const station = getStationReadings(state).find((reading) => reading.id === "GA-32")!;
  assert.equal(station.ratePerHour, 30);
  assert.deepEqual(station.activeIncidentIds, ["two"]);
});

test("maintenance can start every reviewed incident immediately with no concurrency limit", () => {
  let state=isolated();
  for(let i=0;i<12;i++) state=addIncident(state,assessment(i%2?"glass-servo":"torque-backup"),"Another fault",`job-${i}`);
  for(let i=0;i<12;i++) {
    assert.equal(getRankedIncidents(state).find(r=>r.incident.id===`job-${i}`)!.teamWaitMinutes,0);
    state=startRepair(state,`job-${i}`);
  }
  assert.equal(state.incidents.filter(i=>i.status==="repairing").length,12);
  assert.ok(state.incidents.every(i=>i.repairStartedAtMinute===0));
  assert.equal(new Set(state.incidents.map(i=>i.assignedTeamId)).size,12);
  const completion=state.incidents[0].repairCompletesAtMinute!;
  assert.equal(startRepair(state,"job-0"),state,"dispatching twice cannot reset progress");
  state=advanceSimulation(state,completion);
  assert.equal(state.incidents[0].status,"resolved");
});

test("all available responses can work on the same fault discipline", () => {
  let state = isolated();
  // Capability metadata must not reintroduce a specialist dispatch restriction.
  state = { ...state, teams: state.teams.map((team) => ({ ...team, skills: [] })) };
  for (const id of ["one", "two", "three"]) state = addIncident(state, assessment("glass-servo"), "Another electrical fault", id);
  state = setAutoDispatch(state, true);
  assert.equal(state.incidents.filter((incident) => incident.status === "repairing").length, 3);
  assert.equal(new Set(state.incidents.map((incident) => incident.assignedTeamId)).size, 3);
});

test("other repairs cannot add maintenance delay or change an unstarted repair allowance", () => {
  let state=addIncident(isolated(),assessment("fluid-pump"),"Current repair","current");
  state=startRepair(state,"current");
  state=addIncident(state,assessment("cockpit-locator",{criticalAfterMinutes:20}),"Unstarted job","waiting");
  const before=getRankedIncidents(state).find(r=>r.incident.id==="waiting")!;
  assert.equal(before.teamWaitMinutes,0);
  assert.equal(before.slackMinutes,20-5.5);
  state=advanceSimulation(state,3);
  const after=getRankedIncidents(state).find(r=>r.incident.id==="waiting")!;
  assert.equal(after.restorationMinutes,before.restorationMinutes);
  assert.equal(after.teamWaitMinutes,0);
  assert.equal(startRepair(state,"waiting").incidents.find(i=>i.id==="waiting")!.repairStartedAtMinute,3);
});

test("unverified safety reports hold their station and outrank production without fake repair", () => {
  let state = addIncident(isolated(), assessment("body-transfer"), "Production stopped", "production");
  state = addIncident(state, assessment("reported-safety-concern", { stationId: "GA-28", kind: "unknown" }), "Person reports an unsafe guard", "hazard");
  const first = getRankedIncidents(state)[0];
  assert.equal(first.incident.id, "hazard");
  assert.match(first.whyNow, /current hazardous condition/);
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-28")!.state, "stopped");
  state = setAutoDispatch(state, true);
  assert.equal(state.incidents.find((incident) => incident.id === "hazard")!.status, "open");
  assert.equal(state.incidents.find((incident) => incident.id === "hazard")!.repairCompletesAtMinute, null);
  assert.equal(first.recommendedTeamId, null);
  assert.equal(first.slackMinutes, null);
});

test("review-required generic reports remain visible without altering assumed flow", () => {
  let state = addIncident(isolated(), assessment("reported-mechanical-jam", { stationId: "GA-18", needsReview: true }), "Unconfirmed obstruction", "review");
  state = setAutoDispatch(state, true);
  state = advanceSimulation(state, 5);
  assert.equal(state.producedUnits, 5);
  assert.equal(state.incidents[0].status, "open");
  assert.match(getRankedIncidents(state)[0].whyNow, /consequences and repair requirements are unknown/);
});

test("supply plus safety holds the station and a missing station is not claimed contained", () => {
  let state = addIncident(isolated(), assessment("body-feed-interruption", { safety: "suspected" }), "Feed issue with reported smoke", "supply-hazard");
  assert.equal(getStationReadings(state)[0].state, "stopped");
  state = addIncident(state, assessment("reported-safety-concern"), "Hazard somewhere on the line", "unlocated");
  assert.match(state.incidents.find((incident) => incident.id === "unlocated")!.history[1].text, /no station hold can be confirmed/);
});

test("unverified deterioration timer does not silently stop a reviewed station", () => {
  let state = addIncident(isolated(), assessment("cockpit-locator", { needsReview: true, criticalAfterMinutes: 1 }), "Unverified observation", "review-condition");
  state = advanceSimulation(state, 5);
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-18")!.state, "running");
  assert.equal(getRankedIncidents(state)[0].slackMinutes, null);
});

test("known station and clear generic symptoms can use explicitly synthetic assumptions", () => {
  let state = addIncident(isolated(), assessment("reported-mechanical-jam", { stationId: "GA-18" }), "Confirmed visible obstruction at cockpit station", "generic-jam");
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-18")!.state, "stopped");
  state = startRepair(state, "generic-jam");
  assert.equal(state.incidents[0].status, "repairing");
});

test("equal assessments receive strict stable ranks using incident ID", () => {
  const unknown = assessment("reported-cycle-slowdown", { stationId: null, kind: "unknown" });
  let state = addIncident(isolated(), unknown, "Second same-time report", "B");
  state = addIncident(state, unknown, "First same-time report", "A");
  const ranks = getRankedIncidents(state);
  assert.deepEqual(ranks.map((row) => row.incident.id), ["A", "B"]);
  assert.deepEqual(ranks.map((row) => row.rank), [1, 2]);
  assert.ok(ranks.every((row) => row.closeCall));
  assert.deepEqual(getRankedIncidents(advanceSimulation(state, 1)).map((row) => row.incident.id), ["A", "B"]);
});

test("counterfactual ranking cannot see future scenario arrivals", () => {
  const state = advanceSimulation(createSimulation(), 6);
  const hiddenFutureDisabled = { ...state, injectedEventIds: SCENARIO_EVENTS.map((event) => event.id) };
  const publicRank = (current: SimulationState) => getRankedIncidents(current).map(({ incident, rank, delayLossUnits, criticalInMinutes }) => ({ id: incident.id, rank, delayLossUnits, criticalInMinutes }));
  assert.deepEqual(publicRank(state), publicRank(hiddenFutureDisabled));
});

test("a new safety incident uses available shared capacity without preempting active work", () => {
  let state = addIncident(isolated(), assessment("glass-servo"), "Servo repair", "servo");
  state = startRepair(state, "servo");
  const originalEnd = state.incidents[0].repairCompletesAtMinute;
  state = addIncident(state, assessment("battery-guard"), "Guard signal mismatch", "guard");
  state = confirmContainment(state, "guard");
  state = setAutoDispatch(state, true);
  assert.ok(state.incidents.find(item => item.id === "guard"));
  assert.equal(state.incidents.find((incident) => incident.id === "servo")!.repairCompletesAtMinute, originalEnd);
  assert.equal(state.incidents.find((incident) => incident.id === "guard")!.status, "repairing");
  assert.notEqual(state.incidents.find((incident) => incident.id === "guard")!.assignedTeamId, state.incidents.find((incident) => incident.id === "servo")!.assignedTeamId);
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-28")!.state, "stopped");
});

test("a safety response starts immediately without interrupting existing repairs", () => {
  let state = isolated();
  for (const id of ["one", "two", "three"]) {
    state = addIncident(state, assessment("glass-servo"), "Existing response", id);
    state = startRepair(state, id);
  }
  const originalResponses = state.incidents.map((incident) => ({ id: incident.id, completion: incident.repairCompletesAtMinute, slot: incident.assignedTeamId }));
  state = setAutoDispatch(confirmContainment(addIncident(state, assessment("battery-guard"), "Guard signal mismatch", "guard"), "guard"), true);
  assert.equal(state.incidents.find((incident) => incident.id === "guard")!.status, "repairing");
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-28")!.state, "stopped");
  for (const original of originalResponses) {
    const incident = state.incidents.find((item) => item.id === original.id)!;
    assert.equal(incident.repairCompletesAtMinute, original.completion);
    assert.equal(incident.assignedTeamId, original.slot);
  }
});

test("a contained safety incident under repair does not occupy the waiting repair order", () => {
  let state = addIncident(isolated(), assessment("battery-guard"), "Guard signal mismatch", "guard");
  state = startRepair(state, "guard");
  state = addIncident(state, assessment("final-gate-camera"), "Camera slowdown", "camera");
  state = addIncident(state, assessment("torque-backup"), "Backup torque spindle active", "torque");
  const originalCompletion = state.incidents.find((incident) => incident.id === "guard")!.repairCompletesAtMinute;
  const ranks = getRankedIncidents(state);
  assert.deepEqual(ranks.filter((row) => row.incident.status === "open").map((row) => row.rank), [1, 2]);
  assert.equal(ranks.at(-1)!.incident.id, "guard");
  assert.match(ranks.at(-1)!.priorityReason, /Maintenance is working/);
  assert.equal(getStationReadings(state).find((station) => station.id === "GA-28")!.state, "stopped");
  assert.equal(state.incidents.find((incident) => incident.id === "guard")!.repairCompletesAtMinute, originalCompletion);
});

test("live intake remains usable after forty minutes and completion releases the resource", () => {
  let state = advanceSimulation(isolated(), 45);
  state = addIncident(state, assessment("glass-servo"), "Late judge input", "live");
  state = startRepair(state, "live");
  state = advanceSimulation(state, 20);
  assert.equal(state.incidents[0].status, "resolved");
  assert.ok(state.teams.every((team) => team.assignedIncidentId === null));
  assert.equal(advanceSimulation(state, Number.NaN), state);
  assert.equal(advanceSimulation(state, -1), state);
});

test("benchmark is deterministic and conserves the same forty-minute output opportunity", () => {
  const results = runBenchmark();
  assert.deepEqual(results, runBenchmark());
  assert.equal(results.length, 5);
  for (const row of results) {
    assert.ok(Math.abs(row.producedUnits + row.lostUnits - 40) < 0.11);
    assert.ok(row.missedWindows >= 0);
    assert.ok(row.stoppedMinutes >= 0 && row.stoppedMinutes <= 40);
  }
  // Do not assert that our planner wins. These are measured policy comparisons.
});
