"use client";

import {
  CaretLeftIcon,
  ChartLineIcon,
  PauseIcon,
  PlayIcon,
  PulseIcon,
  SkipForwardIcon,
  SpeedometerIcon,
} from "@phosphor-icons/react";
import {
  formatShiftTime,
  SCHEDULED_INCIDENT_TICKS,
  SHIFT_TOTAL_TICKS,
  type LineTelemetryState,
  type ShiftTelemetrySnapshot,
  type StationTelemetryState,
} from "@/lib/shift-simulation";

export type ShiftSimulationDockProps = {
  tick: number;
  time: string;
  progress: number;
  running: boolean;
  started: boolean;
  speed: number;
  telemetry: ShiftTelemetrySnapshot;
  nextEventTick?: number;
  rerouted: boolean;
  onToggle: () => void;
  onCycleSpeed: () => void;
  onNextEvent: () => void;
  onOpenTelemetry: () => void;
};

export type TelemetryPanelProps = {
  snapshot: ShiftTelemetrySnapshot;
  activeIncidentIds?: readonly string[];
  onBack: () => void;
};

const lineStateLabels: Record<LineTelemetryState, string> = {
  running: "Running to plan",
  degraded: "Running slowly",
  stopped: "Line stopped",
  rerouting: "Rerouting vehicles",
};

