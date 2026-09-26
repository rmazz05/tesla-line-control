import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/lib/priority/catalog";
import { scenarioEvents } from "../src/lib/priority/scenarios";
import { ACKNOWLEDGMENT_MINUTES, areaIsHeld, getAttentionPlan, getSupervisorRanking, supervisorHandover } from "../src/lib/priority/attention";
import { acknowledgeResponse, addHandoverNote, addIncident, advanceSimulation, confirmContainment, confirmIncidentLocation, confirmProductContainment, createSimulation, focusSupervisorAction, getRankedIncidents, getStationReadings, recordInvestigationReturn, recordResponseUpdate, requestResponse, resolveIncident, restartArea, setAutoDispatch, startRepair, verifyResponse } from "../src/lib/priority/engine";
import type { FaultAssessment, SimulationState } from "../src/lib/priority/types";

function fresh() {
  const state = createSimulation("demo", true);
  state.injectedEventIds = scenarioEvents("demo").map(e => e.id);
  return state;
}
function report(state: SimulationState, catalog: string, id = catalog, overrides: Partial<FaultAssessment> = {}) {
  return addIncident(state, { ...CATALOG.find(c => c.id === catalog)!.assessment, ...overrides }, "Observed test report", id);
}
function plan(state: SimulationState) { return getAttentionPlan(state, getRankedIncidents(state)); }

test("personnel concerns hold every station, freeze inventory and need an explicit area restart", () => {
  const state = report(fresh(), "battery-guard");
  assert.equal(areaIsHeld(state), true);
  assert.ok(getStationReadings(state).every(r => r.ratePerHour === 0));
  const later = advanceSimulation(state, 3);
  assert.deepEqual(later.buffers, state.buffers);
  assert.equal(later.producedUnits, 0);
  assert.equal(restartArea(state, true), state);
  const contained = confirmContainment(later, "battery-guard");
  assert.equal(areaIsHeld(contained), true);
  assert.equal(restartArea(contained, false), contained);
  const restarted = restartArea(contained, true);
  assert.equal(areaIsHeld(restarted), false);
  assert.equal(getStationReadings(restarted).find(r => r.id === "GA-28")!.ratePerHour, 0);
  assert.equal(state.incidents[0].containmentConfirmedAtMinute, undefined);
});

test("historical personnel concerns also hold the modeled area without inventing a time to injury", () => {
  const state = report(fresh(), "cockpit-locator");
  assert.equal(areaIsHeld(state), true);
  assert.equal(plan(state).next?.kind, "contain");
  assert.equal(getRankedIncidents(state)[0].criticalInMinutes, null);
});

test("contained product and isolated equipment are different controls", () => {
  const state = report(fresh(), "fluid-meter-drift");
  assert.ok(areaIsHeld(state));
  assert.equal(confirmProductContainment(state, "fluid-meter-drift", false), state);
  const product = restartArea(confirmProductContainment(state, "fluid-meter-drift", true), true);
  const isolated = restartArea(confirmContainment(state, "fluid-meter-drift"), true);
  assert.ok(getStationReadings(product).find(r => r.id === "GA-36")!.ratePerHour > 0);
  assert.equal(getStationReadings(isolated).find(r => r.id === "GA-36")!.ratePerHour, 0);
  const safety = report(fresh(), "battery-guard");
  assert.equal(confirmProductContainment(safety, "battery-guard", true), safety);
});

test("restart remains blocked until every independent protection concern is contained", () => {
  const state = report(report(fresh(), "battery-guard"), "fluid-meter-drift");
  const partly = confirmContainment(state, "battery-guard");
  assert.equal(restartArea(partly, true), partly);
  const fully = confirmProductContainment(partly, "fluid-meter-drift", true);
  assert.equal(areaIsHeld(restartArea(fully, true)), false);
});

test("a request is not acknowledgment and repeated requests cannot reset the response clock", () => {
  const state = report(fresh(), "body-feed-interruption");
  const requested = requestResponse(state, "body-feed-interruption");
  assert.equal(requested.incidents[0].status, "open");
  assert.equal(requested.incidents[0].response!.owner, null);
  assert.equal(startRepair(requested, "body-feed-interruption"), requested);
  assert.equal(setAutoDispatch(requested, true), requested);
  const later = advanceSimulation(requested, 1);
  assert.equal(requestResponse(later, "body-feed-interruption"), later);
  assert.equal(later.incidents[0].response!.checkpointAt, ACKNOWLEDGMENT_MINUTES);
  assert.equal(plan(later).awaiting.length, 1);
  const overdue = advanceSimulation(later, 1);
  assert.equal(plan(overdue).next!.kind, "follow-up");
  assert.equal(acknowledgeResponse(overdue, "body-feed-interruption", " "), overdue);
});

