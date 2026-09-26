import type { PriorityIncident, StationId } from "./types";

/** Authored fixtures, never presented as a plant's actual incident history. */
export interface HistoricalCase {
  id: string;
  catalogId: string;
  stationId: StationId;
  equipment: string;
  symptom: string;
  conditions: string;
  outcome: string;
  seriousInjury: boolean;
  qualityPropagation?: string;
  repairMinutes: number;
  limitation: string;
}
export const CASE_SOURCE = "Synthetic case library · demonstration data";
export const HISTORICAL_CASES: readonly HistoricalCase[] = [
  { id: "CASE-014", catalogId: "cockpit-locator", stationId: "GA-18", equipment: "Cockpit locator", symptom: "Increasing vibration", conditions: "Equipment running; person within reach; isolation not confirmed.", outcome: "A loose locating assembly moved unexpectedly and injured an employee.", seriousInjury: true, repairMinutes: 6, limitation: "Current employee position and failure mechanism are unconfirmed." },
  { id: "CASE-027", catalogId: "cockpit-locator", stationId: "GA-18", equipment: "Cockpit locator", symptom: "Increasing vibration", conditions: "Equipment running; employee approached to inspect; isolation not confirmed.", outcome: "Unexpected fixture movement caused an employee injury.", seriousInjury: true, repairMinutes: 7, limitation: "An inspection approach has not been reported in the current incident." },
  { id: "CASE-031", catalogId: "cockpit-locator", stationId: "GA-18", equipment: "Cockpit locator", symptom: "Increasing vibration", conditions: "Equipment isolated before inspection.", outcome: "Worn locating insert replaced; no injury recorded.", seriousInjury: false, repairMinutes: 4, limitation: "Isolation must be confirmed now; this past control is not evidence of current protection." },
  { id: "CASE-071", catalogId: "reported-vibration", stationId: "GA-12", equipment: "Body transfer conveyor", symptom: "Increasing drive vibration", conditions: "Conveyor running; employee near the drive; isolation unconfirmed.", outcome: "A displaced drive component injured an employee.", seriousInjury: true, repairMinutes: 6, limitation: "Current vibration source, employee position and protective state must be verified." },
  { id: "CASE-074", catalogId: "reported-vibration", stationId: "GA-12", equipment: "Body transfer conveyor", symptom: "Increasing drive vibration", conditions: "Conveyor running during an inspection; isolation unconfirmed.", outcome: "Unexpected movement during inspection injured an employee.", seriousInjury: true, repairMinutes: 8, limitation: "A current inspection approach has not been established." },
  { id: "CASE-042", catalogId: "final-gate-camera", stationId: "EOL-45", equipment: "Final inspection camera", symptom: "Repeated acquisition retries", conditions: "Every mandatory inspection remained active.", outcome: "Output slowed; image acquisition was restored. No injury recorded.", seriousInjury: false, repairMinutes: 5, limitation: "Past throughput is not a measurement of the current line." },
  { id: "CASE-051", catalogId: "fluid-meter-drift", stationId: "GA-36", equipment: "Fluid fill meter", symptom: "Meter and reference disagree", conditions: "No independent verification of completed fills.", qualityPropagation: "Unverified fill → later assembly → affected vehicles require rechecking.", outcome: "Incorrect fills reached later stations; affected vehicles required rechecking.", seriousInjury: false, repairMinutes: 4, limitation: "Independent verification, when confirmed, interrupts this propagation path." },
  { id: "CASE-056", catalogId: "roller-calibration", stationId: "EOL-41", equipment: "Vehicle test rig", symptom: "Calibration discrepancy", conditions: "Results accepted without an independent reference check.", qualityPropagation: "Unverified result → vehicle clearance → batch retesting.", outcome: "Unreliable results required a batch of vehicles to be retested.", seriousInjury: false, repairMinutes: 5, limitation: "A currently verified independent check changes the consequence of delay." },
  { id: "CASE-063", catalogId: "torque-backup", stationId: "GA-32", equipment: "Torque spindle", symptom: "Primary spindle unavailable", conditions: "Calibrated backup available.", outcome: "Production continued at a lower rate during primary spindle repair.", seriousInjury: false, repairMinutes: 5, limitation: "Backup validity and current throughput require current evidence." },
];

