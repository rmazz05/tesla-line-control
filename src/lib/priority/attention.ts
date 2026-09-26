import { assessConsequences } from "./case-library";
import type { PriorityIncident, RankedIncident, ResponseTeam, SimulationState } from "./types";

/** Explicit demo allowances, not measured human performance or service guarantees. */
export const ACKNOWLEDGMENT_MINUTES = 2;
export const SUPERVISOR_ACTION_MINUTES = 1;
export const REVIEW_CHECKPOINT_MINUTES = 5;
export type ActionKind = "contain" | "verify-report" | "contact" | "follow-up" | "verify-return" | "restart";
export interface AttentionAction {
  id: string;
  incidentId: string | null;
  station: string;
  kind: ActionKind;
  title: string;
  reason: string;
  group: number;
  dueIn: number | null;
  key: number[];
}
export interface AttentionPlan {
  actions: AttentionAction[];
  next: AttentionAction | null;
  awaiting: PriorityIncident[];
  monitoring: PriorityIncident[];
  interruption: string | null;
  holdingFocus: boolean;
}

export function needsSupervisorAction(row: RankedIncident): boolean {
  return row.supervisorAction ? row.supervisorAction.rank !== null : row.incident.status === "open";
}

export function responseTeam(incident: PriorityIncident): ResponseTeam {
  if (incident.assessment.quality !== "none") return "Quality";
  if (incident.assessment.kind === "supply") return "Material flow";
  if (incident.assessment.needsReview || incident.assessment.kind === "unknown") return "Engineering";
  return "Maintenance";
}

export function areaBlockers(state: SimulationState): PriorityIncident[] {
  return state.incidents.filter(incident => {
    if (incident.status === "resolved") return false;
    const evidence = assessConsequences(incident);
    return evidence.safetyReview || evidence.uncontainedSpread;
  });
}

export function equipmentIsolated(incident: PriorityIncident): boolean {
  return incident.containmentConfirmedAtMinute != null && incident.containmentMode !== "product-held";
}

/** This prototype represents one supervisor area containing all eight stations. */
export function areaIsHeld(state: SimulationState): boolean {
  return !!state.supervisor && (state.supervisor.areaStopped || areaBlockers(state).length > 0);
}

export function canRestartArea(state: SimulationState): boolean {
  return !!state.supervisor?.areaStopped && areaBlockers(state).length === 0;
}