test("named acknowledgment starts known work; completion waits for explicit verification", () => {
  const state = requestResponse(report(fresh(), "body-feed-interruption"), "body-feed-interruption");
  const accepted = acknowledgeResponse(state, "body-feed-interruption", "Alex");
  assert.equal(accepted.incidents[0].status, "repairing");
  assert.equal(plan(accepted).monitoring.length, 1);
  assert.equal(accepted.incidents[0].response!.team, "Material flow");
  const returned = advanceSimulation(accepted, 8);
  assert.equal(returned.incidents[0].status, "repairing");
  assert.notEqual(returned.incidents[0].response!.readyAt, null);
  assert.equal(plan(returned).next!.kind, "verify-return");
  assert.equal(resolveIncident(returned, "body-feed-interruption"), returned);
  assert.equal(verifyResponse(returned, "body-feed-interruption", false, "Checks completed"), returned);
  assert.equal(verifyResponse(returned, "body-feed-interruption", true, ""), returned);
  const closed = verifyResponse(returned, "body-feed-interruption", true, "Transfer verified under the established checks");
  assert.equal(closed.incidents[0].status, "resolved");
  assert.equal(plan(closed).actions.length, 0);
  assert.equal(state.incidents[0].response!.acknowledgedAt, null);
  assert.equal(accepted.incidents[0].response!.readyAt, null);
});

test("hazard acknowledgment cannot start repair or bypass protection; containment makes the next action available", () => {
  let state = report(fresh(), "battery-guard");
  state = acknowledgeResponse(requestResponse(state, "battery-guard"), "battery-guard", "Casey");
  assert.equal(state.incidents[0].status, "open");
  assert.equal(plan(state).next!.kind, "contain");
  assert.equal(startRepair(state, "battery-guard"), state);
  state = confirmContainment(state, "battery-guard");
  assert.ok(plan(state).actions.some(a => a.title === "Start the acknowledged response"));
  state = startRepair(state, "battery-guard");
  state = advanceSimulation(state, 8);
  state = verifyResponse(state, "battery-guard", true, "Qualified return checks complete");
  assert.equal(state.incidents[0].status, "resolved");
  assert.equal(areaIsHeld(state), true);
  assert.equal(areaIsHeld(restartArea(state, true)), false);
});

test("an unknown report can be owned and investigated without fabricated repair or recovery", () => {
  let state = report(fresh(), "reported-mechanical-jam", "unknown", { kind: "unknown", needsReview: true, catalogId: null, stationId: null, repairMinutes: { min: 0, max: 0 } });
  state = acknowledgeResponse(requestResponse(state, "unknown"), "unknown", "Taylor");
  assert.equal(state.incidents[0].status, "open");
  assert.equal(state.incidents[0].repairCompletesAtMinute, null);
  assert.equal(plan(state).monitoring.length, 1);
  state = recordInvestigationReturn(state, "unknown", "Responsible team inspected the reported condition");
  assert.equal(plan(state).next!.kind, "verify-return");
  assert.equal(verifyResponse(state, "unknown", true, "Established checks confirm the reported condition resolved").incidents[0].status, "resolved");
});

test("an unidentified hazard cannot be cleared through an investigation or guessed location", () => {
  let state = report(fresh(), "battery-guard", "unknown", { kind: "unknown", needsReview: true, stationId: null, catalogId: null });
  state = acknowledgeResponse(requestResponse(state, "unknown"), "unknown", "Taylor");
  assert.equal(recordInvestigationReturn(state, "unknown", "Looks fine now"), state);
  assert.equal(confirmContainment(state, "unknown"), state);
  assert.equal(confirmIncidentLocation(state, "unknown", "GA-99", "Checked label"), state);
  state = confirmIncidentLocation(state, "unknown", "GA-28", "Operator checked the equipment identifier");
  assert.equal(state.incidents[0].assessment.needsReview, true);
  state = confirmContainment(state, "unknown");
  state = recordInvestigationReturn(state, "unknown", "Qualified team completed the guard investigation");
  assert.equal(plan(state).actions.some(a => a.kind === "verify-return"), true);
});

