"use client";

import dynamic from "next/dynamic";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  BroadcastIcon,
  CheckCircleIcon,
  CornersOutIcon,
  CubeIcon,
  FactoryIcon,
  PlusIcon,
  PulseIcon,
  ShieldWarningIcon,
  SirenIcon,
  TimerIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  diagnoseIncident,
  getStation,
  initialIncidents,
  type Impact,
  type Incident,
  type IncidentStatus,
  stations,
} from "@/lib/line-data";

const FactoryTwin = dynamic(
  () => import("@/components/factory-twin").then((module) => module.FactoryTwin),
  {
    ssr: false,
    loading: () => (
      <div className="scene-loading" aria-label="Loading 3D assembly line">
        <div className="scene-loading-lines" aria-hidden="true" />
        <p>Loading line geometry</p>
        <span>Focused line · local assets</span>
      </div>
    ),
  },
);

type ListFilter = "open" | "all";

const statusLabels: Record<IncidentStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  contained: "Contained",
  resolved: "Resolved",
};

function TeslaWordmark() {
  return (
    <div className="brand">
      <span className="tesla-wordmark">TESLA</span>
      <span className="brand-divider" />
      <span className="product-name">LINE CONTROL</span>
    </div>
  );
}

function StatusPill({ incident }: { incident: Incident }) {
  return (
    <span className={`severity-pill severity-${incident.severity}`}>
      {incident.severity}
    </span>
  );
}

