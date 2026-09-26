import { DECISION_AXES } from "./policy";
import type { RankedIncident } from "./types";

/** Uses the exact first differing comparator field, never an AI-written justification. */
export function getRankingReason(item: RankedIncident, waiting: RankedIncident[]): string {
  const index = waiting.findIndex(row => row.incident.id === item.incident.id);
  const next = waiting[index + 1];
  const a = item.decision;
  if (item.incident.status === "repairing" || !next) return a.reason;
  const b = next.decision;
  const dimension = a.key.findIndex((value, i) => value !== b.key[i]);
  if (dimension < 0) return `${a.reason} Equal decision factors with ${next.incident.assessment.stationId}; report time, station and incident ID keep the order stable. This is not a difference in risk.`;
  return `${a.reason} Ranked above ${next.incident.assessment.stationId ?? "the next report"} by ${DECISION_AXES[dimension]}.`;
}

/** Report evidence is separate from the action and repair metrics above it. */
export function getRankingBasis(item: RankedIncident, waiting: RankedIncident[]): string {
  const { evidence } = item.decision;
  let basis: string;
  if (evidence.safetyReview) basis = evidence.safetyBasis === "history"
    ? "Comparable cases include employee injury. Current exposure is unverified, so the safety concern takes precedence over production loss."
    : "The report describes a current hazardous condition without confirmed protection. Personnel exposure takes precedence over production loss.";
  else if (evidence.uncontainedSpread) basis = "Unverified work could reach later operations. Preventing wider consequences takes precedence over a local production loss.";
  else if (item.decision.group === 2) basis = "The consequences are unverified. Missing evidence cannot justify treating this as a low-risk production fault.";
  else {
    const explanations: Record<string, string> = {
      buffer_empty: "Stored bodies cover the supply interruption until the input buffer empties.",
      output_stopped: "This fault prevents finished cars from leaving the line.",
      output_slowed: "This fault reduces the line’s finished output.",
      downstream_starved: "The restriction will leave the next operation without work.",
      upstream_blocked: "The restriction will block work at earlier operations.",
      station_hold: "The scenario requires a station hold if this fault remains unresolved.",
      safety_hold: "Containment prevents further operation until repair and verification finish.",
      no_additional_impact: evidence.dependency === "backup" ? "A calibrated backup maintains operation. Under current stock and line conditions, this fault adds no finished-output loss within the forecast horizon." : "Under current stock and line conditions, this fault adds no finished-output loss within the forecast horizon.",
      unknown: "The production deadline cannot be established from the available evidence.",
    };
    basis = explanations[item.impactEvent];
    if (evidence.dependency === "backup" && item.impactEvent !== "no_additional_impact") {
      basis = `A calibrated backup maintains operation. ${basis}`;
    }
  }
  const index = waiting.findIndex(row => row.incident.id === item.incident.id);
  const next = waiting[index + 1];
  if (!next) {
    const previous = waiting[index - 1];
    if (previous?.decision.group === 3 && item.decision.group === 3
      && Number.isFinite(item.decision.countdown) && previous.decision.countdown < item.decision.countdown) {
      return `${basis} Its repair window closes later than ${previous.incident.assessment.stationId}'s.`;
    }
    return basis;
  }
  const dimension = item.decision.key.findIndex((value, i) => value !== next.decision.key[i]);
  if (dimension < 0) return `${basis} Equal decision factors with ${next.incident.assessment.stationId}; report time and stable identifiers break the tie.`;
  if (dimension === 2 && Number.isFinite(next.decision.countdown)) {
    return `${basis} Its repair window closes before ${next.incident.assessment.stationId}'s.`;
  }
  // The consequence gate is already explained above; only add a comparison
  // when a more specific factor actually decided the order.
  return dimension === 0 ? basis : `${basis} Ahead of ${next.incident.assessment.stationId ?? "the next incident"} because of ${DECISION_AXES[dimension]}.`;
}