test("accepted work returns to attention at a missed checkpoint; a follow-up never invents acknowledgment", () => {
  let state = report(fresh(), "body-feed-interruption");
  state = requestResponse(state, "body-feed-interruption");
  state = recordResponseUpdate(state, "body-feed-interruption", "Called again; nobody has accepted", 3);
  assert.equal(state.incidents[0].response!.acknowledgedAt, null);
  assert.equal(recordResponseUpdate(state, "body-feed-interruption", "Bad ETA", NaN), state);
  state = acknowledgeResponse(state, "body-feed-interruption", "Morgan");
  state = advanceSimulation(state, 5);
  assert.equal(plan(state).next!.kind, "follow-up");
  state = recordResponseUpdate(state, "body-feed-interruption", "Repair underway; update in one minute", 1);
  assert.equal(plan(state).monitoring.length, 1);
});

test("production contact windows use the upper repair bound and disappear during an area hold", () => {
  let state = report(fresh(), "body-feed-interruption");
  const rows = getRankedIncidents(state);
  assert.equal(plan(state).next!.dueIn, Math.max(0, rows[0].criticalInMinutes! - 8 - 2 - 1));
  state = report(state, "battery-guard");
  const supply = plan(state).actions.find(a => a.incidentId === "body-feed-interruption")!;
  assert.equal(supply.dueIn, null);
  assert.match(supply.reason, /reassessed after restart/);
});

test("focus survives harmless priority changes but new personnel concerns interrupt immediately", () => {
  let state = report(fresh(), "body-feed-interruption");
  state = focusSupervisorAction(state, "body-feed-interruption:contact");
  state = report(state, "glass-servo");
  const rows = getRankedIncidents(state).map(row => ({ ...row, criticalInMinutes: row.incident.id === "glass-servo" ? 20 : 30 }));
  assert.equal(getAttentionPlan(state, rows).holdingFocus, true);
  assert.equal(getAttentionPlan(state, rows).next!.incidentId, "body-feed-interruption");
  const deadline = rows.map(row => row.incident.id === "glass-servo" ? { ...row, criticalInMinutes: 0 } : row);
  assert.equal(getAttentionPlan(state, deadline).next!.incidentId, "glass-servo");
  assert.ok(getAttentionPlan(state, deadline).interruption);
  state = report(state, "battery-guard");
  assert.equal(plan(state).next!.incidentId, "battery-guard");
  assert.ok(plan(state).interruption);
});

test("handover includes corrections and distinguishes unacknowledged, owned and returned work", () => {
  let state = report(report(fresh(), "body-feed-interruption"), "glass-servo");
  state = requestResponse(state, "body-feed-interruption");
  state = acknowledgeResponse(requestResponse(state, "glass-servo"), "glass-servo", "Jordan");
  state = addHandoverNote(state, "Temporary instruction remains in use; next shift must review");
  const text = supervisorHandover(state, getRankedIncidents(state));
  assert.match(text, /Material flow: awaiting acknowledgment/);
  assert.match(text, /Jordan \(Maintenance\)/);
  assert.match(text, /Temporary instruction remains in use/);
});

test("duplicate acknowledgment, verification and restart are idempotent", () => {
  let state = acknowledgeResponse(requestResponse(report(fresh(), "body-feed-interruption"), "body-feed-interruption"), "body-feed-interruption", "Alex");
  assert.equal(acknowledgeResponse(state, "body-feed-interruption", "Different person"), state);
  state = advanceSimulation(state, 8);
  state = verifyResponse(state, "body-feed-interruption", true, "Transfer checks complete");
  assert.equal(verifyResponse(state, "body-feed-interruption", true, "Transfer checks complete"), state);
  assert.equal(restartArea(state, true), state);
});

test("scene numbers and report labels match the attention queue, including returned and monitored work", () => {
  let state = report(report(fresh(), "body-feed-interruption"), "glass-servo");
  state = acknowledgeResponse(requestResponse(state, "glass-servo"), "glass-servo", "Robin");
  let rows = getSupervisorRanking(state, getRankedIncidents(state));
  assert.equal(rows.find(r => r.incident.id === "glass-servo")!.supervisorAction!.rank, null);
  state = advanceSimulation(state, 8);
  rows = getSupervisorRanking(state, getRankedIncidents(state));
  const actions = getAttentionPlan(state, rows).actions.filter(a => a.incidentId !== null);
  for (const [index, action] of actions.entries()) {
    const row = rows.find(r => r.incident.id === action.incidentId)!;
    assert.equal(row.rank, index + 1);
    assert.equal(row.supervisorAction!.title, action.title);
  }
  assert.equal(rows.find(r => r.incident.id === "glass-servo")!.supervisorAction!.title, "Verify the returned work");
});
