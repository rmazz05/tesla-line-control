import type { Incident } from "./line-data";
import { stations } from "./line-data";
import type { SupportTeam } from "./team-requests";

export const SHIFT_START_HOUR = 6;
export const SHIFT_END_HOUR = 14;
export const SHIFT_TICK_MINUTES = 5;
export const SHIFT_DURATION_MINUTES = (SHIFT_END_HOUR - SHIFT_START_HOUR) * 60;
export const SHIFT_TOTAL_TICKS = SHIFT_DURATION_MINUTES / SHIFT_TICK_MINUTES;
export const SCHEDULED_INCIDENT_TICKS = [25, 54, 78] as const;
export const TARGET_LINE_RATE_PER_HOUR = 44;

export type ShiftScenarioId =
  "torque_tool_failure" | "glass_robot_drive_fault" | "dashboard_cart_late";

export type StationTelemetryState = "running" | "degraded" | "stopped";
export type LineTelemetryState =
  "running" | "degraded" | "stopped" | "rerouting";

export type StationTelemetry = {
  stationId: string;
  stationName: string;
  state: StationTelemetryState;
  ratePerHour: number;
  targetRatePerHour: number;
  cycleTimeSeconds: number | null;
  targetCycleTimeSeconds: number;
  bufferUnits: number;
  detail: string;
  activeIncidentId?: string;
};

export type ShiftTelemetrySnapshot = {
  tick: number;
  time: string;
  elapsedMinutes: number;
  progress: number;
  lineState: LineTelemetryState;
  lineRatePerHour: number;
  targetLineRatePerHour: number;
  activeIncidentIds: string[];
  stations: StationTelemetry[];
};

export type ScenarioTelemetryEffect = Pick<
  StationTelemetry,
  "state" | "ratePerHour" | "cycleTimeSeconds" | "bufferUnits" | "detail"
>;

export type ShiftScenario = {
  id: ShiftScenarioId;
  tick: (typeof SCHEDULED_INCIDENT_TICKS)[number];
  incident: Incident;
  recommendedTeam: SupportTeam;
  containmentActionLabel: string;
  rerouteRecommended: boolean;
  rerouteTarget?: string;
  telemetryEffect: ScenarioTelemetryEffect;
};

export type ActiveShiftReferences = Iterable<string>;

export type ShiftTelemetryOptions = {
  reroutedIncidentIds?: Iterable<string>;
};

type StationBaseline = {
  targetRatePerHour: number;
  targetCycleTimeSeconds: number;
  bufferUnits: number;
};

const stationBaselines: Record<string, StationBaseline> = {
  "GA-12": {
    targetRatePerHour: 44,
    targetCycleTimeSeconds: 82,
    bufferUnits: 5,
  },
  "GA-18": {
    targetRatePerHour: 44,
    targetCycleTimeSeconds: 82,
    bufferUnits: 4,
  },
  "GA-24": {
    targetRatePerHour: 44,
    targetCycleTimeSeconds: 82,
    bufferUnits: 3,
  },
  "GA-32": {
    targetRatePerHour: 44,
    targetCycleTimeSeconds: 82,
    bufferUnits: 3,
  },
  "EOL-41": {
    targetRatePerHour: 44,
    targetCycleTimeSeconds: 82,
    bufferUnits: 4,
  },
};

const normalRateOffsets = [0, 1, 0, -1, 0, 0, 1, 0, -1, 0] as const;

function clampTick(tick: number, includeShiftEnd = false) {
  const lastTick = includeShiftEnd ? SHIFT_TOTAL_TICKS : SHIFT_TOTAL_TICKS - 1;
  return Math.min(lastTick, Math.max(0, Math.trunc(tick)));
}

