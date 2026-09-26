import { STATION_IDS, type FaultAssessment, type StationId } from "./types";

export interface CatalogEntry { id: string; title: string; stationIds: StationId[]; assessment: FaultAssessment }

function entry(id: string, stationId: StationId, title: string, fields: Partial<FaultAssessment>): CatalogEntry {
  return { id, title, stationIds: [stationId], assessment: {
    title, stationId, catalogId: id, kind: "capacity", diagnosis: "Synthetic equipment-catalog hypothesis; confirm at the machine.",
    consequences: ["Reduced station capacity can propagate through finite buffers."],
    evidence: [`Synthetic reference ${id}; this is not a manufacturer fault-code definition.`],
    assumptions: ["All rates, buffer sizes, failure behavior, and intervention durations are synthetic demo assumptions.", "One fixed repair estimate covers the entire response, including checks. Priority, forecasts and actual simulated completion use the same duration. No additional time is added."],
    checks: ["Confirm the observation at the station before intervention."],
    recommendedAction: "Dispatch the qualified team, isolate as required, repair, and verify the station before release.",
    safety: "none", quality: "none", capacityFactor: 0.6, criticalAfterMinutes: null,
    repairMinutes: { min: 4, max: 7 }, requiredSkill: "mechanical", severity: 2,
    source: "scenario", needsReview: false, followUpQuestion: null, ...fields,
  } };
}

