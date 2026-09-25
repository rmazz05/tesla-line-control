"use client";

import dynamic from "next/dynamic";
import {
  ArrowCounterClockwiseIcon,
  BroadcastIcon,
  CheckCircleIcon,
  CubeIcon,
  FactoryIcon,
  PlusIcon,
  PulseIcon,
  ShieldWarningIcon,
  SirenIcon,
  TimerIcon,
  XIcon,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  diagnoseIncident,
  getStation,
  initialIncidents,
  type Impact,
  type Incident,
  type IncidentStatus,
  stations,
} from "@/lib/line-data";
import {
  createTeamTicket,
  initialTickets,
  recommendedTeamForIncident,
  teamLabels,
  ticketStatusLabels,
  type SupportTeam,
  type TeamTicket,
  type TicketStatus,
} from "@/lib/team-requests";

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

type RailTab = "incidents" | "requests";
type Notice = { id: number; text: string; tone: "sent" | "confirmed" };

const statusLabels: Record<IncidentStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  contained: "Contained",
  resolved: "Resolved",
};

const responseNames: Record<SupportTeam, string> = {
  maintenance: "Electrical response · Team 2",
  quality: "GA quality response",
  material_flow: "Route 3 dispatcher",
  production_planning: "Line planning desk",
  engineering: "Controls engineering",
};

const responseEtas: Record<SupportTeam, number> = {
  maintenance: 5,
  quality: 4,
  material_flow: 6,
  production_planning: 7,
  engineering: 9,
};

const currentTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

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
    <span className={"severity-pill severity-" + incident.severity}>
      {incident.severity}
    </span>
  );
}

function TicketState({ status }: { status: TicketStatus }) {
  return (
    <span className={"ticket-state status-" + status}>
      <i aria-hidden="true" />
      {ticketStatusLabels[status]}
    </span>
  );
}

function IncidentCard({
  incident,
  selected,
  tickets,
  onSelect,
}: {
  incident: Incident;
  selected: boolean;
  tickets: TeamTicket[];
  onSelect: () => void;
}) {
  const station = getStation(incident.stationId);
  const openRequests = tickets.filter((ticket) => ticket.status !== "closed");
  const unconfirmed = openRequests.filter((ticket) => ticket.status === "awaiting_ack").length;
  const requestText =
    openRequests.length === 0
      ? "No team contacted"
      : unconfirmed > 0
        ? String(unconfirmed) + " awaiting confirmation"
        : String(openRequests.length) + (openRequests.length === 1 ? " team responding" : " teams responding");

  return (
    <button
      className={"incident-card" + (selected ? " is-selected" : "")}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="incident-copy">
        <span className="incident-card-topline">
          <StatusPill incident={incident} />
          <span className="incident-age">
            {incident.ageMinutes === 0 ? "just now" : String(incident.ageMinutes) + "m ago"}
          </span>
        </span>
        <strong>{incident.title}</strong>
        <span className="incident-location">
          {station.id} · {station.name}
        </span>
        <span className={"incident-request-note" + (unconfirmed > 0 ? " needs-confirmation" : "")}>
          {requestText}
        </span>
      </span>
    </button>
  );
}

function IncidentRequestRow({ ticket }: { ticket: TeamTicket }) {
  return (
    <div className="incident-request-row">
      <span>
        <strong>{teamLabels[ticket.team]}</strong>
        <small>{ticket.id}</small>
      </span>
      <TicketState status={ticket.status} />
      <span className="request-response">
        {ticket.status === "awaiting_ack"
          ? "Reply due in " + String(ticket.responseTargetMinutes) + " min"
          : ticket.assignee || "Team acknowledged"}
        {ticket.etaMinutes !== undefined && <small>ETA {ticket.etaMinutes} min</small>}
      </span>
    </div>
  );
}

