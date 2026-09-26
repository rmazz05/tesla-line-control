import type { RankedIncident } from "@/lib/priority/types";

/** Supervisor attention, separate from the repair-order rank. */
export type AttentionBucket = "needs_you" | "waiting_ack" | "being_handled" | "monitor" | "resolved";

export interface AttentionPlacement {
  bucket: AttentionBucket;
  reason: string;
}

const TEAM_LABEL = {
  maintenance: "Maintenance",
  quality: "Quality",
  planning: "Planning",
  engineering: "Engineering",
} as const;

const LINE_STOPS = new Set(["output_stopped", "station_hold", "safety_hold"]);

/**
 * Hard stops stay with the supervisor until containment is confirmed.
 * Contacting another team stays visible until that team acknowledges.
 * Rank order is unchanged; this only chooses the attention bucket.
 */
export function placeAttention(item: RankedIncident): AttentionPlacement {
  const { incident, decision, stationReading, impactEvent } = item;
  const evidence = decision.evidence;
  const handoff = incident.handoff;
  const team = handoff ? TEAM_LABEL[handoff.team] : "The other team";
  const acknowledged = handoff?.acknowledgedAtMinute != null;

  if (incident.status === "resolved") {
    return { bucket: "resolved", reason: "No further action" };
  }
  if (evidence.safetyReview && !evidence.contained) {
    return { bucket: "needs_you", reason: "Supervisor required" };
  }
  if (evidence.uncontainedSpread && !evidence.contained) {
    return { bucket: "needs_you", reason: "Supervisor decision required" };
  }

  const lineStopped = incident.status === "open"
    && (stationReading?.state === "stopped" || LINE_STOPS.has(impactEvent));
  if (lineStopped) {
    return { bucket: "needs_you", reason: "Production is stopped" };
  }
  if (handoff?.contactedAtMinute != null && !acknowledged && incident.status === "open") {
    return { bucket: "waiting_ack", reason: `${team} contacted` };
  }
  if (incident.status === "repairing" || acknowledged) {
    return {
      bucket: "being_handled",
      reason: acknowledged ? `${team} acknowledged` : "Intervention in progress",
    };
  }
  if (incident.assessment.needsReview || decision.group <= 2) {
    return { bucket: "needs_you", reason: "Supervisor required" };
  }
  return { bucket: "monitor", reason: "No immediate supervisor action" };
}

export const ATTENTION_LABEL: Record<AttentionBucket, string> = {
  needs_you: "Needs you",
  waiting_ack: "Waiting for response",
  being_handled: "Being handled",
  monitor: "Monitor",
  resolved: "Resolved",
};
