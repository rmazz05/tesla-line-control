export type Severity = "critical" | "high" | "medium" | "low";
export type IncidentStatus =
  | "new"
  | "acknowledged"
  | "in_progress"
  | "contained"
  | "resolved";
export type Impact =
  | "safety_stop"
  | "line_stop"
  | "quality_hold"
  | "degraded";

export type Station = {
  id: string;
  area: string;
  name: string;
  shortName: string;
  position: [number, number, number];
};

export type IncidentEvidence = {
  label: string;
  value: string;
  tone?: "bad" | "warn" | "neutral";
};

export type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  time: string;
};

export type Incident = {
  id: string;
  stationId: string;
  title: string;
  code: string;
  severity: Severity;
  impact: Impact;
  status: IncidentStatus;
  priorityScore: number;
  ageMinutes: number;
  source: string;
  description: string;
  likelyCause: string;
  containment: string;
  permanentFix: string;
  owner: string;
  eta: { low: number; median: number; high: number };
  history: { cases: number; confidence: number; note: string };
  evidence: IncidentEvidence[];
  timeline: TimelineEntry[];
  isCustom?: boolean;
};

export const stations: Station[] = [
  {
    id: "GA-12",
    area: "General assembly",
    name: "Painted body load",
    shortName: "Body load",
    position: [-9.5, 3.1, 0],
  },
  {
    id: "GA-18",
    area: "General assembly",
    name: "Cockpit install",
    shortName: "Cockpit",
    position: [-4.8, 3.1, 0],
  },
  {
    id: "GA-24",
    area: "General assembly",
    name: "Glass fitting robot",
    shortName: "Glass fit",
    position: [0, 3.4, 0],
  },
  {
    id: "GA-32",
    area: "General assembly",
    name: "Wheel and torque",
    shortName: "Wheel torque",
    position: [5, 3.1, 0],
  },
  {
    id: "EOL-41",
    area: "End of line",
    name: "Roller test",
    shortName: "Roller test",
    position: [10.5, 3.1, 0],
  },
];