function IncidentDetail({
  incident,
  tickets,
  onStatusChange,
  onDispatch,
  onViewRequests,
}: {
  incident: Incident;
  tickets: TeamTicket[];
  onStatusChange: (status: IncidentStatus) => void;
  onDispatch: () => void;
  onViewRequests: () => void;
}) {
  const station = getStation(incident.stationId);
  const openRequests = tickets.filter((ticket) => ticket.status !== "closed");
  const suggestedTeam = recommendedTeamForIncident(incident);
  const canAcknowledge = incident.status === "new";
  const isContained = incident.status === "contained";
  const isResolved = incident.status === "resolved";

  return (
    <section className="incident-detail" aria-label={"Details for " + incident.title}>
      <header className="detail-header">
        <div>
          <div className="detail-kicker">
            <StatusPill incident={incident} />
            <span>{statusLabels[incident.status]}</span>
            <span>{incident.ageMinutes === 0 ? "just now" : String(incident.ageMinutes) + " min"}</span>
          </div>
          <h2>{incident.title}</h2>
          <p>{station.id} · {station.name} · {incident.source}</p>
        </div>
        <div className="repair-estimate" role="group" aria-label="Estimated recovery time">
          <TimerIcon size={18} aria-hidden="true" />
          <span>
            Recovery estimate
            <strong>{incident.eta.median} min</strong>
          </span>
        </div>
      </header>

      <div className="detail-scroll">
        <section className="immediate-action">
          <div className="section-label">
            <ShieldWarningIcon size={15} aria-hidden="true" />
            Do now
          </div>
          <p>{incident.containment}</p>
        </section>

        <section className="team-response-block">
          <header>
            <div>
              <div className="section-label">
                <BroadcastIcon size={15} aria-hidden="true" />
                Team response
              </div>
              <p>
                {openRequests.length > 0
                  ? "Track confirmation and arrival before relying on the handoff."
                  : "No support team has been contacted for this incident."}
              </p>
            </div>
            <button className="dispatch-button" onClick={onDispatch}>
              <BroadcastIcon size={15} weight="bold" aria-hidden="true" />
              {openRequests.length > 0
                ? "Request another team"
                : "Request " + teamLabels[suggestedTeam].toLowerCase()}
            </button>
          </header>

          {openRequests.length > 0 && (
            <div className="incident-request-list">
              {openRequests.map((ticket) => (
                <IncidentRequestRow ticket={ticket} key={ticket.id} />
              ))}
              <button className="text-button" onClick={onViewRequests}>
                Open all team requests
              </button>
            </div>
          )}
        </section>

        <section className="cause-summary">
          <div className="section-label">
            <PulseIcon size={15} aria-hidden="true" />
            Likely cause
          </div>
          <p>{incident.likelyCause}</p>
        </section>

        <details className="technical-disclosure">
          <summary>Sensor data and repair scope</summary>
          <div className="compact-evidence">
            {incident.evidence.map((item) => (
              <span key={item.label}>
                <small>{item.label}</small>
                <strong className={item.tone ? "value-" + item.tone : undefined}>
                  {item.value}
                </strong>
              </span>
            ))}
          </div>
          <div className="technical-copy">
            <strong>{incident.history.confidence}% historical match</strong>
            <p>{incident.history.note}</p>
            <strong>Suggested repair scope</strong>
            <p>{incident.permanentFix}</p>
          </div>
        </details>

        <details className="technical-disclosure activity-disclosure">
          <summary>Activity · {incident.timeline.length} updates</summary>
          <div className="compact-timeline">
            {[...incident.timeline].reverse().map((entry) => (
              <div key={entry.id}>
                <time>{entry.time}</time>
                <span>
                  <strong>{entry.label}</strong>
                  {entry.detail}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>

      <footer className="detail-actions">
        {isResolved ? (
          <button className="secondary-button" onClick={() => onStatusChange("in_progress")}>
            <ArrowCounterClockwiseIcon size={16} aria-hidden="true" />
            Reopen incident
          </button>
        ) : (
          <>
            {canAcknowledge && (
              <button className="secondary-button" onClick={() => onStatusChange("acknowledged")}>
                Acknowledge
              </button>
            )}
            <button
              className="primary-button"
              onClick={() => onStatusChange(isContained ? "resolved" : "contained")}
            >
              <CheckCircleIcon size={17} weight="bold" aria-hidden="true" />
              {isContained
                ? incident.impact === "line_stop" || incident.impact === "safety_stop"
                  ? "Return line to service"
                  : "Resolve incident"
                : "Containment complete"}
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

function TicketRow({
  ticket,
  incident,
  onOpenIncident,
  onFollowUp,
  onVerify,
}: {
  ticket: TeamTicket;
  incident: Incident;
  onOpenIncident: () => void;
  onFollowUp: () => void;
  onVerify: () => void;
}) {
  const latestUpdate = ticket.updates[ticket.updates.length - 1];
  const station = getStation(ticket.stationId);

  return (
    <article className={"ticket-row ticket-" + ticket.status}>
      <header>
        <span className="ticket-team">{teamLabels[ticket.team]}</span>
        <TicketState status={ticket.status} />
      </header>
      <h3>{ticket.subject}</h3>
      <p className="ticket-link">
        {ticket.id} · {station.id} · {incident.title}
      </p>
      <p className="ticket-request">{ticket.request}</p>
      <div className="ticket-response-line">
        {ticket.status === "awaiting_ack" ? (
          <span className="response-missing">
            No confirmation · reply target {ticket.responseTargetMinutes} min
          </span>
        ) : (
          <span>
            <strong>{ticket.assignee || teamLabels[ticket.team]}</strong>
            {ticket.etaMinutes !== undefined && " · ETA " + String(ticket.etaMinutes) + " min"}
          </span>
        )}
      </div>
      <div className="ticket-last-update">
        <time>{latestUpdate.time}</time>
        <span>{latestUpdate.message}</span>
      </div>
      <footer>
        <button className="text-button" onClick={onOpenIncident}>
          Open incident
        </button>
        {ticket.status === "awaiting_ack" && (
          <button className="secondary-button compact-button" onClick={onFollowUp}>
            Log radio follow-up
          </button>
        )}
        {ticket.status === "ready_for_check" && (
          <button className="primary-button compact-button" onClick={onVerify}>
            Verify and close
          </button>
        )}
      </footer>
    </article>
  );
}

function TeamRequestPanel({
  tickets,
  incidents,
  onOpenIncident,
  onFollowUp,
  onVerify,
}: {
  tickets: TeamTicket[];
  incidents: Incident[];
  onOpenIncident: (incidentId: string) => void;
  onFollowUp: (ticketId: string) => void;
  onVerify: (ticketId: string) => void;
}) {
  const rank: Record<TicketStatus, number> = {
    awaiting_ack: 0,
    blocked: 1,
    ready_for_check: 2,
    working: 3,
    acknowledged: 4,
    closed: 5,
  };
  const openTickets = [...tickets]
    .filter((ticket) => ticket.status !== "closed")
    .sort((a, b) => rank[a.status] - rank[b.status]);
  const waiting = openTickets.filter((ticket) => ticket.status === "awaiting_ack").length;

  return (
    <section className="request-panel" aria-label="Open team requests">
      <header className="request-panel-header">
        <div>
          <span className="eyebrow">Cross-team follow-up</span>
          <h2>Open team requests</h2>
        </div>
        <span className={waiting > 0 ? "waiting-count has-waiting" : "waiting-count"}>
          {waiting} awaiting reply
        </span>
      </header>

      <div className="ticket-list">
        {openTickets.length > 0 ? (
          openTickets.map((ticket) => {
            const incident =
              incidents.find((item) => item.id === ticket.incidentId) ?? incidents[0];
            return (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                incident={incident}
                onOpenIncident={() => onOpenIncident(ticket.incidentId)}
                onFollowUp={() => onFollowUp(ticket.id)}
                onVerify={() => onVerify(ticket.id)}
              />
            );
          })
        ) : (
          <div className="empty-incidents">
            <CheckCircleIcon size={30} weight="light" aria-hidden="true" />
            <strong>No open team requests</strong>
            <span>Every support handoff has been confirmed and closed.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function NewIncidentDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (incident: Incident) => void;
}) {
  const [description, setDescription] = useState("");
  const [stationId, setStationId] = useState("GA-32");
  const [impact, setImpact] = useState<Impact>("degraded");
  const [error, setError] = useState("");

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 8) {
      setError("Describe what the operator, sensor or supervisor observed.");
      return;
    }
    onCreate(diagnoseIncident({ description, stationId, impact }));
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
            <h2 id="new-incident-title">Report line issue</h2>
            <p>Record the observed condition and its current effect on production.</p>
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
              placeholder="Example: The glass robot stopped after touching the fixture and will not restart."
              rows={4}
            />
            <small>Use observed facts. Sensor values can be added after the incident is created.</small>
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

          <footer>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">Create incident</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function DispatchDialog({
  incident,
  onClose,
  onSend,
}: {
  incident: Incident;
  onClose: () => void;
  onSend: (team: SupportTeam, request: string) => void;
}) {
  const [team, setTeam] = useState<SupportTeam>(() => recommendedTeamForIncident(incident));
  const [request, setRequest] = useState(incident.containment);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend(team, request);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="incident-dialog dispatch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="dispatch-title">Send team request</h2>
            <p>{incident.stationId} · {incident.title}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <XIcon size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit}>
          <label className="field">
            <span>Responding team</span>
            <select value={team} onChange={(event) => setTeam(event.target.value as SupportTeam)}>
              {(Object.keys(teamLabels) as SupportTeam[]).map((value) => (
                <option value={value} key={value}>{teamLabels[value]}</option>
              ))}
            </select>
          </label>

          <label className="field dispatch-request-field">
            <span>Requested action</span>
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={5}
              required
            />
          </label>

          <div className="channel-note">
            <BroadcastIcon size={18} aria-hidden="true" />
            <span>
              <strong>Reply target: {incident.severity === "critical" ? "2" : "5"} minutes</strong>
              Prototype channel: team mobile alert and area radio queue.
            </span>
          </div>

          <footer>
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button">
              <BroadcastIcon size={16} weight="bold" aria-hidden="true" />
              Send request
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function LineControlDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [tickets, setTickets] = useState<TeamTicket[]>(initialTickets);
  const [selectedId, setSelectedId] = useState(initialIncidents[0].id);
  const [railTab, setRailTab] = useState<RailTab>("incidents");
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [dispatchIncidentId, setDispatchIncidentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const responseTimers = useRef<number[]>([]);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const firstFrame = window.requestAnimationFrame(updateClock);
    const timer = window.setInterval(updateClock, 1000);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(
    () => () => {
      responseTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const activeIncidents = useMemo(
    () =>
      incidents
        .filter((incident) => incident.status !== "resolved")
        .sort((a, b) => b.priorityScore - a.priorityScore),
    [incidents],
  );
  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== "closed"),
    [tickets],
  );
  const awaitingCount = openTickets.filter((ticket) => ticket.status === "awaiting_ack").length;
  const selected =
    incidents.find((incident) => incident.id === selectedId) ?? activeIncidents[0];
  const selectedTickets = selected
    ? tickets.filter((ticket) => ticket.incidentId === selected.id)
    : [];
  const lineStopped = activeIncidents.some(
    (incident) => incident.impact === "safety_stop" || incident.impact === "line_stop",
  );
  const criticalCount = activeIncidents.filter((incident) => incident.severity === "critical").length;
  const dispatchIncident =
    incidents.find((incident) => incident.id === dispatchIncidentId) ?? null;

  const addIncidentActivity = (incidentId: string, label: string, detail: string) => {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === incidentId
          ? {
              ...incident,
              timeline: [
                ...incident.timeline,
                {
                  id: incident.id + "-" + String(Date.now()),
                  label,
                  detail,
                  time: currentTime(),
                },
              ],
            }
          : incident,
      ),
    );
  };

  const handleStatusChange = (status: IncidentStatus) => {
    const changingId = selectedId;
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === changingId
          ? {
              ...incident,
              status,
              timeline: [
                ...incident.timeline,
                {
                  id: incident.id + "-" + String(Date.now()),
                  label: statusLabels[status],
                  detail:
                    status === "resolved"
                      ? "Supervisor verified the area and returned it to the production schedule."
                      : status === "contained"
                        ? "Immediate containment recorded by the supervisor."
                        : "Incident state updated by the supervisor.",
                  time: currentTime(),
                },
              ],
            }
          : incident,
      ),
    );

    if (status === "resolved") {
      const next = activeIncidents.find((incident) => incident.id !== changingId);
      if (next) setSelectedId(next.id);
    }
  };

  const createIncident = (incident: Incident) => {
    setIncidents((current) => [incident, ...current]);
    setSelectedId(incident.id);
    setRailTab("incidents");
    setIncidentDialogOpen(false);
  };

  const dispatchTicket = (team: SupportTeam, request: string) => {
    if (!dispatchIncident) return;
    const ticket = createTeamTicket({ incident: dispatchIncident, team, request });
    setTickets((current) => [ticket, ...current]);
    addIncidentActivity(
      dispatchIncident.id,
      "Request sent",
      ticket.id + " sent to " + teamLabels[team] + "; acknowledgement pending.",
    );
    setDispatchIncidentId(null);
    setRailTab("requests");
    setNotice({
      id: Date.now(),
      text: ticket.id + " sent to " + teamLabels[team] + " · awaiting confirmation",
      tone: "sent",
    });

    const timer = window.setTimeout(() => {
      const acknowledgedAt = currentTime();
      setTickets((current) =>
        current.map((item) =>
          item.id === ticket.id
            ? {
                ...item,
                status: "acknowledged",
                assignee: responseNames[team],
                etaMinutes: responseEtas[team],
                updates: [
                  ...item.updates,
                  {
                    id: item.id + "-ack",
                    time: acknowledgedAt,
                    status: "acknowledged",
                    author: responseNames[team],
                    message: "Request accepted. Response is being coordinated now.",
                  },
                ],
              }
            : item,
        ),
      );
      addIncidentActivity(
        dispatchIncident.id,
        teamLabels[team] + " confirmed",
        responseNames[team] + " accepted " + ticket.id + " with a " + String(responseEtas[team]) + " min ETA.",
      );
      setNotice({
        id: Date.now(),
        text: teamLabels[team] + " accepted " + ticket.id + " · ETA " + String(responseEtas[team]) + " min",
        tone: "confirmed",
      });
    }, 2800);
    responseTimers.current.push(timer);
  };

  const followUpTicket = (ticketId: string) => {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              priority: "urgent",
              updates: [
                ...ticket.updates,
                {
                  id: ticket.id + "-follow-" + String(Date.now()),
                  time: currentTime(),
                  status: ticket.status,
                  author: "Production supervisor",
                  message: "Radio follow-up logged; acknowledgement still required.",
                },
              ],
            }
          : ticket,
      ),
    );
    setNotice({ id: Date.now(), text: "Radio follow-up logged · confirmation still pending", tone: "sent" });
  };

  const verifyTicket = (ticketId: string) => {
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    setTickets((current) =>
      current.map((item) =>
        item.id === ticketId
          ? {
              ...item,
              status: "closed",
              updates: [
                ...item.updates,
                {
                  id: item.id + "-closed",
                  time: currentTime(),
                  status: "closed",
                  author: "Production supervisor",
                  message: "Work verified at the station; team request closed.",
                },
              ],
            }
          : item,
      ),
    );
    addIncidentActivity(ticket.incidentId, "Team work verified", ticket.id + " closed after supervisor check.");
    setNotice({ id: Date.now(), text: ticket.id + " verified and closed", tone: "confirmed" });
  };

  const openIncidentFromTicket = (incidentId: string) => {
    setSelectedId(incidentId);
    setRailTab("incidents");
  };

  const resetScenario = () => {
    responseTimers.current.forEach((timer) => window.clearTimeout(timer));
    responseTimers.current = [];
    setIncidents(initialIncidents);
    setTickets(initialTickets);
    setSelectedId(initialIncidents[0].id);
    setRailTab("incidents");
    setDispatchIncidentId(null);
    setNotice(null);
  };

  return (
    <main className="control-shell">
      <header className="topbar">
        <TeslaWordmark />
        <div className="line-identity">
          <span>Factory 01 · Shift B</span>
          <strong>General assembly · Line 1</strong>
        </div>
        <div className="topbar-status">
          <span className={"line-state " + (lineStopped ? "is-stopped" : "is-running")}>
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
          <span>Open incidents</span>
          <strong>{activeIncidents.length}</strong>
          <small>{criticalCount} stops line</small>
        </div>
        <div className={awaitingCount > 0 ? "metric-attention" : undefined}>
          <span>Team replies</span>
          <strong>{awaitingCount}</strong>
          <small>/ {openTickets.length} awaiting</small>
        </div>
      </section>

      <div className="workspace">
        <section className="twin-panel" aria-label="3D assembly line">
          <div className="scene-toolbar">
            <div>
              <CubeIcon size={16} aria-hidden="true" />
              <span>General Assembly 1</span>
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
            onSelectIncident={(id) => {
              setSelectedId(id);
              setRailTab("incidents");
            }}
          />
        </section>

        <aside className="operations-rail">
          <header className="operations-header">
            <div>
              <span className="eyebrow">Shift control</span>
              <h1>Operations</h1>
            </div>
            <button className="new-incident-button" onClick={() => setIncidentDialogOpen(true)}>
              <PlusIcon size={16} weight="bold" aria-hidden="true" />
              Report issue
            </button>
          </header>

          <nav className="rail-tabs" aria-label="Operations view">
            <button
              className={railTab === "incidents" ? "is-active" : ""}
              aria-pressed={railTab === "incidents"}
              onClick={() => setRailTab("incidents")}
            >
              Incidents <span>{activeIncidents.length}</span>
            </button>
            <button
              className={railTab === "requests" ? "is-active" : ""}
              aria-pressed={railTab === "requests"}
              onClick={() => setRailTab("requests")}
            >
              Team requests <span>{openTickets.length}</span>
              {awaitingCount > 0 && <i aria-label={String(awaitingCount) + " awaiting confirmation"} />}
            </button>
          </nav>

          <div className="rail-view">
            {railTab === "incidents" ? (
              <div className="incidents-view">
                <div className="incident-queue" aria-label="Open incidents">
                  {activeIncidents.length > 0 ? (
                    activeIncidents.map((incident) => (
                      <IncidentCard
                        incident={incident}
                        selected={incident.id === selectedId}
                        tickets={tickets.filter((ticket) => ticket.incidentId === incident.id)}
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

                {selected ? (
                  <IncidentDetail
                    incident={selected}
                    tickets={selectedTickets}
                    onStatusChange={handleStatusChange}
                    onDispatch={() => setDispatchIncidentId(selected.id)}
                    onViewRequests={() => setRailTab("requests")}
                  />
                ) : (
                  <div className="no-selection">
                    <FactoryIcon size={26} aria-hidden="true" />
                    <p>Select an incident to coordinate the response.</p>
                  </div>
                )}
              </div>
            ) : (
              <TeamRequestPanel
                tickets={tickets}
                incidents={incidents}
                onOpenIncident={openIncidentFromTicket}
                onFollowUp={followUpTicket}
                onVerify={verifyTicket}
              />
            )}
          </div>
        </aside>
      </div>

      <button className="mobile-report" onClick={() => setIncidentDialogOpen(true)}>
        <SirenIcon size={18} weight="bold" aria-hidden="true" />
        Report issue
      </button>

      {incidentDialogOpen && (
        <NewIncidentDialog
          onClose={() => setIncidentDialogOpen(false)}
          onCreate={createIncident}
        />
      )}
      {dispatchIncident && (
        <DispatchDialog
          key={dispatchIncident.id}
          incident={dispatchIncident}
          onClose={() => setDispatchIncidentId(null)}
          onSend={dispatchTicket}
        />
      )}
      {notice && (
        <div className={"response-toast toast-" + notice.tone} role="status" key={notice.id}>
          {notice.tone === "confirmed" ? (
            <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />
          ) : (
            <BroadcastIcon size={18} weight="bold" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      )}
    </main>
  );
}
