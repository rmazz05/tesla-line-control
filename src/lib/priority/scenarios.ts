import { CATALOG } from "./catalog";
import type { FaultAssessment, ScenarioEvent, SimulationState } from "./types";

const arrivals: [number, string, string][] = [
  [0, "body-feed-interruption", "GA-12: external body replenishment stopped. Twenty bodies remain in the input buffer; the load station is still cycling."],
  [2, "final-gate-camera", "EOL-45: camera acquisition retries are stretching inspection cycles. All mandatory checks remain active."],
  [5, "fluid-meter-drift", "GA-36: fill meter and reference scale disagree. Independent reference checks keep the station running normally."],
  [8, "torque-backup", "GA-32: primary torque spindle unavailable. The calibrated backup maintains 90% of normal speed; downstream stock covers the temporary gap."],
  [8, "cockpit-locator", "GA-18: increasing vibration at the cockpit locator. The station is still running normally."],
  [12, "glass-servo", "GA-24: glass robot reports occasional servo resets. Automatic recovery maintains 90% of normal speed."],
  [19, "battery-guard", "GA-28: operator reports an open battery lift guard while the panel indicates closed. Stop and check the guard circuit."],
  [23, "roller-calibration", "EOL-41: calibration drift warning. Independent reference checks currently verify every result."],
  [28, "fluid-pump", "GA-36: fill pump pressure is falling; filling continues at 90% of normal speed. This is a separate fault from the earlier meter discrepancy."],
  [34, "body-transfer", "GA-12: body transfer drive has tripped and will not cycle. Body replenishment status must be checked separately."],
];

/** Authored operating conditions for this paced demonstration. These change the
 * physical forecast, not the urgency colors or priority rule. Catalog defaults
 * remain available for different observations and isolated engine tests. */
const operatingConditions: Record<string, Partial<FaultAssessment>> = {
  "fluid-meter-drift": {
    capacityFactor: 1, criticalAfterMinutes: null, verifiedControl: "independent-check",
    diagnosis: "The fill meter and reference scale disagree. An independent reference check verifies each fill without reducing line speed in this demo.",
    consequences: ["Independent checks verify every fill in this prepared scenario; repair remains required."],
  },
  "cockpit-locator": {
    capacityFactor: 1, criticalAfterMinutes: null,
    diagnosis: "Increasing vibration is reported while cycles remain normal. Cause, personnel exposure and isolation are unconfirmed. Comparable cases must be checked; normal output does not establish safety.",
    consequences: ["Comparable synthetic cases include unexpected fixture movement and employee injury.", "Current exposure requires immediate qualified review; no safe operating duration is inferred."],
  },
  "torque-backup": {verifiedControl: "calibrated-backup", repairMode: "isolated-backup", capacityFactor: .9, repairMinutes: {min: 4, max: 6}, diagnosis: "The calibrated backup spindle maintains 90% of normal throughput. In this authored scenario the primary spindle is removed and repaired separately; the isolated intervention does not interrupt the backup.", recommendedAction: "Repair the isolated primary spindle while the calibrated backup remains in service under the prepared demo intervention plan."},
  "glass-servo": {capacityFactor: .9, repairMinutes: {min: 4, max: 6}, diagnosis: "Occasional servo resets recover automatically; measured demo throughput remains at 90% of nominal. Downstream stock gives maintenance time to respond."},
  "roller-calibration": {
    quality: "suspected", capacityFactor: 1, criticalAfterMinutes: null, verifiedControl: "independent-check",
    diagnosis: "A calibration drift warning requires investigation. Independent reference checks verify each result and preserve normal throughput in this demo.",
    consequences: ["Independent verification checks every test result in this prepared scenario; repair remains required."],
  },
  "fluid-pump": {capacityFactor: .9, repairMinutes: {min: 3, max: 5}, diagnosis: "A pressure warning has reduced filling to 90% of normal speed. Downstream stock can absorb this smaller flow deficit. The pump fault remains separate from the meter discrepancy."},
};

/** Ten distinct faults; future entries are never supplied to a planner rollout. */
export const SCENARIO_EVENTS: ScenarioEvent[] = arrivals.map(([minute, catalogId, reportText], index) => {
  const reference = CATALOG.find((item) => item.id === catalogId)!;
  return { id: `SIM-${String(index + 1).padStart(2, "0")}`, minute, reportText, assessment: {
    ...reference.assessment,
    ...operatingConditions[catalogId],
    assumptions: [...reference.assessment.assumptions, "Prepared demo conditions are described in this report; backup rates and independent checks are authored observations, not safety authorizations for real equipment."],
    evidence: [`Operator report at simulated minute ${minute}: ${reportText}`, ...reference.assessment.evidence],
  } };
});

/** Concurrent reports make prioritization visible before any repair can finish.
 * The UI pauses at this decision point; ordering still comes from the policy. */
export const DEMO_DECISION_MINUTE = 2;
export const DEMO_EVENTS: ScenarioEvent[] = [
  { ...SCENARIO_EVENTS[0], id: "DEMO-SUPPLY", minute: DEMO_DECISION_MINUTE,
    reportText: "GA-12: external body replenishment stopped. Twelve bodies remain in the input buffer; the load station is still cycling." },
  { ...SCENARIO_EVENTS[3], id: "DEMO-BACKUP", minute: DEMO_DECISION_MINUTE,
    reportText: "GA-32: primary spindle unavailable. A calibrated backup keeps production at 90%. The primary is removed for separate repair under the prepared demo intervention plan." },
  { ...SCENARIO_EVENTS[4], id: "DEMO-VIBRATION", minute: DEMO_DECISION_MINUTE },
].map(event => ({ ...event, assessment: { ...event.assessment,
  evidence: [event.reportText, ...event.assessment.evidence.filter(text => !text.startsWith("Operator report at"))],
} }));

export function scenarioEvents(scenario?: SimulationState["scenario"]) { return scenario === "manual" || scenario === "random" ? [] : scenario === "demo" ? DEMO_EVENTS : SCENARIO_EVENTS; }
export function simulationEvents(state: SimulationState) { return state.scheduledEvents ?? scenarioEvents(state.scenario); }
export function scenarioDuration(scenario?: SimulationState["scenario"]) { return scenario === "demo" ? 24 : 40; }
