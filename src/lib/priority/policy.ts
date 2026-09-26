import { assessConsequences, type ConsequenceAssessment } from "./case-library";
import { getStationEffect } from "./station-effect";
import type { PriorityIncident, StationReading } from "./types";

/** Ordered decisions: no production score can offset a personnel hazard. */
export type ImpactEvent = "safety_hold" | "station_hold" | "buffer_empty" | "output_stopped" | "output_slowed" | "downstream_starved" | "upstream_blocked" | "no_additional_impact" | "unknown";
export type Urgency = "critical" | "warning" | "buffered" | "review" | "repairing";
export const PRIORITY_RULE = "People → uncontained consequences → verify unknowns → production repair windows.";
export const SOON_MINUTES = 5;
export const DECISION_AXES = ["consequence of delay", "current exposure evidence", "time left to start", "current production effect", "available alternative", "size of production slowdown"] as const;
export interface PriorityDecision {
  group: number; urgency: Urgency; label: string; countdown: number;
  effectOrder: number; reduction: number; key: number[];
  evidence: ConsequenceAssessment; reason: string; action: string; rule: string;
}

export function compareDecisions(a: PriorityDecision, b: PriorityDecision): number {
  for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1;
  return 0;
}

export function priorityDecision(incident: PriorityIncident, impact: number | null, event: ImpactEvent, slack: number | null = impact, reading: StationReading | null = null): PriorityDecision {
  const a = incident.assessment;
  const evidence = assessConsequences(incident);
  const countdown = slack === null ? Infinity : Math.max(0, Math.floor(slack + 1e-7));
  const effect = reading ? getStationEffect(reading) : null;
  const alreadyAffected = impact !== null && impact <= 0;
  const effectOrder = countdown === 0 ? alreadyAffected ? effect?.kind === "stopped" || (!effect && event !== "output_slowed") ? 0 : 1 : 2 : event === "output_slowed" ? 1 : 0;
  const reduction = countdown === 0 && alreadyAffected ? effect?.reduction ?? 0 : 0;
  let group = 3, urgency: Urgency, label: string, reason: string, rule: string;
  if (incident.status === "repairing") {
    group = 7; urgency = "repairing"; label = "In repair"; rule = "Repair in progress";
    reason = "Maintenance is working on this incident; it is outside the waiting order.";
  } else if (evidence.safetyReview) {
    group = 0; urgency = "critical"; label = "Safety review now"; rule = "R1 · Protect people";
    reason = evidence.safetyBasis === "reported" ? "A current hazardous condition is reported; effective isolation has not been confirmed. Review and contain before production-only repairs." : `${evidence.injuryCases} comparable synthetic cases involved employee injury. Current exposure and effective isolation are unconfirmed, so review this before production-only repairs.`;
  } else if (evidence.uncontainedSpread) {
    group = 1; urgency = "critical"; label = "Contain now"; rule = "R2 · Prevent wider consequences";
    reason = "Unverified work may reach later operations. No effective check or isolation is confirmed; contain the issue before it creates wider rework.";
  } else if (a.needsReview || a.kind === "unknown" || !a.stationId || (a.catalogId === "reported-vibration" && evidence.cases.length === 0)) {
    group = 2; urgency = "review"; label = "Verify impact now"; rule = "R3 · Resolve missing evidence";
    reason = "The consequences and repair requirements are unknown. Verify them before treating this report as a low-risk production fault.";
  } else {
    urgency = countdown === 0 ? "critical" : countdown <= SOON_MINUTES ? "warning" : "buffered";
    label = countdown === 0 ? "Start now" : Number.isFinite(countdown) ? `Start within ${countdown} min` : event === "no_additional_impact" ? "Monitor production" : "Timing unknown";
    if (!Number.isFinite(countdown) && event !== "no_additional_impact") urgency = "review";
    rule = "R4 · Protect production";
    reason = countdown === 0 ? `${effect && effect.kind !== "running" ? effect.description : "The repair no longer fits before the modeled production impact"}. Start now.` : Number.isFinite(countdown) ? `Start within ${countdown} min to finish repair before the modeled production impact.` : "No additional output loss is forecast within 60 minutes under current demo conditions. Reassess when conditions change.";
    if (!Number.isFinite(countdown) && event !== "no_additional_impact") reason = "The production deadline is unconfirmed. Obtain current conditions before estimating a start window.";
    if (evidence.contained) reason = `Supervisor-confirmed isolation has removed the immediate exposure from this decision. The station stays stopped and the repair remains open. ${reason}`;
  }
  // Time is a production deadline only. No deadline, loss percentage or long
  // repair can dilute the first three consequence gates.
  const productionKey = group === 3 ? [countdown, effectOrder, evidence.dependency === "backup" ? 1 : 0, -reduction] : [0, 0, 0, 0];
  return { group, urgency, label, countdown, effectOrder, reduction, evidence, reason, action: label, rule,
    key: [group, group === 0 && evidence.safetyBasis === "history" ? 1 : 0, ...productionKey] };
}

export function impactTiming(event: ImpactEvent, impact: number | null): string {
  if (event === "no_additional_impact") return "No extra impact within 60 min";
  if (impact === null || event === "unknown") return "Impact time is not known yet";
  const now = impact <= 0;
  const when = `in about ${Math.ceil(Math.max(0, impact))} min`;
  switch (event) {
    case "safety_hold": return "Station stopped for a safety check";
    case "station_hold": return now ? "Station stopped for checks" : `Station stops ${when}`;
    case "buffer_empty": return now ? "Assembly has run out of car bodies" : `Stored car bodies run out ${when}`;
    case "output_stopped": return now ? "No finished cars can leave the line" : `Finished cars stop leaving ${when}`;
    case "output_slowed": return now ? "Fewer cars are finishing now" : `Fewer cars finish ${when}`;
    case "downstream_starved": return now ? "The next station has run out of work" : `The next station runs out of work ${when}`;
    case "upstream_blocked": return now ? "Earlier stations are blocked" : `Earlier stations get blocked ${when}`;
  }
}
