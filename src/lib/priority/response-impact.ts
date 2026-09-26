import { addIncident, advanceSimulation, confirmContainment, createSimulation, resolveIncident, startRepair } from "./engine";
import { estimatedRepairMinutes } from "./repair";
import { scenarioEvents } from "./scenarios";
import type { PriorityIncident, SimulationState } from "./types";

export const RESPONSE_DELAYS = [10, 20, 30] as const;
type Action = { minute: number; kind: "report" | "contain" | "repair" | "release"; incident: PriorityIncident };

/** Replay observed decisions, never fabricate a competing policy or future fault.
 * A common recovery horizon includes every delayed completion plus 60 minutes
 * for finite-buffer effects to reach the line exit. */
export function compareResponseTiming(snapshot: SimulationState, delayMinutes = 10) {
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0 || delayMinutes > 30) throw new Error("Response delay must be between 0 and 30 minutes");
  if (!snapshot.incidents.length || snapshot.incidents.some(i => i.status !== "resolved")) return null;
  const actions: Action[] = [];
  for (const incident of snapshot.incidents) {
    actions.push({ minute: incident.reportedAtMinute, kind: "report", incident });
    if (incident.containmentConfirmedAtMinute != null) actions.push({ minute: incident.containmentConfirmedAtMinute, kind: "contain", incident });
    if (incident.repairStartedAtMinute !== null) actions.push({ minute: incident.repairStartedAtMinute, kind: "repair", incident });
    const completedNormally = incident.repairStartedAtMinute !== null && incident.resolvedAtMinute !== null
      && incident.resolvedAtMinute >= incident.repairStartedAtMinute + estimatedRepairMinutes(incident.assessment) - 1e-7;
    if (!completedNormally && incident.resolvedAtMinute !== null) actions.push({ minute: incident.resolvedAtMinute, kind: "release", incident });
  }
  const horizon = Math.ceil(Math.max(snapshot.minute, ...snapshot.incidents.map(i => i.resolvedAtMinute ?? snapshot.minute)) + 30 + 60);
  function replay(delay: number) {
    const initial = createSimulation(snapshot.scenario);
    let state: SimulationState = { ...initial, incidents: [], previousOrder: [], rankChanges: [], autoDispatch: false,
      injectedEventIds: scenarioEvents(snapshot.scenario).map(event => event.id) };
    const sequence = actions.map(action => ({ ...action, minute: action.minute + (action.kind === "report" ? 0 : delay) }))
      .sort((a, b) => a.minute - b.minute || ["report", "contain", "repair", "release"].indexOf(a.kind) - ["report", "contain", "repair", "release"].indexOf(b.kind));
    for (const action of sequence) {
      state = advanceSimulation(state, action.minute - state.minute);
      switch (action.kind) {
        case "report": state = addIncident(state, action.incident.assessment, action.incident.reportText, action.incident.id); break;
        case "contain": state = confirmContainment(state, action.incident.id); break;
        case "repair": state = startRepair(state, action.incident.id); break;
        case "release": state = resolveIncident(state, action.incident.id); break;
      }
    }
    // advanceSimulation bounds each request to 120 simulated minutes.
    while (state.minute < horizon - 1e-7) state = advanceSimulation(state, Math.min(120, horizon - state.minute));
    return { produced: state.producedUnits, lost: state.lostUnits, stopped: state.stoppedMinutes,
      unresolved: state.incidents.filter(i => i.status !== "resolved").length };
  }
  const actual = replay(0), delayed = replay(delayMinutes);
  const containments = snapshot.incidents.filter(i => i.containmentConfirmedAtMinute != null).map(i => ({
    station: i.assessment.stationId,
    actual: i.containmentConfirmedAtMinute! - i.reportedAtMinute,
    delayed: i.containmentConfirmedAtMinute! - i.reportedAtMinute + delayMinutes,
  }));
  return { actual, delayed, horizon, delayMinutes, containments, manualReleases: actions.filter(a => a.kind === "release").length,
    outputDifference: actual.produced - delayed.produced, stoppedDifference: delayed.stopped - actual.stopped };
}