export function retrieveCases(incident: PriorityIncident): HistoricalCase[] {
  const a = incident.assessment;
  if (a.needsReview || a.kind === "unknown" || !a.stationId || !a.catalogId) return [];
  // Equipment + symptom mapping is server-owned. A word such as "vibration"
  // alone cannot match injury history from another machine or failure family.
  return HISTORICAL_CASES.filter(item => item.catalogId === a.catalogId && item.stationId === a.stationId);
}

export interface ConsequenceAssessment {
  cases: HistoricalCase[];
  injuryCases: number;
  safetyReview: boolean;
  safetyBasis: "reported" | "history" | "none";
  uncontainedSpread: boolean;
  contained: boolean;
  dependency: "required" | "backup" | "unknown";
  factors: { name: string; finding: string; source: string }[];
  unknowns: string[];
}

export function assessConsequences(incident: PriorityIncident): ConsequenceAssessment {
  const a = incident.assessment;
  const cases = retrieveCases(incident);
  const injuryCases = cases.filter(item => item.seriousInjury).length;
  const contained = incident.containmentConfirmedAtMinute != null;
  const safetyBasis = a.safety !== "none" ? "reported" : injuryCases > 0 ? "history" : "none";
  const safetyReview = safetyBasis !== "none" && !contained;
  // Only prepared scenario observations or a supervisor action can confirm a
  // control. The model and free-text report cannot populate this field.
  const verifiedCheck = a.source === "scenario" && a.verifiedControl === "independent-check";
  const backup = a.source === "scenario" && a.verifiedControl === "calibrated-backup";
  const knownEquipment = !!a.stationId && !a.needsReview && a.kind !== "unknown";
  const dependency = !knownEquipment ? "unknown" : backup ? "backup" : "required";
  const spreadCases = cases.filter(item => item.qualityPropagation);
  const uncontainedSpread = !contained && !verifiedCheck && (a.quality !== "none" || spreadCases.length > 0);
  const source = CASE_SOURCE;
  return {
    cases, injuryCases, safetyReview, safetyBasis, uncontainedSpread, contained, dependency,
    factors: [
      { name: "People", finding: contained ? "Supervisor confirmed isolation and personnel clear. Repair remains open." : safetyBasis === "reported" ? "A current hazardous condition is reported. Escalate for qualified review." : injuryCases ? `${injuryCases} comparable cases involved injury. Check current exposure immediately.` : "No personnel hazard established. This does not establish safety.", source: contained ? "Supervisor confirmation" : safetyBasis === "reported" ? "Incident report" : injuryCases ? source : "Available evidence" },
      { name: "Spread", finding: uncontainedSpread ? spreadCases[0]?.qualityPropagation ?? "Unverified work may reach later operations and require wider rechecking." : spreadCases.length ? "Independent checks or isolation interrupt the recorded rework path." : injuryCases && !contained ? "Historical fixture movement could harm a person nearby; current mechanism is unconfirmed." : "No wider damage path established; connected production effects are modeled separately.", source: spreadCases.length || injuryCases ? source : "Available evidence" },
      { name: "Protection", finding: contained ? "Isolation confirmed; station remains stopped until repair and verification finish." : verifiedCheck ? "Independent verification of every result is confirmed in this prepared scenario." : backup ? "A calibrated backup is confirmed in this prepared scenario." : "Effective containment has not been confirmed.", source: contained ? "Supervisor confirmation" : verifiedCheck || backup ? "Prepared scenario observation" : "Missing confirmation" },
      { name: "Dependency", finding: dependency === "backup" ? "Backup preserves the operation; repair of the primary unit can be deferred." : dependency === "required" ? "Required operation in this demo line; no approved bypass is recorded." : "Required operation, bypass and redundancy are unconfirmed.", source: knownEquipment ? "Synthetic line configuration" : "Unknown" },
    ],
    unknowns: [
      ...(injuryCases && !contained ? ["Whether people are currently exposed and whether the historical failure mechanism is present."] : []),
      ...(cases.length === 0 ? ["No comparable cases in this library. Absence of history does not mean low risk."] : []),
      "Cases are authored examples, not plant records. Injury probability cannot be estimated from this library.",
    ],
  };
}
