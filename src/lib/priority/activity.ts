import { getRankedIncidents } from "./engine";
import { getIncidentPresentation, getIncidentTitle } from "./presentation";
import type { SimulationState } from "./types";

export interface LineActivity { id: string; minute: number; title: string; detail: string; incidentId: string; kind: "reported" | "repairing" | "resolved" | "priority" | "contained"; }
/** Announce a meaningful transition, never every clock tick. */
export function getLineActivity(before: SimulationState, after: SimulationState): LineActivity | null {
  const arrived = after.incidents.filter((i) => !before.incidents.some((old) => old.id === i.id));
  const changed = after.incidents.filter((i) => before.incidents.some((old) => old.id === i.id && old.status !== i.status));
  const contained = after.incidents.find(i => i.containmentConfirmedAtMinute != null && before.incidents.some(old => old.id === i.id && old.containmentConfirmedAtMinute == null));
  const ranking = getRankedIncidents(after);
  const oldRanking = getRankedIncidents(before);
  const first = ranking.find((r) => r.incident.status === "open");
  const oldFirst = oldRanking.find((r) => r.incident.status === "open");
  const tightened = first && oldFirst && first.incident.id === oldFirst.incident.id && getIncidentPresentation(first, after.minute).urgency === "critical" && getIncidentPresentation(oldFirst, before.minute).urgency !== "critical";
  const target = arrived[0] ?? changed[0] ?? contained ?? (first?.incident.id !== oldFirst?.incident.id || tightened ? first?.incident : undefined);
  if (!target) return null;
  const kind = arrived.length ? "reported" : contained?.id === target.id ? "contained" : target.status === "resolved" ? "resolved" : target.status === "repairing" ? "repairing" : "priority";
  const title = kind === "reported" ? `${arrived.length > 1 ? `${arrived.length} incidents reported` : `New incident at ${target.assessment.stationId ?? "unconfirmed station"}`}` : kind === "resolved" ? `${target.assessment.stationId} repair completed` : kind === "repairing" ? `Maintenance assigned to ${target.assessment.stationId}` : kind === "contained" ? `${target.assessment.stationId} containment confirmed` : tightened ? `${target.assessment.stationId} needs a response now` : `${target.assessment.stationId} moves to first`;
  const reviewCheckpoint = after.scenario === "demo" && arrived.length > 1;
  let detail = reviewCheckpoint ? "Simulation paused. Compare the priority order before responding." : kind === "contained" ? "Equipment isolated; repair still required. Priority reassessed." : arrived.length > 1 ? `${arrived.map(i => i.assessment.stationId ?? "Location unknown").join(" and ")} reported new problems` : kind === "priority" && first ? getIncidentPresentation(first, after.minute).timingLabel : getIncidentTitle(target.assessment);
  // Surface changes caused by the recorded action, using the same complete
  // before/after forecasts as the queue. Ordinary clock ticks stay quiet.
  if (before.minute === after.minute && (kind === "repairing" || kind === "contained")) {
    const affected = ranking.flatMap(row => {
      const old = oldRanking.find(previous => previous.incident.id === row.incident.id);
      if (row.incident.id === target.id || row.incident.status !== "open" || !old
        || row.decision.group !== 3 || old.decision.group !== 3
        || row.slackMinutes === null) return [];
      const previousWindow = old.slackMinutes === null ? null : Math.floor(Math.max(0, old.slackMinutes));
      const currentWindow = Math.floor(Math.max(0, row.slackMinutes));
      return previousWindow === null || Math.abs(currentWindow - previousWindow) >= 1
        ? [{ station: row.incident.assessment.stationId, previousWindow, currentWindow }] : [];
    })[0];
    if (affected) detail = affected.previousWindow === null
      ? `${affected.station} repair-start window recalculated: ${affected.currentWindow > 0 ? `start within ${affected.currentWindow} min` : "start now"}.`
      : `${affected.station} repair-start window changed from ${affected.previousWindow} to ${affected.currentWindow} min after this action.`;
  }
  return { id: `${after.minute}-${kind}-${target.id}`, minute: after.minute, title, detail, incidentId: target.id, kind };
}