export const initialIncidents: Incident[] = [
  {
    id: "INC-4271",
    stationId: "GA-24",
    title: "Scanner area blocked",
    code: "SAFE-SCN-24",
    severity: "critical",
    impact: "safety_stop",
    status: "new",
    priorityScore: 98,
    ageMinutes: 2,
    source: "Safety PLC · Scanner 24-B",
    description:
      "Scanner field B still reads occupied. The glass fitting robot is stopped, and the next body cannot enter.",
    likelyCause:
      "An object, loose cable or scanner misalignment may be blocking the field.",
    containment:
      "Keep the cell stopped. Confirm the area is clear, remove anything blocking the scanner, and wait for Maintenance to confirm a safe reset.",
    permanentFix:
      "Remove the blockage or realign the scanner. Check the field map and complete a two-channel safety test.",
    owner: "Maintenance · Electrical",
    eta: { low: 5, median: 7, high: 11 },
    history: {
      cases: 23,
      confidence: 91,
      note: "18 of 23 similar stops were traced to an obstruction at the scanner field edge.",
    },
    evidence: [
      { label: "Field A", value: "Clear", tone: "neutral" },
      { label: "Field B", value: "Occupied", tone: "bad" },
      { label: "Robot state", value: "Inhibited", tone: "bad" },
      { label: "Area permit", value: "Open", tone: "warn" },
    ],
    timeline: [
      {
        id: "t-4271-1",
        label: "Fault raised",
        detail: "Scanner 24-B opened the robot cell permit.",
        time: "18:42:16",
      },
      {
        id: "t-4271-2",
        label: "Line stopped",
        detail: "Upstream buffer has 3 bodies remaining.",
        time: "18:42:17",
      },
    ],
  },
  {
    id: "INC-4268",
    stationId: "GA-32",
    title: "Wheel torque check failed",
    code: "TRQ-LOW-07",
    severity: "high",
    impact: "quality_hold",
    status: "acknowledged",
    priorityScore: 84,
    ageMinutes: 5,
    source: "Torque tool · TT-32-04",
    description:
      "The front-left wheel on unit 7YJ384 measured 92 Nm. The required range is 118–122 Nm.",
    likelyCause:
      "The socket may not have been fully seated, or the tool may need calibration after its battery change.",
    containment:
      "Hold unit 7YJ384. Re-torque all four wheels with backup tool TT-32-02, then check the next unit.",
    permanentFix:
      "Check TT-32-04 on the calibration fixture. Remove it from service if the result is outside ±1.5%.",
    owner: "Quality · Final assembly",
    eta: { low: 3, median: 5, high: 8 },
    history: {
      cases: 41,
      confidence: 88,
      note: "30 of 41 matches were caused by incomplete socket engagement.",
    },
    evidence: [
      { label: "Measured", value: "92 Nm", tone: "bad" },
      { label: "Specification", value: "118–122 Nm", tone: "neutral" },
      { label: "Tool calibration", value: "14 days ago", tone: "warn" },
      { label: "Units exposed", value: "1 confirmed", tone: "warn" },
    ],
    timeline: [
      {
        id: "t-4268-1",
        label: "Deviation recorded",
        detail: "Tightening result rejected by station controller.",
        time: "18:39:42",
      },
      {
        id: "t-4268-2",
        label: "Unit held",
        detail: "7YJ384 routed to rework position 2.",
        time: "18:40:05",
      },
    ],
  },
  {
    id: "INC-4264",
    stationId: "GA-18",
    title: "Dashboard delivery late",
    code: "MAT-SEQ-18",
    severity: "medium",
    impact: "degraded",
    status: "in_progress",
    priorityScore: 61,
    ageMinutes: 11,
    source: "Line-side delivery scan",
    description:
      "The dashboard cart for unit 7YJ391 is four minutes late. Two correct jobs remain in the line-side buffer.",
    likelyCause:
      "The release scan may be missing, or the tugger may be delayed between zones.",
    containment:
      "Use the two buffered jobs. Contact the route driver and confirm the arriving cart ID before installation.",
    permanentFix:
      "Find the missing replenishment scan and return the cart to the correct sequence.",
    owner: "Material flow · Route 3",
    eta: { low: 6, median: 9, high: 14 },
    history: {
      cases: 16,
      confidence: 79,
      note: "12 of 16 comparable delays were recovered before the line-side buffer emptied.",
    },
    evidence: [
      { label: "Cart ETA", value: "4 min", tone: "warn" },
      { label: "Line-side buffer", value: "2 units", tone: "warn" },
      { label: "Required unit", value: "7YJ391", tone: "neutral" },
      { label: "Line state", value: "Running", tone: "neutral" },
    ],
    timeline: [
      {
        id: "t-4264-1",
        label: "Sequence warning",
        detail: "Required cart missed the delivery checkpoint.",
        time: "18:33:07",
      },
      {
        id: "t-4264-2",
        label: "Route driver contacted",
        detail: "Cart located one zone upstream.",
        time: "18:36:19",
      },
    ],
  },
];

type DiagnoseInput = {
  description: string;
  stationId: string;
  impact: Impact;
};

const includesAny = (text: string, words: string[]) =>
  words.some((word) => text.includes(word));

const nowTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