export const CATALOG: CatalogEntry[] = [
  entry("body-feed-interruption", "GA-12", "Body replenishment interrupted", {
    kind: "supply", capacityFactor: 0, requiredSkill: "material_flow", repairMinutes: { min: 5, max: 8 }, severity: 2,
    diagnosis: "The external body feeder has stopped; the body-load station can keep consuming its existing input inventory.",
    consequences: ["The body-load buffer drains only while bodies are actually consumed.", "Downstream restrictions can extend the recovery window; replenishment remains unavailable until repair."],
    checks: ["Confirm the remaining body count.", "Inspect the external conveyor and material delivery path."],
    recommendedAction: "Restore external replenishment, verify transfer, and release the feeder.",
  }),
  entry("final-gate-camera", "EOL-45", "Final inspection camera retries", {
    capacityFactor: 0.45, requiredSkill: "electrical", repairMinutes: { min: 4, max: 6 }, severity: 3,
    diagnosis: "Repeated image-acquisition retries lengthen the final inspection cycle; no failed inspection is bypassed.",
    checks: ["Inspect camera exposure and network link.", "Confirm every unit still receives its full inspection."],
  }),
  entry("torque-backup", "GA-32", "Primary torque spindle unavailable", {
    capacityFactor: 0.65, requiredSkill: "mechanical", repairMinutes: { min: 7, max: 10 }, severity: 2,
    diagnosis: "An approved backup spindle keeps the station operating at a lower cycle rate.",
    checks: ["Confirm the backup spindle remains within calibration.", "Inspect the primary spindle and coupling."],
  }),
  entry("glass-servo", "GA-24", "Glass robot servo resets", {
    capacityFactor: 0.55, requiredSkill: "electrical", repairMinutes: { min: 5, max: 8 }, severity: 3,
    diagnosis: "Intermittent servo resets reduce glass-fitting capacity; the reported reset does not establish its root cause.",
    checks: ["Read drive diagnostics.", "Check power stability, feedback connectors, and cycle logs."],
  }),
  entry("cockpit-locator", "GA-18", "Cockpit locator vibration", {
    kind: "condition", capacityFactor: 0.9, criticalAfterMinutes: null, requiredSkill: "mechanical", repairMinutes: { min: 4, max: 7 }, severity: 2,
    diagnosis: "Increasing vibration is reported. Locator wear is one possible cause; confirm the mechanism and current personnel exposure.",
    consequences: ["Comparable synthetic cases warrant immediate review of exposure and isolation.", "No safe operating window or time-to-injury is established."],
  }),
  entry("fluid-meter-drift", "GA-36", "Fluid metering discrepancy", {
    kind: "quality", quality: "suspected", capacityFactor: 0.8, criticalAfterMinutes: null, requiredSkill: "quality", repairMinutes: { min: 3, max: 5 }, severity: 3,
    diagnosis: "Metered fill volume disagrees with the check scale. Verify affected fills and confirm whether independent checking contains the discrepancy.",
    checks: ["Hold affected units for a verified volume check.", "Compare the meter with the reference scale."],
  }),
  entry("battery-guard", "GA-28", "Battery lift guard discrepancy", {
    kind: "safety", safety: "suspected", capacityFactor: 0, requiredSkill: "electrical", repairMinutes: { min: 4, max: 7 }, severity: 5,
    diagnosis: "The guard signal disagrees with an operator observation. The predefined demo safety rule immediately stops the affected station pending qualified verification.",
    consequences: ["Potential personnel exposure requires immediate containment and escalation.", "No time-to-injury is inferred; the station is held immediately."],
    recommendedAction: "Apply the station hold, notify the responsible safety lead, inspect the interlock, and verify safe operation before release.",
    checks: ["Keep personnel clear and confirm the station hold.", "Have a qualified person inspect and function-test the guard circuit."],
  }),
  entry("roller-calibration", "EOL-41", "Roller test calibration discrepancy", {
    kind: "quality", quality: "confirmed", capacityFactor: 0.7, criticalAfterMinutes: null, requiredSkill: "quality", repairMinutes: { min: 4, max: 6 }, severity: 4,
    diagnosis: "A reference check exceeds the scenario deviation limit; affected results require review. No safe operating window is inferred.",
    checks: ["Quarantine suspect test results.", "Recheck against the reference and calibrate before release."],
  }),
  entry("fluid-pump", "GA-36", "Fluid pump pressure loss", {
    capacityFactor: 0.5, requiredSkill: "mechanical", repairMinutes: { min: 4, max: 7 }, severity: 3,
    diagnosis: "Low pump pressure slows filling. This fault is distinct from the meter discrepancy and both effects compose if unresolved.",
    checks: ["Check pressure, filter restriction, and pump condition.", "Verify metering separately; repairing the pump does not clear another incident."],
  }),
  entry("body-transfer", "GA-12", "Body transfer drive stopped", {
    capacityFactor: 0, requiredSkill: "electrical", repairMinutes: { min: 3, max: 6 }, severity: 4,
    diagnosis: "The body-load transfer drive has stopped. Existing bodies cannot leave this station until the drive is restored.",
    checks: ["Confirm drive power and protective trip status.", "Inspect the transfer path and perform an authorized reset only after diagnosis."],
  }),
  ...[
    entry("reported-electrical-stop", "GA-12", "Reported electrical stoppage", {
      capacityFactor: 0, requiredSkill: "electrical", repairMinutes: { min: 4, max: 10 }, severity: 3,
      diagnosis: "Reported loss of motion or power is consistent with several electrical or control causes; no root cause is established.",
      checks: ["Verify whether the machine is stopped.", "Capture drive and control diagnostics before selecting a corrective action."],
      needsReview: false,
    }),
    entry("reported-mechanical-jam", "GA-12", "Reported mechanical obstruction", {
      capacityFactor: 0, requiredSkill: "mechanical", repairMinutes: { min: 5, max: 12 }, severity: 3,
      diagnosis: "The report describes a possible mechanical obstruction. Its location and safe intervention procedure require confirmation.",
      checks: ["Confirm the obstruction and affected mechanism.", "Have qualified personnel isolate and inspect the equipment."],
      needsReview: false,
    }),
    entry("reported-cycle-slowdown", "GA-12", "Reported cycle slowdown", {
      capacityFactor: 0.7, requiredSkill: "mechanical", repairMinutes: { min: 3, max: 9 }, severity: 2,
      diagnosis: "The report describes slower cycles, without enough evidence to establish a failure mechanism. A 70% operating rate is only a demo placeholder pending measurement.",
      checks: ["Measure actual cycle time.", "Confirm whether the delay is local or caused by adjacent stations."],
      needsReview: false,
    }),
    entry("reported-vibration", "GA-12", "Reported equipment vibration", {
      kind: "condition", capacityFactor: 1, repairMinutes: { min: 6, max: 6 },
      diagnosis: "Vibration is reported; the failure mechanism is unknown. Match the equipment and current operating conditions against case evidence before assessing exposure.",
      consequences: ["Normal production does not establish personnel safety. Check current exposure and isolation."],
      checks: ["Confirm the equipment and vibration trend.", "Have a qualified person assess current exposure and containment."],
    }),
    entry("reported-safety-concern", "GA-12", "Reported personnel safety concern", {
      kind: "safety", safety: "suspected", capacityFactor: 0, requiredSkill: "electrical", repairMinutes: { min: 0, max: 0 }, severity: 5,
      diagnosis: "An unverified safety concern requires immediate station hold and qualified escalation under the demo policy; cause and response duration remain unknown.",
      consequences: ["Station held pending responsible-person verification; no time-to-injury is estimated."],
      checks: ["Keep personnel clear and verify the station hold.", "Contact the responsible safety lead to assess the reported condition."],
      recommendedAction: "Hold the identified station and escalate to the responsible safety lead for assessment before assigning a repair.",
      needsReview: true,
    }),
  ].map((reference) => ({ ...reference, stationIds: [...STATION_IDS], assessment: { ...reference.assessment, stationId: null, assumptions: [...reference.assessment.assumptions, "Generic symptom template, not a machine-specific fault definition. Equipment match and quantitative effects require review."], followUpQuestion: "What was directly observed at the identified station, and has its current operating state been verified?" } })),
];
