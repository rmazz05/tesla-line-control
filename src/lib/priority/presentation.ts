import { keepsRunningDuringRepair } from "./repair";
import { getStationEffect } from "./station-effect";
import { impactTiming, priorityDecision } from "./policy";
import type { FaultAssessment, RankedIncident } from "./types";

export interface IncidentPresentation {
  title: string;
  consequence: string;
  urgency: "critical" | "warning" | "buffered" | "review" | "repairing";
  urgencyLabel: string;
  timingLabel: string;
  calculation?: string;
  impactLabel?: string;
}

const CATALOG_TITLES: Record<string, string> = {
  "body-feed-interruption": "Car body supply has stopped",
  "final-gate-camera": "Camera fault is slowing final inspection",
  "torque-backup": "Wheel tool is running on a slower backup",
  "glass-servo": "Glass-fitting robot keeps stopping",
  "cockpit-locator": "Dashboard-fitting equipment is vibrating",
  "fluid-meter-drift": "Fluid fill readings do not match",
  "battery-guard": "Battery lift safety guard may be faulty",
  "roller-calibration": "Vehicle test readings may be inaccurate",
  "fluid-pump": "Low pump pressure is slowing fluid filling",
  "body-transfer": "Car body transfer has stopped",
};

export function getIncidentTitle(assessment: FaultAssessment): string {
  const known = !!assessment.catalogId && Object.hasOwn(CATALOG_TITLES, assessment.catalogId);
  const verifiedMapping = !assessment.needsReview && assessment.kind !== "unknown" && assessment.stationId;
  return known && verifiedMapping ? CATALOG_TITLES[assessment.catalogId!] : assessment.title;
}

function minutes(value: number): string {
  return value > 0 && value < 1 ? "under 1 min" : `${Number(Math.max(0, value).toFixed(1))} min`;
}

/** Operator copy only. This neither changes rank nor invents an incident assessment.
 * Rate comparisons use the catalog's assumed local capacity, not measured line output.
 * Timing comes from the current connected-flow forecast, never incident age alone. */