function compare(a: AttentionAction, b: AttentionAction) {
  for (let i = 0; i < a.key.length; i++) {
    if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

/** A deterministic next-action policy. No LLM scores or inferred acknowledgments.
 * Production contact windows reserve the upper catalog repair bound, one minute
 * of supervisor attention and two minutes for acknowledgment. Bounds are scenario
 * assumptions, not statistical confidence. A held area suspends those forecasts.
 */
export function getAttentionPlan(state: SimulationState, ranking: RankedIncident[]): AttentionPlan {
  const actions: AttentionAction[] = [];
  const awaiting: PriorityIncident[] = [];
  const monitoring: PriorityIncident[] = [];
  for (const row of ranking) {
    const i = row.incident;
    if (i.status === "resolved") continue;
    const e = row.decision.evidence;
    const r = i.response;
    const station = i.assessment.stationId ?? "Location unconfirmed";
    const team = r?.team ?? responseTeam(i);
    const due = areaIsHeld(state) || row.criticalInMinutes === null ? null
      : Math.max(0, row.criticalInMinutes - i.assessment.repairMinutes.max - ACKNOWLEDGMENT_MINUTES - SUPERVISOR_ACTION_MINUTES);
    const add = (kind: ActionKind, title: string, reason: string, group: number, dueIn: number | null, order = 0) => {
      actions.push({ id: `${i.id}:${kind}`, incidentId: i.id, station, kind, title, reason, group, dueIn,
        key: [group, dueIn ?? Infinity, order, i.reportedAtMinute] });
    };
    if (e.safetyReview || e.uncontainedSpread) {
      add("contain", e.safetyReview ? "Confirm area protection" : "Contain the quality problem",
        e.safetyReview ? "Area held. Confirm isolation and personnel clearance under the established procedure."
          : "Area held. Confirm affected work is contained and further spread is prevented.",
        e.safetyReview ? 0 : 1, 0, e.safetyBasis === "history" ? 1 : 0);
      continue;
    }
    if (r?.readyAt != null) {
      add("verify-return", "Verify the returned work", `${r.owner} (${r.team}) has returned the work. Check the result before releasing this incident.`, 3, 0);
    } else if (r?.acknowledgedAt != null) {
      if (i.status === "open" && !i.assessment.needsReview && i.assessment.kind !== "unknown" && i.assessment.stationId) add("contact", "Start the acknowledged response", `${r.owner} accepted the job. Protection is now confirmed; the response has not started.`, 3, due);
      else if (state.minute >= r.checkpointAt) add("follow-up", `Get an update from ${r.owner}`, `${r.team}'s agreed checkpoint has passed. Record a fresh update and next checkpoint.`, 3, 0);
      else monitoring.push(i);
    } else if (r) {
      awaiting.push(i);
      if (state.minute >= r.checkpointAt || due === 0) add("follow-up", `Obtain ${team} acknowledgment`, "A request is not ownership. No person has confirmed they are acting.", 3, 0);
    } else if (i.assessment.needsReview || i.assessment.kind === "unknown" || !i.assessment.stationId) {
      add("verify-report", "Get the missing observation", i.assessment.followUpQuestion ?? "Confirm equipment, observed condition and consequences with the responsible team.", 2, 0);
    } else {
      add("contact", `Contact ${team}`, due === null
        ? areaIsHeld(state) ? "Arrange the response while the area is held. Production timing will be reassessed after restart." : "Arrange a response; no supported contact deadline is available."
        : `Allow ${i.assessment.repairMinutes.max} min for repair, ${ACKNOWLEDGMENT_MINUTES} min for acknowledgment and ${SUPERVISOR_ACTION_MINUTES} min of your attention before the modeled impact.`, 3, due, row.decision.effectOrder);
    }
  }
  if (canRestartArea(state)) actions.push({ id: "area:restart", incidentId: null, station: "Whole area", kind: "restart", title: "Review area restart",
    reason: "Immediate concerns are contained. Confirm the established restart checks; isolated equipment remains held.", group: 3, dueIn: 0, key: [3, 0, -1, 0] });
  actions.sort(compare);
  const focus = state.supervisor?.focus;
  const focused = actions.find(action => action.id === focus?.actionId);
  const candidate = actions[0];
  let interruption: string | null = null;
  let holdingFocus = false;
  if (focused && candidate && focused !== candidate && focus && state.minute < focus.untilMinute) {
    const urgent = candidate.group < 2 || (candidate.group <= focused.group && candidate.dueIn !== null && candidate.dueIn <= focus.untilMinute - state.minute);
    if (urgent) interruption = `${candidate.title} at ${candidate.station}: ${candidate.group < 2 ? "new protection work takes precedence" : "its response window closes before your current task finishes"}.`;
    else {
      actions.splice(actions.indexOf(focused), 1);
      actions.unshift(focused);
      holdingFocus = true;
    }
  }
  return { actions, next: actions[0] ?? null, awaiting, monitoring, interruption, holdingFocus };
}

/** Queue, reports and scene markers all use the same attention decision. */
export function getSupervisorRanking(state: SimulationState, ranking: RankedIncident[]): RankedIncident[] {
  if (!state.supervisor) return ranking;
  const plan = getAttentionPlan(state, ranking);
  const actions = plan.actions.filter(a => a.incidentId !== null);
  return ranking.map(row => {
    const index = actions.findIndex(a => a.incidentId === row.incident.id);
    const action = actions[index];
    const r = row.incident.response;
    const title = action?.title ?? (r?.acknowledgedAt == null ? "Awaiting acknowledgment" : "Being handled");
    const timing = action ? action.dueIn === null ? "Timing unconfirmed" : action.dueIn <= 0 ? "Now" : `Within ${Math.floor(action.dueIn)} min`
      : r ? `Checkpoint T+${Number(r.checkpointAt.toFixed(1))} min` : "Review required";
    return { ...row, rank: index >= 0 ? index + 1 : actions.length + row.rank,
      supervisorAction: { rank: index >= 0 ? index + 1 : null, title, timing,
        reason: action?.reason ?? (r?.acknowledgedAt == null ? "No person has confirmed ownership." : `${r.owner} (${r.team}) accepted the response.`),
        urgency: action ? action.group < 2 || action.dueIn === 0 ? "critical" as const : action.group === 2 || action.dueIn === null ? "review" as const : action.dueIn <= 5 ? "warning" as const : "buffered" as const : "repairing" as const } };
  }).sort((a, b) => a.rank - b.rank);
}

/** Plain-text handover uses recorded facts, including still-unacknowledged work. */
export function supervisorHandover(state: SimulationState, ranking: RankedIncident[]): string {
  const plan = getAttentionPlan(state, ranking);
  return ["# Supervisor handover", "Synthetic demonstration — review before use.",
    `Elapsed simulation: ${state.minute.toFixed(1)} min. Area ${areaIsHeld(state) ? "held" : "released; individual station restrictions may remain"}.`,
    "## Needs attention", ...plan.actions.map(a => `- ${a.station}: ${a.title}. ${a.reason}`),
    "## Open commitments", ...state.incidents.filter(i => i.status !== "resolved").map(i => {
      const r = i.response;
      return `- ${i.assessment.stationId ?? "Unknown location"}: ${i.assessment.title}. ${!r ? "No owner confirmed." : r.acknowledgedAt === null ? `${r.team}: awaiting acknowledgment.` : `${r.owner} (${r.team}); ${r.readyAt === null ? `checkpoint T+${r.checkpointAt.toFixed(1)} min` : "returned; supervisor verification pending"}.`}${i.containmentConfirmedAtMinute != null ? ` Containment: ${i.containmentMode ?? "equipment-isolated"}.` : ""}`;
    }),
    "## Recorded decisions and corrections", ...(state.supervisor?.log ?? []).map(entry => `- T+${entry.minute.toFixed(1)}: ${entry.text}`),
  ].join("\n\n");
}