function IncidentCard({
  incident,
  selected,
  onSelect,
}: {
  incident: Incident;
  selected: boolean;
  onSelect: () => void;
}) {
  const station = getStation(incident.stationId);
  return (
    <button
      className={`incident-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="incident-priority">P{incident.priorityScore}</span>
      <span className="incident-copy">
        <span className="incident-card-topline">
          <StatusPill incident={incident} />
          <span className="incident-age">
            {incident.ageMinutes === 0 ? "just now" : `${incident.ageMinutes}m ago`}
          </span>
        </span>
        <strong>{incident.title}</strong>
        <span className="incident-location">
          {station.id} · {station.name}
        </span>
      </span>
      <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
    </button>
  );
}

function EvidenceGrid({ incident }: { incident: Incident }) {
  return (
    <div className="evidence-grid">
      {incident.evidence.map((item) => (
        <div className="evidence-item" key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone ? `value-${item.tone}` : undefined}>
            {item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

function IncidentDetail({
  incident,
  onStatusChange,
}: {
  incident: Incident;
  onStatusChange: (status: IncidentStatus) => void;
}) {
  const station = getStation(incident.stationId);
  const canAcknowledge = incident.status === "new";
  const canContain = !["contained", "resolved"].includes(incident.status);
  const isResolved = incident.status === "resolved";

  return (
    <section className="incident-detail" aria-label={`Details for ${incident.title}`}>
      <header className="detail-header">
        <div>
          <div className="detail-kicker">
            <StatusPill incident={incident} />
            <span>{incident.code}</span>
            <span>{statusLabels[incident.status]}</span>
          </div>
          <h2>{incident.title}</h2>
          <p>
            {station.id} · {station.area} · {incident.source}
          </p>
        </div>
        <div className="repair-estimate" role="group" aria-label="Estimated repair time">
          <TimerIcon size={18} aria-hidden="true" />
          <span>
            Estimated repair
            <strong>{incident.eta.median} min</strong>
          </span>
          <small>
            {incident.eta.low}–{incident.eta.high} min range
          </small>
        </div>
      </header>

      <div className="detail-scroll">
        <EvidenceGrid incident={incident} />

        <div className="diagnosis-block">
          <div className="section-label">
            <PulseIcon size={15} aria-hidden="true" />
            What the data indicates
          </div>
          <p>{incident.likelyCause}</p>
          <div className="history-proof">
            <strong>{incident.history.confidence}% match confidence</strong>
            <span>{incident.history.note}</span>
          </div>
        </div>

        <div className="response-grid">
          <div>
            <div className="section-label">
              <ShieldWarningIcon size={15} aria-hidden="true" />
              Do now
            </div>
            <p>{incident.containment}</p>
          </div>
          <div>
            <div className="section-label">
              <WrenchIcon size={15} aria-hidden="true" />
              Permanent repair
            </div>
            <p>{incident.permanentFix}</p>
          </div>
        </div>

        <div className="owner-row">
          <span>Assigned owner</span>
          <strong>{incident.owner}</strong>
        </div>

        <div className="timeline">
          <div className="section-label">Event log</div>
          {incident.timeline.map((entry) => (
            <div className="timeline-entry" key={entry.id}>
              <time>{entry.time}</time>
              <span>
                <strong>{entry.label}</strong>
                {entry.detail}
              </span>
            </div>
          ))}
        </div>
      </div>

      <footer className="detail-actions">
        {isResolved ? (
          <button className="secondary-button" onClick={() => onStatusChange("in_progress")}>
            <ArrowCounterClockwiseIcon size={16} aria-hidden="true" />
            Reopen
          </button>
        ) : (
          <>
            {canAcknowledge && (
              <button
                className="secondary-button"
                onClick={() => onStatusChange("acknowledged")}
              >
                Acknowledge
              </button>
            )}
            {canContain && (
              <button
                className="secondary-button"
                onClick={() => onStatusChange("contained")}
              >
                Containment applied
              </button>
            )}
            <button className="primary-button" onClick={() => onStatusChange("resolved")}>
              <CheckCircleIcon size={17} weight="bold" aria-hidden="true" />
              Mark resolved
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

function NewIncidentDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (incident: Incident) => void;
}) {
  const [description, setDescription] = useState("");
  const [stationId, setStationId] = useState("GA-32");
  const [impact, setImpact] = useState<Impact>("degraded");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 8) {
      setError("Describe what the operator, sensor or supervisor observed.");
      return;
    }
    onCreate(diagnoseIncident({ description, stationId, impact }));
    setDescription("");
    setError("");
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="incident-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-incident-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Presentation mode</span>
            <h2 id="new-incident-title">Report an incident</h2>
            <p>Enter a problem in the judge’s own words. The demo matches it to mock fault history.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <XIcon size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit}>
          <label className="field full-field">
            <span>What happened?</span>
            <textarea
              autoFocus
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setError("");
              }}
              placeholder="Example: The welding robot stopped after touching the fixture and will not restart."
              rows={4}
            />
            <small>Use observed facts. The prototype does not invent sensor readings.</small>
            {error && <em className="field-error">{error}</em>}
          </label>

          <div className="form-row">
            <label className="field">
              <span>Station</span>
              <select value={stationId} onChange={(event) => setStationId(event.target.value)}>
                {stations.map((station) => (
                  <option value={station.id} key={station.id}>
                    {station.id} · {station.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Current effect</span>
              <select value={impact} onChange={(event) => setImpact(event.target.value as Impact)}>
                <option value="degraded">Line still running</option>
                <option value="quality_hold">Quality hold</option>
                <option value="line_stop">Line stopped</option>
                <option value="safety_stop">Safety stop</option>
              </select>
            </label>
          </div>

          <div className="logic-note">
            <BroadcastIcon size={18} aria-hidden="true" />
            <span>
              <strong>Explainable demo logic</strong>
              Keywords identify a fault family; the stated impact sets priority. Repair time comes from comparable mock cases.
            </span>
          </div>

          <footer>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Create and assess incident
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function LineControlDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [selectedId, setSelectedId] = useState(initialIncidents[0].id);
  const [filter, setFilter] = useState<ListFilter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const firstFrame = window.requestAnimationFrame(updateClock);
    const timer = window.setInterval(updateClock, 1000);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearInterval(timer);
    };
  }, []);

  const sortedIncidents = useMemo(
    () =>
      [...incidents]
        .filter((incident) => filter === "all" || incident.status !== "resolved")
        .sort((a, b) => {
          if (a.status === "resolved" && b.status !== "resolved") return 1;
          if (b.status === "resolved" && a.status !== "resolved") return -1;
          return b.priorityScore - a.priorityScore;
        }),
    [filter, incidents],
  );

  const activeIncidents = incidents.filter((incident) => incident.status !== "resolved");
  const selected = incidents.find((incident) => incident.id === selectedId) ?? sortedIncidents[0];
  const lineStopped = activeIncidents.some(
    (incident) => incident.impact === "safety_stop" || incident.impact === "line_stop",
  );
  const criticalCount = activeIncidents.filter((incident) => incident.severity === "critical").length;

  const handleStatusChange = (status: IncidentStatus) => {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedId
          ? {
              ...incident,
              status,
              timeline: [
                ...incident.timeline,
                {
                  id: `${incident.id}-${Date.now()}`,
                  label: statusLabels[status],
                  detail:
                    status === "resolved"
                      ? "Supervisor confirmed the station can return to normal operation."
                      : status === "contained"
                        ? "Immediate containment recorded by the supervisor."
                        : "Incident state updated by the supervisor.",
                  time: new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  }).format(new Date()),
                },
              ],
            }
          : incident,
      ),
    );
  };

  const createIncident = (incident: Incident) => {
    setIncidents((current) => [incident, ...current]);
    setSelectedId(incident.id);
    setFilter("open");
    setDialogOpen(false);
  };

  const resetScenario = () => {
    setIncidents(initialIncidents);
    setSelectedId(initialIncidents[0].id);
    setFilter("open");
  };

  const openFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  return (
    <main className="control-shell">
      <header className="topbar">
        <TeslaWordmark />
        <div className="line-identity">
          <span>Factory 01</span>
          <strong>General assembly · Line 1</strong>
        </div>
        <div className="topbar-status">
          <span className={`line-state ${lineStopped ? "is-stopped" : "is-running"}`}>
            <span className="state-dot" />
            {lineStopped ? "LINE STOPPED" : "LINE RUNNING"}
          </span>
          <span className="clock">
            {now
              ? new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                }).format(now)
              : "--:--:--"}
          </span>
          <button className="icon-button desktop-only" onClick={openFullscreen} aria-label="Toggle fullscreen">
            <CornersOutIcon size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="metrics-strip" aria-label="Line metrics" tabIndex={0}>
        <div className="metric-primary">
          <span>Current output</span>
          <strong>{lineStopped ? "0" : "39"}</strong>
          <small>/ 44 JPH</small>
        </div>
        <div>
          <span>Shift output</span>
          <strong>286</strong>
          <small>/ 344 plan</small>
        </div>
        <div>
          <span>Active incidents</span>
          <strong>{activeIncidents.length}</strong>
          <small>{criticalCount} stops line</small>
        </div>
        <div>
          <span>Estimated loss</span>
          <strong>2.6</strong>
          <small>vehicles</small>
        </div>
        <div className="shift-block">
          <span>Shift B</span>
          <strong>03:18 remaining</strong>
        </div>
      </section>

      <div className="workspace">
        <section className="twin-panel" aria-label="3D assembly line">
          <div className="scene-toolbar">
            <div>
              <CubeIcon size={16} aria-hidden="true" />
              <span>Line 1 · isolated view</span>
              <small>Concept geometry · mock telemetry</small>
            </div>
            <button className="scene-action" onClick={resetScenario}>
              <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />
              Reset demo
            </button>
          </div>

          <FactoryTwin
            incidents={activeIncidents}
            selectedId={selectedId}
            onSelectIncident={setSelectedId}
          />

          <div className="scene-key">
            <span><i className="key-critical" /> Line / safety stop</span>
            <span><i className="key-high" /> Quality hold</span>
            <span><i className="key-medium" /> Running degraded</span>
          </div>
          <div className="scene-help desktop-only">Drag to orbit · Scroll to zoom · Select a station marker</div>
        </section>

        <aside className="operations-rail">
          <section className="incident-list-panel">
            <header className="rail-header">
              <div>
                <span className="eyebrow">Shift incidents</span>
                <h1>What needs action</h1>
              </div>
              <button className="new-incident-button" onClick={() => setDialogOpen(true)}>
                <PlusIcon size={16} weight="bold" aria-hidden="true" />
                Report
              </button>
            </header>

            <div className="list-filter" role="tablist" aria-label="Incident filter">
              <button
                role="tab"
                aria-selected={filter === "open"}
                className={filter === "open" ? "is-active" : ""}
                onClick={() => setFilter("open")}
              >
                Open <span>{activeIncidents.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={filter === "all"}
                className={filter === "all" ? "is-active" : ""}
                onClick={() => setFilter("all")}
              >
                All <span>{incidents.length}</span>
              </button>
            </div>

            <div className="incident-list">
              {sortedIncidents.length > 0 ? (
                sortedIncidents.map((incident) => (
                  <IncidentCard
                    incident={incident}
                    selected={incident.id === selectedId}
                    onSelect={() => setSelectedId(incident.id)}
                    key={incident.id}
                  />
                ))
              ) : (
                <div className="empty-incidents">
                  <CheckCircleIcon size={28} weight="light" aria-hidden="true" />
                  <strong>No open incidents</strong>
                  <span>The line has no unresolved events.</span>
                </div>
              )}
            </div>
          </section>

          {selected ? (
            <IncidentDetail incident={selected} onStatusChange={handleStatusChange} />
          ) : (
            <div className="no-selection">
              <FactoryIcon size={26} aria-hidden="true" />
              <p>Select a line incident to inspect its evidence and next action.</p>
            </div>
          )}
        </aside>
      </div>

      <button className="mobile-report" onClick={() => setDialogOpen(true)}>
        <SirenIcon size={18} weight="bold" aria-hidden="true" />
        Report incident
      </button>

      <NewIncidentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createIncident}
      />
    </main>
  );
}