export function getIncidentPresentation(item: RankedIncident, minute: number): IncidentPresentation {
  const { incident } = item;
  const assessment = incident.assessment;
  const decision = priorityDecision(incident, item.criticalInMinutes, item.impactEvent, item.slackMinutes, item.stationReading);
  const review = decision.group === 2 || assessment.needsReview || assessment.kind === "unknown" || !assessment.stationId;
  const title = getIncidentTitle(assessment);
  if (item.supervisorAction) return { title, consequence: item.supervisorAction.reason, urgency: item.supervisorAction.urgency, urgencyLabel: item.supervisorAction.title, timingLabel: item.supervisorAction.timing, calculation: item.supervisorAction.title };
  const safety = assessment.safety !== "none";
  const capacity = Math.round(Math.max(0, Math.min(1, assessment.capacityFactor)) * 100);
  const impact = item.criticalInMinutes;
  const timedHold = !review && (assessment.kind === "quality" || assessment.kind === "condition") && assessment.criticalAfterMinutes !== null;
  const holdNow = timedHold && minute >= incident.reportedAtMinute + assessment.criticalAfterMinutes!;

  if (incident.status === "repairing") {
    if (incident.response?.readyAt != null) return { title, consequence: "The responsible team returned the work. Supervisor verification is required before release.", urgency: "review", urgencyLabel: "Verify returned work", timingLabel: "Verification required" };
    const remaining = incident.repairCompletesAtMinute === null ? null : Math.max(0, incident.repairCompletesAtMinute - minute);
    return {
      title,
      consequence: safety ? "The station stays held while maintenance checks the safety concern." : assessment.kind === "supply" ? "Maintenance is restoring the supply of car bodies." : "Maintenance is repairing and checking the affected equipment.",
      urgency: "repairing",
      urgencyLabel: "In repair",
      timingLabel: remaining === null ? "Completion time unconfirmed" : `About ${minutes(remaining)} remaining`,
    };
  }

  if (decision.evidence.safetyReview || decision.evidence.uncontainedSpread) {
    const historyRisk = decision.evidence.safetyBasis === "history";
    return {
      title,
      consequence: historyRisk ? "Comparable cases recorded injury. Current personnel exposure and the failure mechanism still need checking." : decision.evidence.safetyReview ? "A hazardous condition is reported. Equipment isolation and personnel clearance still need confirmation." : "Verify affected work before the problem reaches later operations.",
      urgency: decision.urgency, urgencyLabel: decision.label, timingLabel: decision.action,
      calculation: historyRisk ? `${decision.evidence.injuryCases} comparable injury cases · synthetic history` : decision.evidence.safetyReview ? "Reported hazard · isolation unconfirmed" : "Unverified work can reach later operations",
    };
  }

  if (review) {
    return {
      title,
      consequence: assessment.stationId ? "The production effect and required repair need verification." : "Confirm the equipment before estimating its production effect.",
      urgency: decision.urgency,
      urgencyLabel: decision.label,
      timingLabel: decision.action,
      calculation: "Consequences unknown · verification required",
    };
  }

  let consequence: string;
  switch (assessment.catalogId) {
    case "body-feed-interruption":
      consequence = impact !== null && impact <= 0 ? "Stored car bodies can no longer cover the supply stop." : impact === null ? item.impactEvent === "no_additional_impact" ? "Stored bodies are not currently limiting production." : "Supply has stopped; how long stored bodies will last is uncertain." : "Stored car bodies keep assembly running.";
      break;
    case "final-gate-camera": consequence = capacity <= 0 ? "Final inspection cannot process cars until the camera problem is fixed." : capacity < 50 ? "Cars leave final inspection at less than half the normal rate." : "Camera delays reduce how quickly finished cars can leave the line."; break;
    case "torque-backup": consequence = "The backup tool tightens wheels more slowly."; break;
    case "glass-servo": consequence = "Repeated stops delay glass fitting."; break;
    case "cockpit-locator": consequence = decision.evidence.contained ? "Equipment isolated and personnel clear; repair remains outstanding." : "Vibration requires investigation; cause and personnel exposure are unconfirmed."; break;
    case "fluid-meter-drift": consequence = holdNow ? "Fluid filling is held until the conflicting volume readings are checked." : "Fluid volume may be wrong; each fill needs checking."; break;
    case "roller-calibration": consequence = holdNow ? "Vehicle testing is held until its readings are checked." : "Test results need checking before affected cars can be cleared."; break;
    case "fluid-pump": consequence = "Slow filling can delay cars at later stations."; break;
    case "body-transfer": consequence = "Car bodies cannot leave this station until the transfer equipment is restored."; break;
    default:
      // Live generic titles remain the validated observed title. The local
      // capacity assumption must not become an invented machine/root cause.
      consequence = assessment.capacityFactor <= 0 ? "Cars cannot pass through this station until the stoppage is cleared." : "The reported slowdown can delay work at this station; confirm its actual rate.";
  }

  const timingLabel = decision.action;
  const number = (n: number) => Number(n.toFixed(1));
  const effect = item.stationReading ? getStationEffect(item.stationReading) : null;
  const currentConsequence = effect && effect.kind !== "running" ? effect.description : null;
  const futureConsequence = impact !== null && impact > 0
    ? item.impactEvent === "buffer_empty" ? `Stored bodies last ${number(impact)} min`
      : impactTiming(item.impactEvent, impact)
    : impactTiming(item.impactEvent, impact);
  const effectText = currentConsequence ?? futureConsequence;
  const calculation = item.restorationMinutes !== null
    ? `${effectText} · ${number(item.restorationMinutes)} min repair`
    : effectText;
  return { title, consequence, urgency: decision.urgency, urgencyLabel: decision.label, timingLabel, calculation, impactLabel: impact !== null && impact <= 0 && currentConsequence ? currentConsequence : impactTiming(item.impactEvent, impact) };
}

/** Current response takes precedence over the original diagnostic suggestion. */
export function getRecommendedResponse(item: RankedIncident | undefined, fallback: string): string {
  if (!item) return fallback;
  if (item.incident.response) {
    const response = item.incident.response;
    if (response.readyAt !== null) return "Verify the returned work against the established checks. Record the result before releasing this incident.";
    if (response.acknowledgedAt === null) return `${response.team} has been contacted. Obtain acknowledgment from a named person; ownership is not yet confirmed.`;
    return `${response.owner} (${response.team}) accepted the response. Follow the recorded checkpoint and verify the work when it is returned.`;
  }
  if (item.incident.status === "repairing" && item.incident.assessment.kind === "supply") return "Maintenance is restoring external replenishment. Assembly can continue while its remaining input stock lasts.";
  if (item.incident.status === "repairing" && item.incident.containmentConfirmedAtMinute == null && keepsRunningDuringRepair(item.incident.assessment)) return "The isolated primary is being repaired separately. Production continues on the calibrated backup under the prepared demo intervention plan.";
  if (item.incident.status === "repairing") return "Maintenance is repairing and verifying the equipment. Keep the station held until the response is complete.";
  if (item.decision.evidence.contained) return "Keep the equipment isolated. Dispatch maintenance to repair and verify it before release.";
  if (item.decision.evidence.safetyReview) return "Arrange qualified safety review. Confirm equipment isolation and personnel clearance under established site procedures before treating the exposure as contained.";
  if (item.decision.evidence.uncontainedSpread) return "Verify affected work and contain further propagation under established site procedures. Record containment only after it has been confirmed.";
  return fallback;
}