export function diagnoseIncident(input: DiagnoseInput): Incident {
  const text = input.description.trim().toLowerCase();
  const id = `DEMO-${String(Date.now()).slice(-4)}`;
  const base = {
    id,
    stationId: input.stationId,
    status: "new" as IncidentStatus,
    ageMinutes: 0,
    source: "Supervisor report · Presentation mode",
    description: input.description.trim(),
    owner: "Area team lead",
    isCustom: true,
  };

  let result: Omit<
    Incident,
    | "id"
    | "stationId"
    | "status"
    | "ageMinutes"
    | "source"
    | "description"
    | "owner"
    | "isCustom"
    | "timeline"
  >;

  if (
    includesAny(text, [
      "safety",
      "gate",
      "light curtain",
      "emergency",
      "person inside",
    ])
  ) {
    result = {
      title: "Safety device open",
      code: "SAFE-MANUAL",
      severity: "critical",
      impact: "safety_stop",
      priorityScore: 99,
      likelyCause:
        "A safety device is open, or its two signals do not agree.",
      containment:
        "Keep the area stopped. Confirm everyone is clear and check each open safety device before reset.",
      permanentFix:
        "Repair the device or wiring, then complete the required two-channel test.",
      eta: { low: 5, median: 9, high: 16 },
      history: {
        cases: 28,
        confidence: 86,
        note: "Matched safety-device language against 28 mock historical events.",
      },
      evidence: [
        { label: "Reported effect", value: "Safety stop", tone: "bad" },
        { label: "Automatic restart", value: "Blocked", tone: "bad" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Verification", value: "Required on site", tone: "warn" },
      ],
    };
  } else if (
    includesAny(text, ["torque", "bolt", "screw", "tighten", "wheel", "fastener"])
  ) {
    result = {
      title: "Fastening check failed",
      code: "TRQ-MANUAL",
      severity: input.impact === "line_stop" ? "critical" : "high",
      impact: input.impact,
      priorityScore: input.impact === "line_stop" ? 94 : 85,
      likelyCause:
        "The tool may not have seated correctly, may have used the wrong program or may need calibration.",
      containment:
        "Hold the unit and repeat the operation with a verified backup tool. Check the previous unit if its result is missing.",
      permanentFix:
        "Check the tool on the calibration fixture and inspect the socket before returning it to production.",
      eta: { low: 3, median: 6, high: 10 },
      history: {
        cases: 47,
        confidence: 89,
        note: "Matched fastening terms against 47 mock historical events.",
      },
      evidence: [
        { label: "Quality exposure", value: "Unit must be held", tone: "bad" },
        { label: "Backup method", value: "Verified tool", tone: "neutral" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Trace check", value: "Pending", tone: "warn" },
      ],
    };
  } else if (
    includesAny(text, ["glass", "windshield", "windscreen", "adhesive", "urethane"])
  ) {
    result = {
      title: "Glass fit check failed",
      code: "GLS-MANUAL",
      severity: input.impact === "line_stop" ? "critical" : "high",
      impact: input.impact === "degraded" ? "quality_hold" : input.impact,
      priorityScore: input.impact === "line_stop" ? 93 : 83,
      likelyCause:
        "The glass locator, vacuum grip or adhesive bead may be at fault.",
      containment:
        "Hold the body and stop the next automatic cycle. Check the glass position and adhesive bead.",
      permanentFix:
        "Correct the locator or applicator fault. Check the robot position and supervise one good fit before release.",
      eta: { low: 7, median: 12, high: 20 },
      history: {
        cases: 22,
        confidence: 81,
        note: "Matched glass-fit terms against 22 mock historical events.",
      },
      evidence: [
        { label: "Affected body", value: "Hold for inspection", tone: "bad" },
        { label: "Next cycle", value: "Supervisor hold", tone: "warn" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Bead / position", value: "Verify on site", tone: "warn" },
      ],
    };
  } else if (
    includesAny(text, ["paint", "scratch", "finish", "dust", "colour", "color"])
  ) {
    result = {
      title: "Surface defect reported",
      code: "QLT-SURFACE",
      severity: input.impact === "line_stop" ? "critical" : "high",
      impact: input.impact === "degraded" ? "quality_hold" : input.impact,
      priorityScore: input.impact === "line_stop" ? 92 : 82,
      likelyCause:
        "Booth conditions, handling contact or dirty tooling may have caused the defect.",
      containment:
        "Hold the affected unit and inspect the previous three units before releasing more bodies.",
      permanentFix:
        "Find the source, remove the dirt or contact point and record the first good unit.",
      eta: { low: 7, median: 12, high: 21 },
      history: {
        cases: 31,
        confidence: 76,
        note: "Matched surface-quality language against 31 mock historical events.",
      },
      evidence: [
        { label: "Unit disposition", value: "Inspect / hold", tone: "bad" },
        { label: "Look-back", value: "3 units", tone: "warn" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Origin", value: "Not yet confirmed", tone: "warn" },
      ],
    };
  } else if (
    includesAny(text, ["roller", "vibration", "pulling", "brake drag", "dyno", "dynamometer"])
  ) {
    result = {
      title: "Roller test failed",
      code: "EOL-DYN-MANUAL",
      severity: input.impact === "line_stop" ? "critical" : "high",
      impact: input.impact === "degraded" ? "quality_hold" : input.impact,
      priorityScore: input.impact === "line_stop" ? 92 : 80,
      likelyCause:
        "Check vehicle alignment, tire pressure, brake drag and the roller speed sensor, in that order.",
      containment:
        "Stop the test, secure the vehicle and place it on hold. Check the test bed before testing another vehicle.",
      permanentFix:
        "Correct the fault, check the bed with a reference vehicle and retest the affected vehicle.",
      eta: { low: 8, median: 15, high: 24 },
      history: {
        cases: 19,
        confidence: 74,
        note: "Matched roller-test terms against 19 mock historical events.",
      },
      evidence: [
        { label: "Vehicle release", value: "Blocked", tone: "bad" },
        { label: "Test bed", value: "Inspect before reuse", tone: "warn" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Measured trace", value: "Not attached", tone: "warn" },
      ],
    };
  } else if (
    includesAny(text, ["robot", "weld", "axis", "servo", "collision", "gripper"])
  ) {
    result = {
      title: "Robot cell stopped",
      code: "RBT-MANUAL",
      severity: input.impact === "degraded" ? "high" : "critical",
      impact: input.impact === "degraded" ? "line_stop" : input.impact,
      priorityScore: 95,
      likelyCause:
        "The robot may have reached a limit, hit an obstruction or lost a required ready signal.",
      containment:
        "Block automatic restart. Confirm the cell is clear and read the pendant alarm before moving the robot.",
      permanentFix:
        "Remove the obstruction or restore the ready signal. Check the tool position and supervise one dry cycle.",
      eta: { low: 6, median: 11, high: 20 },
      history: {
        cases: 36,
        confidence: 84,
        note: "Matched robot-cell terms against 36 mock historical events.",
      },
      evidence: [
        { label: "Automatic cycle", value: "Unavailable", tone: "bad" },
        { label: "Restart", value: "Supervisor hold", tone: "bad" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Pendant alarm", value: "Read on site", tone: "warn" },
      ],
    };
  } else if (
    includesAny(text, ["part", "material", "empty", "missing", "shortage", "rack"])
  ) {
    result = {
      title: "Material delivery delayed",
      code: "MAT-MANUAL",
      severity: input.impact === "line_stop" ? "critical" : "medium",
      impact: input.impact,
      priorityScore: input.impact === "line_stop" ? 91 : 67,
      likelyCause:
        "The line-side container was not refilled, or the delivery is late.",
      containment:
        "Count the remaining parts, call the route driver and check for an approved replacement container.",
      permanentFix:
        "Restore the delivery route and find the scan that failed to trigger replenishment.",
      eta: { low: 4, median: 8, high: 14 },
      history: {
        cases: 54,
        confidence: 82,
        note: "Matched material-flow terms against 54 mock historical events.",
      },
      evidence: [
        { label: "Line-side stock", value: "Confirm locally", tone: "warn" },
        { label: "Alternate source", value: "Check supermarket", tone: "neutral" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Delivery status", value: "Unknown", tone: "warn" },
      ],
    };
  } else {
    result = {
      title: input.description.trim().slice(0, 62) || "Station fault needs inspection",
      code: "OPS-MANUAL",
      severity:
        input.impact === "safety_stop" || input.impact === "line_stop"
          ? "critical"
          : input.impact === "quality_hold"
            ? "high"
            : "medium",
      impact: input.impact,
      priorityScore:
        input.impact === "safety_stop"
          ? 99
          : input.impact === "line_stop"
            ? 90
            : input.impact === "quality_hold"
              ? 78
              : 55,
      likelyCause:
        "The report does not match a known fault closely enough to name a cause.",
      containment:
        "Inspect the station and keep the current fault visible. Check whether safety, quality or output is affected.",
      permanentFix:
        "Record the fault type and confirmed cause after inspection.",
      eta: { low: 8, median: 14, high: 25 },
      history: {
        cases: 7,
        confidence: 42,
        note: "Low-confidence match; supervisor confirmation is required.",
      },
      evidence: [
        { label: "Classification", value: "Needs inspection", tone: "warn" },
        { label: "Reported impact", value: input.impact.replace("_", " "), tone: "neutral" },
        { label: "Input source", value: "Manual report", tone: "neutral" },
        { label: "Confidence", value: "Low", tone: "warn" },
      ],
    };
  }

  return {
    ...base,
    ...result,
    timeline: [
      {
        id: `${id}-1`,
        label: "Supervisor report created",
        detail: "Presentation-mode incident entered manually.",
        time: nowTime(),
      },
      {
        id: `${id}-2`,
        label: "Initial match complete",
        detail: `${result.history.cases} comparable mock cases checked.`,
        time: nowTime(),
      },
    ],
  };
}

export const getStation = (id: string) =>
  stations.find((station) => station.id === id) ?? stations[0];

export const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const impactLabels: Record<Impact, string> = {
  safety_stop: "Safety stop",
  line_stop: "Line stopped",
  quality_hold: "Quality hold",
  degraded: "Running degraded",
};
