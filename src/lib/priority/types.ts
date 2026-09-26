import type { ImpactEvent } from "./policy";

/** Synthetic demo domain. Time and durations are expressed in simulated minutes. */
export const STATION_IDS = ["GA-12", "GA-18", "GA-24", "GA-28", "GA-32", "GA-36", "EOL-41", "EOL-45"] as const;
export type StationId = (typeof STATION_IDS)[number];
export type TeamSkill = "mechanical" | "electrical" | "quality" | "material_flow";
export type FaultKind = "supply" | "capacity" | "quality" | "safety" | "condition" | "unknown";
export type EvidenceLevel = "none" | "suspected" | "confirmed";
export type AssessmentSource = "scenario" | "openai" | "offline";

export interface FaultAssessment {
  /** Authored intervention plan only. A backup alone does not authorize live repair. */
  repairMode?: "isolated-backup";
  /** Only authored scenario observations may assert an effective ongoing control. */
  verifiedControl?: "independent-check" | "calibrated-backup";
  title: string;
  stationId: StationId | null;
  kind: FaultKind;
  catalogId: string | null;
  diagnosis: string;
  consequences: string[];
  evidence: string[];
  assumptions: string[];
  checks: string[];
  recommendedAction: string;
  safety: EvidenceLevel;
  quality: EvidenceLevel;
  /** Fraction of the station's nominal capacity available while this fault is active. */
  capacityFactor: number;
  /** Scenario-based deterioration window, never an inferred time-to-injury. */
  criticalAfterMinutes: number | null;
  /** Total elapsed response after dispatch, including repair and checks. */
  repairMinutes: { min: number; max: number };
  /** Descriptive fault discipline only; the general maintenance pool has no skill restrictions. */
  requiredSkill: TeamSkill;
  /** Fixed baseline classification, not the dynamic dispatch score. */
  severity: number;
  source: AssessmentSource;
  needsReview: boolean;
  followUpQuestion: string | null;
}

export interface PriorityIncident {
  id: string;
  reportText: string;
  reportedAtMinute: number;
  status: "open" | "repairing" | "resolved";
  assessment: FaultAssessment;
  /** Supervisor action only; never supplied by AI or inferred from dispatch. */
  containmentConfirmedAtMinute?: number | null;
  repairStartedAtMinute: number | null;
  repairCompletesAtMinute: number | null;
  resolvedAtMinute: number | null;
  assignedTeamId: string | null;
  history: { minute: number; text: string }[];
}

export interface ScenarioEvent {
  id: string;
  minute: number;
  reportText: string;
  assessment: FaultAssessment;
}

export interface RankChange {
  minute: number;
  incidentId: string;
  from: number | null;
  to: number | null;
  reason: string;
}

export interface SimulationState {
  scenario?: "shift" | "demo";
  minute: number;
  incidents: PriorityIncident[];
  /** Input buffers indexed in STATION_IDS order. */
  buffers: number[];
  injectedEventIds: string[];
  rankChanges: RankChange[];
  previousOrder: string[];
  producedUnits: number;
  lostUnits: number;
  stoppedMinutes: number;
  autoDispatch: boolean;
  /** Maintenance response records; there is no limit on concurrent repairs. */
  teams: MaintenanceTeam[];
}

/** A record of an individual maintenance response, not a capacity reservation. */
export interface MaintenanceTeam {
  id: string;
  name: string;
  /** Descriptive capabilities retained for compatibility, never an eligibility gate. */
  skills: TeamSkill[];
  assignedIncidentId: string | null;
  availableAtMinute: number;
  stationId: StationId | null;
}

export interface RankedIncident {
  incident: PriorityIncident;
  decision: import("./policy").PriorityDecision;
  /** Current connected-flow reading, shared with the factory visualization. */
  stationReading: StationReading | null;
  rank: number;
  previousRank: number | null;
  criticalInMinutes: number | null;
  /** The specific simulated event behind the countdown, shared by ranking and UI. */
  impactEvent: ImpactEvent;
  slackMinutes: number | null;
  /** Fixed total repair estimate. Maintenance is always available. */
  responseMinutes: number | null;
  /** Fixed total repair estimate. Maintenance is always available.
   * For an unstarted job this does not count down with incident age. */
  restorationMinutes: number | null;
  /** Comparison of repairing this incident now versus after a fixed delay. */
  delayLossUnits: number;
  /** Diagnostic only: additional authored deadline breaches under deferral; never a ranking score. */
  delayMissedWindows: number;
  /** Concise operator-facing explanation of the production/safety reason for this order. */
  priorityReason: string;
  /** Whole-line lost output over the common lookahead when this response is considered first. */
  immediateLossUnits: number;
  /** The same forecast with this response deferred by five minutes. */
  deferredLossUnits: number;
  whyNow: string;
  affectedStations: StationId[];
  closeCall: boolean;
  recommendedTeamId: string | null;
  teamWaitMinutes: number;
}

export interface StationReading {
  id: StationId;
  name: string;
  bufferUnits: number;
  bufferCapacity: number;
  ratePerHour: number;
  state: "running" | "slowed" | "stopped" | "starved" | "blocked";
  activeIncidentIds: string[];
}

export interface BenchmarkResult {
  policy: "planner" | "fifo" | "severity" | "deadline" | "reactive";
  label: string;
  producedUnits: number;
  lostUnits: number;
  stoppedMinutes: number;
  missedWindows: number;
  safetyDeferrals: number;
}

export interface AssessmentRequest {
  report: string;
  stationId?: StationId | null;
  minute: number;
  telemetry: StationReading[];
  activeIncidents: { id: string; stationId: StationId | null; title: string }[];
}

export interface AssessmentResponse {
  assessment: FaultAssessment;
  mode: "openai" | "offline";
  warning: string | null;
}

export type WhatIfChange =
  | { kind: "repair"; incidentId: string; delayMinutes: number | null }
  | { kind: "buffer"; stationId: StationId; units: number };
export interface ProjectionFrame {
  elapsed: number;
  state: SimulationState;
  readings: StationReading[];
  produced: number;
  stopped: number;
}
export interface RippleEvent { elapsed: number; stationId: StationId; message: string; }
export interface WhatIfBranch { label: string; frames: ProjectionFrame[]; events: RippleEvent[]; }
export interface WhatIfResult {
  baseline: WhatIfBranch;
  alternative: WhatIfBranch;
  horizon: number;
  outputDifference: number;
  stoppedDifference: number;
}