/** Formats a shift tick as local factory time. Tick 0 is 06:00 and tick 96 is 14:00. */
export function formatShiftTime(tick: number) {
  const elapsedMinutes = clampTick(tick, true) * SHIFT_TICK_MINUTES;
  const totalMinutes = SHIFT_START_HOUR * 60 + elapsedMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export const shiftScenarios: readonly ShiftScenario[] = [
  {
    id: "torque_tool_failure",
    tick: 25,
    recommendedTeam: "tool_crib",
    containmentActionLabel: "Switch to backup tool",
    rerouteRecommended: false,
    telemetryEffect: {
      state: "degraded",
      ratePerHour: 24,
      cycleTimeSeconds: 150,
      bufferUnits: 7,
      detail: "Waiting for a checked replacement torque tool.",
    },
    incident: {
      id: "SHIFT-TRQ-2501",
      stationId: "GA-32",
      title: "Torque tool stopped",
      code: "TRQ-TOOL-32",
      severity: "high",
      impact: "quality_hold",
      status: "new",
      priorityScore: 86,
      ageMinutes: 0,
      source: "Torque tool · TT-32-04",
      description:
        "Torque tool TT-32-04 stopped during wheel fastening. A checked replacement is available from the tool crib.",
      likelyCause:
        "The tool controller reports an internal fault. The tool needs to be checked before it returns to service.",
      containment:
        "Hold the current car. Fit a checked replacement tool and repeat all four wheel torque checks before release.",
      permanentFix:
        "Send TT-32-04 to the tool crib for inspection and record the repair or replacement against the tool ID.",
      owner: "Tool crib · Assembly support",
      eta: { low: 4, median: 6, high: 9 },
      history: {
        cases: 18,
        confidence: 94,
        note: "A checked spare restored production in 17 of 18 similar tool faults.",
      },
      evidence: [
        { label: "Tool", value: "TT-32-04", tone: "bad" },
        { label: "Controller", value: "Internal fault", tone: "bad" },
        { label: "Current car", value: "Held", tone: "warn" },
        { label: "Checked spare", value: "Available", tone: "neutral" },
      ],
      timeline: [
        {
          id: "SHIFT-TRQ-2501-1",
          label: "Tool fault raised",
          detail: "TT-32-04 stopped before the fastening cycle completed.",
          time: formatShiftTime(25),
        },
        {
          id: "SHIFT-TRQ-2501-2",
          label: "Car held",
          detail: "The current car is waiting for a checked replacement tool.",
          time: formatShiftTime(25),
        },
      ],
    },
  },
  {
    id: "glass_robot_drive_fault",
    tick: 54,
    recommendedTeam: "maintenance",
    containmentActionLabel: "Reroute vehicles to Line 2",
    rerouteRecommended: true,
    rerouteTarget: "Line 2",
    telemetryEffect: {
      state: "stopped",
      ratePerHour: 0,
      cycleTimeSeconds: null,
      bufferUnits: 9,
      detail: "Robot stopped. Cars are waiting at the diversion point.",
    },
    incident: {
      id: "SHIFT-RBT-5401",
      stationId: "GA-24",
      title: "Glass robot drive fault",
      code: "RBT-DRV-24",
      severity: "critical",
      impact: "line_stop",
      status: "new",
      priorityScore: 97,
      ageMinutes: 0,
      source: "Glass robot controller · Axis 4 drive",
      description:
        "The glass fitting robot has a major Axis 4 drive fault and cannot run an automatic cycle.",
      likelyCause:
        "The robot drive or its power connection has failed. Maintenance needs to inspect the drive cabinet and motor circuit.",
      containment:
        "Keep the robot cell stopped and locked against automatic restart. Send arriving cars to Line 2 until Maintenance releases the cell.",
      permanentFix:
        "Repair or replace the failed drive, check the Axis 4 motor circuit and complete one supervised dry cycle before restart.",
      owner: "Maintenance · Robotics",
      eta: { low: 25, median: 40, high: 60 },
      history: {
        cases: 9,
        confidence: 87,
        note: "Seven of nine similar drive faults required a drive module replacement.",
      },
      evidence: [
        { label: "Robot state", value: "Stopped", tone: "bad" },
        { label: "Axis 4 drive", value: "Major fault", tone: "bad" },
        { label: "Automatic cycle", value: "Unavailable", tone: "bad" },
        {
          label: "Alternate route",
          value: "Line 2 available",
          tone: "neutral",
        },
      ],
      timeline: [
        {
          id: "SHIFT-RBT-5401-1",
          label: "Drive fault raised",
          detail:
            "The controller stopped the glass robot during its ready check.",
          time: formatShiftTime(54),
        },
        {
          id: "SHIFT-RBT-5401-2",
          label: "Temporary route prepared",
          detail: "Line 2 is ready to receive arriving cars.",
          time: formatShiftTime(54),
        },
      ],
    },
  },
  {
    id: "dashboard_cart_late",
    tick: 78,
    recommendedTeam: "material_flow",
    containmentActionLabel: "Protect the remaining buffer",
    rerouteRecommended: false,
    telemetryEffect: {
      state: "degraded",
      ratePerHour: 30,
      cycleTimeSeconds: 120,
      bufferUnits: 1,
      detail: "One dashboard remains while the next cart is located.",
    },
    incident: {
      id: "SHIFT-MAT-7801",
      stationId: "GA-18",
      title: "Dashboard cart late",
      code: "MAT-CART-18",
      severity: "medium",
      impact: "degraded",
      status: "new",
      priorityScore: 64,
      ageMinutes: 0,
      source: "Line-side delivery scan · Route 3",
      description:
        "The next dashboard cart has not reached GA-18. One correct dashboard remains at the station.",
      likelyCause:
        "The cart missed its route scan or the Route 3 tugger is delayed between delivery zones.",
      containment:
        "Use the remaining dashboard, contact Route 3 and confirm the next cart ID before it is moved to the station.",
      permanentFix:
        "Deliver the correct cart, restore the missed route scan and confirm the next two carts are in sequence.",
      owner: "Material flow · Route 3",
      eta: { low: 5, median: 8, high: 12 },
      history: {
        cases: 24,
        confidence: 83,
        note: "Twenty of 24 similar delays were recovered before the station stopped.",
      },
      evidence: [
        { label: "Line-side stock", value: "1 dashboard", tone: "warn" },
        { label: "Next cart", value: "Late", tone: "bad" },
        { label: "Delivery route", value: "Route 3", tone: "neutral" },
        { label: "Station state", value: "Running slowly", tone: "warn" },
      ],
      timeline: [
        {
          id: "SHIFT-MAT-7801-1",
          label: "Delivery warning raised",
          detail: "The dashboard cart missed the GA-18 arrival scan.",
          time: formatShiftTime(78),
        },
        {
          id: "SHIFT-MAT-7801-2",
          label: "Buffer checked",
          detail: "One correct dashboard remains at the station.",
          time: formatShiftTime(78),
        },
      ],
    },
  },
];

/** Alias for consumers that present the scenarios as a scheduled event list. */
export const scheduledShiftEvents = shiftScenarios;

export function getScheduledScenario(tick: number) {
  const normalizedTick = clampTick(tick);
  return shiftScenarios.find((scenario) => scenario.tick === normalizedTick);
}

export function getScenarioByIncidentId(incidentId: string) {
  return shiftScenarios.find((scenario) => scenario.incident.id === incidentId);
}

function getActiveScenarios(activeReferences: ActiveShiftReferences) {
  const active = new Set(activeReferences);

  return shiftScenarios.filter(
    (scenario) =>
      active.has(scenario.incident.id) ||
      active.has(scenario.incident.stationId),
  );
}

/**
 * Creates one deterministic telemetry frame for the production line.
 *
 * Pass active incident IDs, station IDs, or a mix of both. The dashboard adds
 * scheduled incidents atomically when its simulation clock reaches their tick.
 */
export function getShiftTelemetry(
  tick: number,
  activeReferences: ActiveShiftReferences = [],
  options: ShiftTelemetryOptions = {},
): ShiftTelemetrySnapshot {
  const normalizedTick = clampTick(tick, true);
  const activeScenarios = getActiveScenarios(activeReferences);
  const reroutedIncidentIds = new Set(options.reroutedIncidentIds);
  const effectsByStation = new Map(
    activeScenarios.map((scenario) => [scenario.incident.stationId, scenario]),
  );

  const stationTelemetry = stations.map<StationTelemetry>(
    (station, stationIndex) => {
      const baseline = stationBaselines[station.id] ?? {
        targetRatePerHour: TARGET_LINE_RATE_PER_HOUR,
        targetCycleTimeSeconds: 82,
        bufferUnits: 3,
      };
      const activeScenario = effectsByStation.get(station.id);

      if (activeScenario) {
        return {
          stationId: station.id,
          stationName: station.shortName,
          targetRatePerHour: baseline.targetRatePerHour,
          targetCycleTimeSeconds: baseline.targetCycleTimeSeconds,
          activeIncidentId: activeScenario.incident.id,
          ...activeScenario.telemetryEffect,
        };
      }

      const rateOffset =
        normalRateOffsets[
          (normalizedTick + stationIndex * 2) % normalRateOffsets.length
        ];

      return {
        stationId: station.id,
        stationName: station.shortName,
        state: "running",
        ratePerHour: baseline.targetRatePerHour + rateOffset,
        targetRatePerHour: baseline.targetRatePerHour,
        cycleTimeSeconds: baseline.targetCycleTimeSeconds - rateOffset,
        targetCycleTimeSeconds: baseline.targetCycleTimeSeconds,
        bufferUnits: baseline.bufferUnits,
        detail: "Running to plan.",
      };
    },
  );

  const hasStoppedStation = stationTelemetry.some(
    (station) => station.state === "stopped",
  );
  const rerouting = activeScenarios.some(
    (scenario) =>
      scenario.rerouteRecommended &&
      reroutedIncidentIds.has(scenario.incident.id),
  );
  const degraded = stationTelemetry.some(
    (station) => station.state === "degraded",
  );
  const lineState: LineTelemetryState = rerouting
    ? "rerouting"
    : hasStoppedStation
      ? "stopped"
      : degraded
        ? "degraded"
        : "running";
  const lineRatePerHour = rerouting
    ? Math.min(
        34,
        ...stationTelemetry
          .filter((station) => station.state !== "stopped")
          .map((station) => station.ratePerHour),
      )
    : hasStoppedStation
      ? 0
      : degraded
        ? Math.min(...stationTelemetry.map((station) => station.ratePerHour))
        : TARGET_LINE_RATE_PER_HOUR +
          normalRateOffsets[normalizedTick % normalRateOffsets.length];

  return {
    tick: normalizedTick,
    time: formatShiftTime(normalizedTick),
    elapsedMinutes: normalizedTick * SHIFT_TICK_MINUTES,
    progress: normalizedTick / SHIFT_TOTAL_TICKS,
    lineState,
    lineRatePerHour,
    targetLineRatePerHour: TARGET_LINE_RATE_PER_HOUR,
    activeIncidentIds: activeScenarios.map((scenario) => scenario.incident.id),
    stations: stationTelemetry,
  };
}