const stationStateLabels: Record<StationTelemetryState, string> = {
  running: "Running",
  degraded: "Running slowly",
  stopped: "Stopped",
};

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function ShiftSimulationDock({
  tick,
  time,
  progress,
  running,
  started,
  speed,
  telemetry,
  nextEventTick,
  rerouted,
  onToggle,
  onCycleSpeed,
  onNextEvent,
  onOpenTelemetry,
}: ShiftSimulationDockProps) {
  const shiftComplete = tick >= SHIFT_TOTAL_TICKS;
  const toggleLabel = shiftComplete
    ? "Shift complete"
    : !started
      ? "Start shift"
      : running
        ? "Pause shift"
        : "Resume shift";
  const progressValue = clampProgress(progress);
  const nextEventLabel =
    nextEventTick === undefined
      ? "No more scheduled issues"
      : `Tick ${nextEventTick} · ${formatShiftTime(nextEventTick)}`;

  return (
    <section
      className={`shift-simulation-dock${running ? " is-running" : " is-paused"}`}
      aria-label="Shift simulation controls"
    >
      <div className="shift-simulation-main">
        <button
          className="shift-simulation-toggle"
          type="button"
          onClick={onToggle}
          disabled={shiftComplete}
        >
          <span className="shift-simulation-toggle-icon" aria-hidden="true">
            {running ? (
              <PauseIcon size={18} weight="fill" />
            ) : (
              <PlayIcon size={18} weight="fill" />
            )}
          </span>
          <span>{toggleLabel}</span>
        </button>

        <div className="shift-simulation-clock">
          <span>Simulated time</span>
          <time dateTime={time}>{time}</time>
        </div>

        <div className="shift-simulation-progress">
          <div className="shift-simulation-progress-meta">
            <span>Shift progress</span>
            <strong>
              Tick {tick}/{SHIFT_TOTAL_TICKS}
            </strong>
          </div>
          <div className="shift-simulation-progress-track">
            <progress
              className="shift-simulation-progress-bar"
              max={1}
              value={progressValue}
              aria-label={`Shift progress: tick ${tick} of ${SHIFT_TOTAL_TICKS}. Scheduled issues at ticks ${SCHEDULED_INCIDENT_TICKS.join(", ")}.`}
            >
              {Math.round(progressValue * 100)}%
            </progress>
            <div className="shift-simulation-event-markers" aria-hidden="true">
              {SCHEDULED_INCIDENT_TICKS.map((eventTick) => (
                <i
                  className={`shift-simulation-event-marker${
                    eventTick <= tick ? " is-past" : ""
                  }${eventTick === nextEventTick ? " is-next" : ""}`}
                  key={eventTick}
                  style={{ left: `${(eventTick / SHIFT_TOTAL_TICKS) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="shift-simulation-status"
        aria-label="Current simulation status"
      >
        <span className={`shift-line-state is-${telemetry.lineState}`}>
          <i aria-hidden="true" />
          {lineStateLabels[telemetry.lineState]}
        </span>
        <span className="shift-cell-status">
          <PulseIcon size={15} weight="bold" aria-hidden="true" />
          5/5 cells online
        </span>
        {rerouted && (
          <span className="shift-reroute-status">Vehicles on Line 2</span>
        )}
      </div>

      <div className="shift-simulation-actions">
        <button
          className="shift-speed-button"
          type="button"
          onClick={onCycleSpeed}
          aria-label={`Change simulation speed. Current speed is ${speed} times.`}
        >
          <SpeedometerIcon size={16} weight="bold" aria-hidden="true" />
          <span>{speed}× speed</span>
        </button>
        <button
          className="shift-next-event-button"
          type="button"
          onClick={onNextEvent}
          disabled={nextEventTick === undefined}
          aria-label={
            nextEventTick === undefined
              ? nextEventLabel
              : `Go to next scheduled issue, ${nextEventLabel}`
          }
        >
          <SkipForwardIcon size={16} weight="fill" aria-hidden="true" />
          <span className="shift-action-copy">
            <small>Next event</small>
            <strong>{nextEventLabel}</strong>
          </span>
        </button>
        <button
          className="shift-live-data-button"
          type="button"
          onClick={onOpenTelemetry}
        >
          <ChartLineIcon size={16} weight="bold" aria-hidden="true" />
          <span>Live data</span>
        </button>
      </div>
    </section>
  );
}

export function TelemetryPanel({
  snapshot,
  activeIncidentIds,
  onBack,
}: TelemetryPanelProps) {
  const activeIds = new Set(activeIncidentIds ?? snapshot.activeIncidentIds);

  return (
    <section
      className="telemetry-panel"
      aria-labelledby="telemetry-panel-title"
    >
      <header className="telemetry-panel-header">
        <button
          className="telemetry-back-button"
          type="button"
          onClick={onBack}
        >
          <CaretLeftIcon size={17} weight="bold" aria-hidden="true" />
          <span>Back to line</span>
        </button>
        <div>
          <p className="telemetry-eyebrow">Live station data</p>
          <h2 id="telemetry-panel-title">Line telemetry</h2>
        </div>
        <time className="telemetry-time" dateTime={snapshot.time}>
          {snapshot.time}
        </time>
      </header>

      <dl className="telemetry-line-summary">
        <div>
          <dt>Line status</dt>
          <dd className={`is-${snapshot.lineState}`}>
            {lineStateLabels[snapshot.lineState]}
          </dd>
        </div>
        <div>
          <dt>Current rate</dt>
          <dd>{snapshot.lineRatePerHour} JPH</dd>
        </div>
        <div>
          <dt>Target rate</dt>
          <dd>{snapshot.targetLineRatePerHour} JPH</dd>
        </div>
        <div>
          <dt>Active issues</dt>
          <dd>{activeIds.size}</dd>
        </div>
      </dl>

      <div
        className="telemetry-stations"
        role="table"
        aria-label="Station telemetry"
      >
        <div className="telemetry-station-head" role="row">
          <span role="columnheader">Station</span>
          <span role="columnheader">State</span>
          <span role="columnheader">Rate</span>
          <span role="columnheader">Cycle</span>
          <span role="columnheader">Buffer</span>
          <span role="columnheader">Status</span>
        </div>
        <ul className="telemetry-station-list" role="rowgroup">
          {snapshot.stations.map((station) => {
            const hasActiveIssue = Boolean(
              station.activeIncidentId &&
              activeIds.has(station.activeIncidentId),
            );

            return (
              <li
                className={`telemetry-station-row is-${station.state}${
                  hasActiveIssue ? " has-active-issue" : ""
                }`}
                key={station.stationId}
                role="row"
              >
                <div className="telemetry-station-name" role="cell">
                  <strong>{station.stationId}</strong>
                  <span>{station.stationName}</span>
                </div>
                <span className="telemetry-station-state" role="cell">
                  <i aria-hidden="true" />
                  {stationStateLabels[station.state]}
                </span>
                <span className="telemetry-station-rate" role="cell">
                  <strong>{station.ratePerHour}</strong> JPH
                </span>
                <span className="telemetry-station-cycle" role="cell">
                  {station.cycleTimeSeconds === null
                    ? "No cycle"
                    : `${station.cycleTimeSeconds} sec`}
                </span>
                <span className="telemetry-station-buffer" role="cell">
                  {station.bufferUnits}{" "}
                  {station.bufferUnits === 1 ? "unit" : "units"}
                </span>
                <p className="telemetry-station-detail" role="cell">
                  {station.detail}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
