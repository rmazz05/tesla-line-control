import type { FaultAssessment } from "./types";

/** One deterministic total duration for the report, priority and simulation.
 * Catalog bounds remain source data; the product uses one scenario estimate. */
export function estimatedRepairMinutes(assessment: FaultAssessment): number {
  return (assessment.repairMinutes.min + assessment.repairMinutes.max) / 2;
}

/** Only a prepared, explicitly isolated backup plan permits continued output.
 * AI assessments and generic independent checks cannot authorize this. */
export function keepsRunningDuringRepair(assessment: FaultAssessment): boolean {
  return assessment.source === "scenario" && assessment.repairMode === "isolated-backup"
    && assessment.verifiedControl === "calibrated-backup" && assessment.safety === "none";
}
