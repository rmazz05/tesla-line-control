"use client";

import dynamic from "next/dynamic";
import {
  ArrowCounterClockwiseIcon,
  BroadcastIcon,
  CheckCircleIcon,
  PlusIcon,
  ShieldWarningIcon,
  TimerIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  diagnoseIncident,
  getStation,
  type Impact,
  type Incident,
  type IncidentStatus,
  stations,
} from "@/lib/line-data";
import {
  createTeamTicket,
  recommendedTeamForIncident,
  teamLabels,
  type SupportTeam,
  type TeamTicket,
  type TicketStatus,
} from "@/lib/team-requests";
import {
  formatShiftTime,
  getScenarioByIncidentId,
  getScheduledScenario,
  getShiftTelemetry,
  SHIFT_TICK_MINUTES,
  SHIFT_TOTAL_TICKS,
  shiftScenarios,
  type ShiftScenario,
} from "@/lib/shift-simulation";
import {
  ShiftSimulationDock,
  TelemetryPanel,
} from "@/components/shift-simulation-ui";

const FactoryTwin = dynamic(
  () =>
    import("@/components/factory-twin").then((module) => module.FactoryTwin),
  {
    ssr: false,
    loading: () => (
      <div
        className="scene-loading"
        aria-label="Loading the 3D production line"
      >
        <div className="scene-loading-lines" aria-hidden="true" />
        <p>Loading Line 1</p>
      </div>
    ),
  },
);

type RailView = "issues" | "requests" | "telemetry";
type Notice = {
  id: number;
  text: string;
  tone: "sent" | "confirmed" | "alert";
};

const statusLabels: Record<IncidentStatus, string> = {
  new: "New issue",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  contained: "Contained",
  resolved: "Resolved",
};

const impactLabels: Record<Impact, string> = {
  safety_stop: "Line 1 stopped",
  line_stop: "Line 1 stopped",
  quality_hold: "Quality check",
  degraded: "Line running",
};

const ticketLabels: Record<TicketStatus, string> = {
  awaiting_ack: "Waiting for reply",
  acknowledged: "Confirmed",
  working: "Responding",
  blocked: "Blocked",
  ready_for_check: "Ready to verify",
  closed: "Closed",
};

const responseNames: Record<SupportTeam, string> = {
  maintenance: "Electrical response · Team 2",
  tool_crib: "Tool crib · Assembly support",
  quality: "GA quality response",
  material_flow: "Route 3 dispatcher",
  production_planning: "Line planning desk",
  engineering: "Controls engineering",
};

const responseEtas: Record<SupportTeam, number> = {
  maintenance: 5,
  tool_crib: 3,
  quality: 4,
  material_flow: 6,
  production_planning: 7,
  engineering: 9,
};

const ageLabel = (minutes: number) =>
  minutes === 0 ? "just now" : `${minutes} min`;

const impactTone = (impact: Impact) => {
  if (impact === "safety_stop" || impact === "line_stop") return "stop";
  if (impact === "quality_hold") return "check";
  return "running";
};

function playIncidentTone(audioContext: AudioContext | null) {
  if (!audioContext || audioContext.state !== "running") return;

  const startedAt = audioContext.currentTime;
  [0, 0.18].forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(740, startedAt + offset);
    gain.gain.setValueAtTime(0.0001, startedAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.075, startedAt + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + offset + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(startedAt + offset);
    oscillator.stop(startedAt + offset + 0.13);
  });
}

function TeslaWordmark() {
  return (
    <div className="brand" aria-label="Tesla Line Control">
      <span className="tesla-wordmark">TESLA</span>
      <span className="brand-divider" aria-hidden="true" />
      <span className="product-name">LINE CONTROL</span>
    </div>
  );
}

function TicketState({ status }: { status: TicketStatus }) {
  return (
    <span className={`ticket-state status-${status}`}>
      <i aria-hidden="true" />
      {ticketLabels[status]}
    </span>
  );
}

function TeamResponseRow({
  ticket,
  onFollowUp,
  onVerify,
}: {
  ticket: TeamTicket;
  onFollowUp: () => void;
  onVerify: () => void;
}) {
  const response =
    ticket.status === "awaiting_ack"
      ? `Sent ${ticket.sentAt}. No reply yet.`
      : ticket.status === "blocked"
        ? ticket.blockedBy || "The team reported a blocker."
        : `${ticket.assignee || teamLabels[ticket.team]}${
            ticket.etaMinutes !== undefined
              ? ` · ${ticket.etaMinutes} min ETA`
              : ""
          }`;

  return (
    <div className="team-response-row">
      <div className="team-response-copy">
        <div>
          <strong>{teamLabels[ticket.team]}</strong>
          <TicketState status={ticket.status} />
        </div>
        <p>{response}</p>
      </div>
      {ticket.status === "awaiting_ack" && (
        <button className="small-action" onClick={onFollowUp}>
          Call again
        </button>
      )}
      {ticket.status === "ready_for_check" && (
        <button className="small-action is-primary" onClick={onVerify}>
          Verify work
        </button>
      )}
    </div>
  );
}

function IssueRow({
  incident,
  tickets,
  onSelect,
}: {
  incident: Incident;
  tickets: TeamTicket[];
  onSelect: () => void;
}) {
  const station = getStation(incident.stationId);
  const waiting = tickets.some((ticket) => ticket.status === "awaiting_ack");

  return (
    <button className="other-issue-row" onClick={onSelect}>
      <i
        className={`issue-dot tone-${impactTone(incident.impact)}`}
        aria-hidden="true"
      />
      <span>
        <strong>{incident.title}</strong>
        <small>
          {station.id} · {impactLabels[incident.impact]} ·{" "}
          {ageLabel(incident.ageMinutes)}
        </small>
      </span>
      <span className={waiting ? "row-state needs-reply" : "row-state"}>
        {waiting ? "Waiting" : "Open"}
      </span>
    </button>
  );
}

function IncidentFocus({
  incident,
  tickets,
  onStatusChange,
  onDispatch,
  onViewRequests,
  onFollowUp,
  onVerify,
}: {
  incident: Incident;
  tickets: TeamTicket[];
  onStatusChange: (incidentId: string, status: IncidentStatus) => void;
  onDispatch: () => void;
  onViewRequests: () => void;
  onFollowUp: (ticketId: string) => void;
  onVerify: (ticketId: string) => void;
}) {
  const station = getStation(incident.stationId);
  const openTickets = tickets.filter((ticket) => ticket.status !== "closed");
  const suggestedTeam = recommendedTeamForIncident(incident);
  const scenario = getScenarioByIncidentId(incident.id);
  const isContained = incident.status === "contained";
  const isResolved = incident.status === "resolved";
  const stopsLine =
    incident.impact === "line_stop" || incident.impact === "safety_stop";
  const requiredRequest = tickets.find(
    (ticket) => ticket.team === suggestedTeam,
  );
  const waitingForTeamCheck = Boolean(
    isContained && requiredRequest && requiredRequest.status !== "closed",
  );
  const requiredRequestMissing = Boolean(isContained && !requiredRequest);
  const recoveryBlocked = waitingForTeamCheck || requiredRequestMissing;

  const primaryLabel = waitingForTeamCheck
    ? requiredRequest?.status === "ready_for_check"
      ? `Verify ${teamLabels[suggestedTeam]} work first`
      : `Waiting for ${teamLabels[suggestedTeam]}`
    : requiredRequestMissing
      ? `Request ${teamLabels[suggestedTeam]} before closing`
      : isResolved
        ? "Reopen issue"
        : isContained
          ? stopsLine
            ? "Confirm safe restart"
            : "Close issue"
          : scenario?.containmentActionLabel || "Record containment";

  const nextStatus: IncidentStatus = isResolved
    ? "in_progress"
    : isContained
      ? "resolved"
      : "contained";

  return (
    <article
      className="incident-focus"
      aria-label={`Current issue: ${incident.title}`}
    >
      <header className="focus-header">
        <div className="issue-meta">
          <span className={`impact-label tone-${impactTone(incident.impact)}`}>
            <i aria-hidden="true" />
            {impactLabels[incident.impact]}
          </span>
          <span>{station.id}</span>
          <span>{ageLabel(incident.ageMinutes)}</span>
        </div>
        <div className="focus-title-row">
          <div>
            <h2>{incident.title}</h2>
            <p>{incident.description}</p>
          </div>
          <div
            className="recovery-time"
            aria-label={`Estimated recovery ${incident.eta.median} minutes`}
          >
            <TimerIcon size={15} aria-hidden="true" />
            <span>
              Est. recovery
              <strong>{incident.eta.median} min</strong>
            </span>
          </div>
        </div>
      </header>

      <section className="diagnosis-summary">
        <div>
          <h3>Suggested diagnosis</h3>
          <span>
            {incident.history.confidence}% match · {incident.history.cases} past
            events
          </span>
        </div>
        <p>{incident.likelyCause}</p>
      </section>

      <section className="next-action">
        <div className="section-heading">
          <ShieldWarningIcon size={17} aria-hidden="true" />
          <h3>Do this now</h3>
        </div>
        <p>{incident.containment}</p>
        <button
          className="primary-button action-primary"
          onClick={() => onStatusChange(incident.id, nextStatus)}
          disabled={recoveryBlocked}
        >
          <CheckCircleIcon size={17} weight="bold" aria-hidden="true" />
          {primaryLabel}
        </button>
      </section>

      <section className="team-response">
        <header>
          <div>
            <h3>Team response</h3>
            <p>Recommended contact: {incident.owner}</p>
          </div>
          <button
            className="secondary-button compact-button"
            onClick={onDispatch}
          >
            <BroadcastIcon size={15} aria-hidden="true" />
            {openTickets.length > 0
              ? "Request team"
              : `Request ${teamLabels[suggestedTeam]}`}
          </button>
        </header>

        {openTickets.length > 0 ? (
          <div className="team-response-list">
            {openTickets.map((ticket) => (
              <TeamResponseRow
                key={ticket.id}
                ticket={ticket}
                onFollowUp={() => onFollowUp(ticket.id)}
                onVerify={() => onVerify(ticket.id)}
              />
            ))}
          </div>
        ) : (
          <p className="empty-response">
            No team has been requested for this issue.
          </p>
        )}

        <button className="text-button" onClick={onViewRequests}>
          View all team follow-ups
        </button>
      </section>

      <details className="detail-disclosure">
        <summary>Technical details</summary>
        <div className="technical-content">
          <dl className="technical-summary">
            <div>
              <dt>Error</dt>
              <dd>{incident.code}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{incident.source}</dd>
            </div>
          </dl>
          <div className="evidence-list">
            {incident.evidence.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong
                  className={item.tone ? `value-${item.tone}` : undefined}
                >
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
          <div className="diagnosis-copy">
            <h3>Repair path</h3>
            <p>{incident.permanentFix}</p>
          </div>
        </div>
      </details>

      <details className="detail-disclosure activity-disclosure">
        <summary>Activity history ({incident.timeline.length})</summary>
        <div className="activity-list">
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
    </article>
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
  const station = getStation(ticket.stationId);
  const response =
    ticket.status === "awaiting_ack"
      ? `Sent ${ticket.sentAt} · no reply yet`
      : `${ticket.assignee || teamLabels[ticket.team]}${
          ticket.etaMinutes !== undefined
            ? ` · ${ticket.etaMinutes} min ETA`
            : ""
        }`;

  return (
    <article className="ticket-row">
      <header>
        <strong>{teamLabels[ticket.team]}</strong>
        <TicketState status={ticket.status} />
      </header>
      <button className="ticket-incident-link" onClick={onOpenIncident}>
        {station.id} · {incident.title}
      </button>
      <p>{response}</p>
      {(ticket.status === "awaiting_ack" ||
        ticket.status === "ready_for_check") && (
        <footer>
          {ticket.status === "awaiting_ack" && (
            <button
              className="secondary-button compact-button"
              onClick={onFollowUp}
            >
              Call again
            </button>
          )}
          {ticket.status === "ready_for_check" && (
            <button
              className="primary-button compact-button"
              onClick={onVerify}
            >
              Verify work
            </button>
          )}
        </footer>
      )}
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
  const waiting = openTickets.filter(
    (ticket) => ticket.status === "awaiting_ack",
  ).length;

  return (
    <section className="request-panel" aria-label="Team follow-up">
      <div className="request-summary">
        <strong>{openTickets.length} open requests</strong>
        <span className={waiting > 0 ? "has-waiting" : undefined}>
          {waiting > 0 ? `${waiting} needs a reply` : "All teams replied"}
        </span>
      </div>
      <div className="ticket-list">
        {openTickets.length > 0 ? (
          openTickets.map((ticket) => {
            const incident =
              incidents.find((item) => item.id === ticket.incidentId) ??
              incidents[0];
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
          <div className="empty-state">
            <CheckCircleIcon size={28} weight="light" aria-hidden="true" />
            <strong>No open requests</strong>
            <span>Every team handoff has been closed.</span>
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
      setError("Describe what the operator, sensor, or supervisor observed.");
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
            <h2 id="new-incident-title">Report an issue</h2>
            <p>
              Enter what is happening now. The demo will create a diagnosis and
              response plan.
            </p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close report form"
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="field">
            <span>What happened?</span>
            <textarea
              autoFocus
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setError("");
              }}
              placeholder="Example: The glass robot stopped and will not restart."
              rows={4}
            />
            {error && <em className="field-error">{error}</em>}
          </label>
          <div className="form-row">
            <label className="field">
              <span>Station</span>
              <select
                value={stationId}
                onChange={(event) => setStationId(event.target.value)}
              >
                {stations.map((station) => (
                  <option value={station.id} key={station.id}>
                    {station.id} · {station.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Effect on production</span>
              <select
                value={impact}
                onChange={(event) => setImpact(event.target.value as Impact)}
              >
                <option value="degraded">Line still running</option>
                <option value="quality_hold">Quality check needed</option>
                <option value="line_stop">Line stopped</option>
                <option value="safety_stop">Safety stop</option>
              </select>
            </label>
          </div>
          <footer>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel report
            </button>
            <button type="submit" className="primary-button">
              Create issue
            </button>
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
  const [team, setTeam] = useState<SupportTeam>(() =>
    recommendedTeamForIncident(incident),
  );
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
            <h2 id="dispatch-title">Request a team</h2>
            <p>
              {incident.stationId} · {incident.title}
            </p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close team request form"
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="field">
            <span>Team</span>
            <select
              value={team}
              onChange={(event) => setTeam(event.target.value as SupportTeam)}
            >
              {(Object.keys(teamLabels) as SupportTeam[]).map((value) => (
                <option value={value} key={value}>
                  {teamLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field dispatch-request-field">
            <span>What do they need to do?</span>
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={5}
              required
            />
          </label>
          <footer>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel request
            </button>
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
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tickets, setTickets] = useState<TeamTicket[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [railView, setRailView] = useState<RailView>("issues");
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [dispatchIncidentId, setDispatchIncidentId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [shiftTick, setShiftTick] = useState(0);
  const [shiftRunning, setShiftRunning] = useState(false);
  const [shiftStarted, setShiftStarted] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(4);
  const [reroutedIncidentIds, setReroutedIncidentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const shiftTickRef = useRef(0);
  const ticketsRef = useRef<TeamTicket[]>([]);
  const injectedScenarioIdsRef = useRef<Set<string>>(new Set());
  const responseTimers = useRef<Map<string, number[]>>(new Map());
  const runGenerationRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const simulatedTime = useCallback(
    () => formatShiftTime(shiftTickRef.current),
    [],
  );

  const clearResponseTimers = useCallback(() => {
    responseTimers.current.forEach((timers) => {
      timers.forEach((timer) => window.clearTimeout(timer));
    });
    responseTimers.current.clear();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(
    () => () => {
      clearResponseTimers();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    },
    [clearResponseTimers],
  );

  const injectScenario = useCallback((scenario: ShiftScenario) => {
    if (injectedScenarioIdsRef.current.has(scenario.id)) return;
    injectedScenarioIdsRef.current.add(scenario.id);

    setIncidents((current) => {
      if (current.some((incident) => incident.id === scenario.incident.id)) {
        return current;
      }
      return [
        {
          ...scenario.incident,
          ageMinutes: 0,
          timeline: [...scenario.incident.timeline],
        },
        ...current,
      ];
    });
    setSelectedId(scenario.incident.id);
    setRailView("issues");
    setShiftRunning(false);
    playIncidentTone(audioContextRef.current);
    setNotice({
      id: Date.now(),
      text: `${scenario.incident.stationId} alert · ${scenario.incident.title}`,
      tone: "alert",
    });

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`Line 1 · ${scenario.incident.stationId}`, {
        body: scenario.incident.title,
        tag: scenario.id,
      });
    }
  }, []);

  const advanceSimulationTo = useCallback(
    (requestedTick: number) => {
      const nextTick = Math.min(SHIFT_TOTAL_TICKS, Math.max(0, requestedTick));
      shiftTickRef.current = nextTick;
      setShiftTick(nextTick);
      setIncidents((current) =>
        current.map((incident) => {
          const scenario = getScenarioByIncidentId(incident.id);
          return scenario && incident.status !== "resolved"
            ? {
                ...incident,
                ageMinutes: Math.max(
                  0,
                  (nextTick - scenario.tick) * SHIFT_TICK_MINUTES,
                ),
              }
            : incident;
        }),
      );

      const scheduledScenario = getScheduledScenario(nextTick);
      if (scheduledScenario) injectScenario(scheduledScenario);
      if (nextTick === SHIFT_TOTAL_TICKS) {
        setShiftRunning(false);
        setNotice({
          id: Date.now(),
          text: "Shift complete · 14:00",
          tone: "confirmed",
        });
      }
    },
    [injectScenario],
  );

  useEffect(() => {
    if (!shiftRunning || shiftTick >= SHIFT_TOTAL_TICKS) return;
    const timer = window.setTimeout(
      () => advanceSimulationTo(shiftTick + 1),
      1000 / simulationSpeed,
    );
    return () => window.clearTimeout(timer);
  }, [advanceSimulationTo, shiftRunning, shiftTick, simulationSpeed]);

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
  const awaitingCount = openTickets.filter(
    (ticket) => ticket.status === "awaiting_ack",
  ).length;
  const selected =
    incidents.find((incident) => incident.id === selectedId) ??
    activeIncidents[0];
  const selectedTickets = selected
    ? tickets.filter((ticket) => ticket.incidentId === selected.id)
    : [];
  const otherIncidents = activeIncidents.filter(
    (incident) => incident.id !== selected?.id,
  );
  const telemetry = useMemo(
    () =>
      getShiftTelemetry(
        shiftTick,
        activeIncidents.map((incident) => incident.id),
        { reroutedIncidentIds },
      ),
    [activeIncidents, reroutedIncidentIds, shiftTick],
  );
  const hasManualStop = activeIncidents.some(
    (incident) =>
      !getScenarioByIncidentId(incident.id) &&
      (incident.impact === "safety_stop" || incident.impact === "line_stop"),
  );
  const hasManualIssue = activeIncidents.some(
    (incident) => !getScenarioByIncidentId(incident.id),
  );
  const displayedLineState = hasManualStop
    ? "stopped"
    : telemetry.lineState === "running" && hasManualIssue
      ? "degraded"
      : telemetry.lineState;
  const lineRatePerHour = hasManualStop ? 0 : telemetry.lineRatePerHour;
  const dispatchIncident =
    incidents.find((incident) => incident.id === dispatchIncidentId) ?? null;
  const nextEventTick = shiftScenarios.find(
    (scenario) => scenario.tick > shiftTick,
  )?.tick;

  const addIncidentActivity = useCallback(
    (incidentId: string, label: string, detail: string) => {
      setIncidents((current) =>
        current.map((incident) =>
          incident.id === incidentId
            ? {
                ...incident,
                timeline: [
                  ...incident.timeline,
                  {
                    id: `${incident.id}-${Date.now()}`,
                    label,
                    detail,
                    time: simulatedTime(),
                  },
                ],
              }
            : incident,
        ),
      );
    },
    [simulatedTime],
  );

  const handleStatusChange = (changingId: string, status: IncidentStatus) => {
    const scenario = getScenarioByIncidentId(changingId);
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === changingId
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
                      ? "The supervisor checked the area and returned it to the production schedule."
                      : status === "contained"
                        ? "Immediate containment recorded by the supervisor."
                        : "Issue state updated by the supervisor.",
                  time: simulatedTime(),
                },
              ],
            }
          : incident,
      ),
    );

    if (scenario?.rerouteRecommended && status === "contained") {
      setReroutedIncidentIds((current) => {
        const next = new Set(current);
        next.add(changingId);
        return next;
      });
      setNotice({
        id: Date.now(),
        text: `Vehicles rerouted to ${scenario.rerouteTarget} · production protected`,
        tone: "confirmed",
      });
    }

    if (status === "resolved") {
      setReroutedIncidentIds((current) => {
        const next = new Set(current);
        next.delete(changingId);
        return next;
      });
      const next = activeIncidents.find(
        (incident) => incident.id !== changingId,
      );
      setSelectedId(next?.id ?? "");
    }
  };

  const createIncident = (incident: Incident) => {
    const createdAt = simulatedTime();
    const simulatedIncident = {
      ...incident,
      timeline: incident.timeline.map((entry) => ({
        ...entry,
        time: createdAt,
      })),
    };
    setIncidents((current) => [simulatedIncident, ...current]);
    setSelectedId(incident.id);
    setRailView("issues");
    setIncidentDialogOpen(false);
    setNotice({
      id: Date.now(),
      text: `${incident.stationId} issue created`,
      tone: "confirmed",
    });
  };

  const acknowledgeTicketAfterDelay = (ticket: TeamTicket, delay = 1400) => {
    if (responseTimers.current.has(ticket.id)) return;
    const generation = runGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (generation !== runGenerationRef.current) return;
      const latestTicket = ticketsRef.current.find(
        (item) => item.id === ticket.id,
      );
      if (!latestTicket || latestTicket.status !== "awaiting_ack") {
        responseTimers.current.delete(ticket.id);
        return;
      }
      const acknowledgedAt = simulatedTime();
      setTickets((current) => {
        const next: TeamTicket[] = current.map((item) =>
          item.id === ticket.id && item.status === "awaiting_ack"
            ? {
                ...item,
                status: "acknowledged",
                assignee: responseNames[item.team],
                etaMinutes: responseEtas[item.team],
                updates: [
                  ...item.updates,
                  {
                    id: `${item.id}-ack-${Date.now()}`,
                    time: acknowledgedAt,
                    status: "acknowledged",
                    author: responseNames[item.team],
                    message: "Request accepted. The team is responding.",
                  },
                ],
              }
            : item,
        );
        ticketsRef.current = next;
        return next;
      });
      addIncidentActivity(
        ticket.incidentId,
        `${teamLabels[ticket.team]} confirmed`,
        `${responseNames[ticket.team]} accepted ${ticket.id} with a ${responseEtas[ticket.team]} min ETA.`,
      );
      setNotice({
        id: Date.now(),
        text: `${teamLabels[ticket.team]} replied · ${responseEtas[ticket.team]} min ETA`,
        tone: "confirmed",
      });

      const readyTimer = window.setTimeout(
        () => {
          if (generation !== runGenerationRef.current) return;
          const currentTicket = ticketsRef.current.find(
            (item) => item.id === ticket.id,
          );
          if (!currentTicket || currentTicket.status !== "acknowledged") {
            responseTimers.current.delete(ticket.id);
            return;
          }
          const readyAt = simulatedTime();
          setTickets((current) => {
            const next: TeamTicket[] = current.map((item) =>
              item.id === ticket.id && item.status === "acknowledged"
                ? {
                    ...item,
                    status: "ready_for_check",
                    etaMinutes: 0,
                    updates: [
                      ...item.updates,
                      {
                        id: `${item.id}-ready-${Date.now()}`,
                        time: readyAt,
                        status: "ready_for_check",
                        author: responseNames[item.team],
                        message:
                          "Work complete. Waiting for the supervisor to check the station.",
                      },
                    ],
                  }
                : item,
            );
            ticketsRef.current = next;
            return next;
          });
          addIncidentActivity(
            ticket.incidentId,
            `${teamLabels[ticket.team]} work complete`,
            `${ticket.id} is ready for the supervisor check.`,
          );
          setNotice({
            id: Date.now(),
            text: `${teamLabels[ticket.team]} reports work complete · verify at the station`,
            tone: "confirmed",
          });
          responseTimers.current.delete(ticket.id);
        },
        ticket.team === "maintenance" ? 3600 : 2400,
      );
      responseTimers.current.set(ticket.id, [timer, readyTimer]);
    }, delay);
    responseTimers.current.set(ticket.id, [timer]);
  };

  const dispatchTicket = (team: SupportTeam, request: string) => {
    if (!dispatchIncident) return;
    const ticket = createTeamTicket({
      incident: dispatchIncident,
      team,
      request,
      atTime: simulatedTime(),
    });
    setTickets((current) => {
      const next = [ticket, ...current];
      ticketsRef.current = next;
      return next;
    });
    addIncidentActivity(
      dispatchIncident.id,
      "Request sent",
      `${ticket.id} sent to ${teamLabels[team]}; reply pending.`,
    );
    setDispatchIncidentId(null);
    setRailView("requests");
    setNotice({
      id: Date.now(),
      text: `${teamLabels[team]} request sent · waiting for reply`,
      tone: "sent",
    });
    acknowledgeTicketAfterDelay(ticket);
  };

  const followUpTicket = (ticketId: string) => {
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    setTickets((current) => {
      const next: TeamTicket[] = current.map((item) =>
        item.id === ticketId
          ? {
              ...item,
              priority: "urgent",
              updates: [
                ...item.updates,
                {
                  id: `${item.id}-follow-${Date.now()}`,
                  time: simulatedTime(),
                  status: item.status,
                  author: "Production supervisor",
                  message: "Radio follow-up logged. A reply is still required.",
                },
              ],
            }
          : item,
      );
      ticketsRef.current = next;
      return next;
    });
    setNotice({
      id: Date.now(),
      text: "Radio call logged · waiting for reply",
      tone: "sent",
    });
    if (ticket.status === "awaiting_ack")
      acknowledgeTicketAfterDelay(ticket, 900);
  };

  const verifyTicket = (ticketId: string) => {
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.status !== "ready_for_check") return;
    setTickets((current) => {
      const next: TeamTicket[] = current.map((item) =>
        item.id === ticketId && item.status === "ready_for_check"
          ? {
              ...item,
              status: "closed",
              updates: [
                ...item.updates,
                {
                  id: `${item.id}-closed-${Date.now()}`,
                  time: simulatedTime(),
                  status: "closed",
                  author: "Production supervisor",
                  message: "Work checked at the station. Request closed.",
                },
              ],
            }
          : item,
      );
      ticketsRef.current = next;
      return next;
    });
    addIncidentActivity(
      ticket.incidentId,
      "Team work verified",
      `${ticket.id} closed after the supervisor check.`,
    );
    setNotice({
      id: Date.now(),
      text: `${ticket.id} checked and closed`,
      tone: "confirmed",
    });
  };

  const openIncidentFromTicket = (incidentId: string) => {
    setSelectedId(incidentId);
    setRailView("issues");
  };

  const armAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  };

  const toggleShift = async () => {
    await armAudio();
    setShiftStarted(true);
    setShiftRunning((current) => !current);
  };

  const cycleSimulationSpeed = () => {
    setSimulationSpeed((current) =>
      current === 1 ? 4 : current === 4 ? 8 : 1,
    );
  };

  const jumpToNextEvent = async () => {
    if (nextEventTick === undefined) return;
    await armAudio();
    setShiftStarted(true);
    setShiftRunning(false);
    advanceSimulationTo(nextEventTick);
  };

  const closeIncidentDialog = useCallback(
    () => setIncidentDialogOpen(false),
    [],
  );
  const closeDispatchDialog = useCallback(
    () => setDispatchIncidentId(null),
    [],
  );

  const resetScenario = () => {
    runGenerationRef.current += 1;
    clearResponseTimers();
    injectedScenarioIdsRef.current.clear();
    ticketsRef.current = [];
    shiftTickRef.current = 0;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setIncidents([]);
    setTickets([]);
    setSelectedId("");
    setRailView("issues");
    setShiftTick(0);
    setShiftRunning(false);
    setShiftStarted(false);
    setSimulationSpeed(4);
    setReroutedIncidentIds(new Set());
    setIncidentDialogOpen(false);
    setDispatchIncidentId(null);
    setNotice(null);
    setSceneVersion((current) => current + 1);
  };

  return (
    <main className="control-shell">
      <header className="topbar">
        <div className="topbar-left">
          <TeslaWordmark />
          <div className="line-identity">
            <strong>General Assembly 1</strong>
            <span>Line 1 · Shift B</span>
          </div>
        </div>
        <div className="topbar-status">
          <span className="output-rate">
            <small>Output</small>
            <strong>
              {lineRatePerHour} / {telemetry.targetLineRatePerHour} JPH
            </strong>
          </span>
          <span className={`line-state is-${displayedLineState}`}>
            <span className="state-dot" aria-hidden="true" />
            {displayedLineState === "stopped"
              ? "Line stopped"
              : displayedLineState === "rerouting"
                ? "Running via Line 2"
                : displayedLineState === "degraded"
                  ? "Line constrained"
                  : "Line running"}
          </span>
          <span className="clock" title="Simulated shift time">
            {formatShiftTime(shiftTick)}
          </span>
          <button
            className="reset-button"
            onClick={resetScenario}
            title="Reset demo"
          >
            <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />
            <span>Reset demo</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <section
          className="twin-panel"
          aria-label="3D view of General Assembly Line 1"
        >
          <div className="scene-caption">
            <strong>Line 1</strong>
            <span>5 cells reporting · Tick {shiftTick}</span>
          </div>
          <FactoryTwin
            key={sceneVersion}
            incidents={activeIncidents}
            selectedId={selectedId}
            vehiclesRerouted={reroutedIncidentIds.size > 0}
            onSelectIncident={(id) => {
              setSelectedId(id);
              setRailView("issues");
            }}
          />
          <ShiftSimulationDock
            tick={shiftTick}
            time={formatShiftTime(shiftTick)}
            progress={shiftTick / SHIFT_TOTAL_TICKS}
            running={shiftRunning}
            started={shiftStarted}
            speed={simulationSpeed}
            telemetry={{
              ...telemetry,
              lineState: displayedLineState,
              lineRatePerHour,
            }}
            nextEventTick={nextEventTick}
            rerouted={reroutedIncidentIds.size > 0}
            onToggle={toggleShift}
            onCycleSpeed={cycleSimulationSpeed}
            onNextEvent={jumpToNextEvent}
            onOpenTelemetry={() => setRailView("telemetry")}
          />
        </section>

        <aside
          className={`operations-rail${railView === "telemetry" ? " is-telemetry" : ""}`}
        >
          {railView !== "telemetry" && (
            <header className="operations-header">
              <div>
                {railView === "requests" && (
                  <button
                    className="back-button"
                    onClick={() => setRailView("issues")}
                  >
                    ← Line issues
                  </button>
                )}
                <h1>
                  {railView === "issues" ? "Line issues" : "Team follow-up"}
                </h1>
                <p>
                  {railView === "issues"
                    ? `${activeIncidents.length} open · ${awaitingCount} waiting for a reply`
                    : "Track every request until the receiving team responds."}
                </p>
              </div>
              {railView === "issues" && (
                <button
                  className="new-incident-button"
                  onClick={() => setIncidentDialogOpen(true)}
                >
                  <PlusIcon size={16} weight="bold" aria-hidden="true" />
                  Report issue
                </button>
              )}
            </header>
          )}

          <div className="rail-view">
            {railView === "telemetry" ? (
              <TelemetryPanel
                snapshot={{
                  ...telemetry,
                  lineState: displayedLineState,
                  lineRatePerHour,
                }}
                activeIncidentIds={activeIncidents.map(
                  (incident) => incident.id,
                )}
                onBack={() => setRailView("issues")}
              />
            ) : railView === "issues" ? (
              activeIncidents.length > 0 && selected ? (
                <div className="issues-view">
                  <IncidentFocus
                    incident={selected}
                    tickets={selectedTickets}
                    onStatusChange={handleStatusChange}
                    onDispatch={() => setDispatchIncidentId(selected.id)}
                    onViewRequests={() => setRailView("requests")}
                    onFollowUp={followUpTicket}
                    onVerify={verifyTicket}
                  />
                  {otherIncidents.length > 0 && (
                    <section
                      className="other-issues"
                      aria-label="Other open issues"
                    >
                      <h2>Other issues</h2>
                      {otherIncidents.map((incident) => (
                        <IssueRow
                          key={incident.id}
                          incident={incident}
                          tickets={tickets.filter(
                            (ticket) => ticket.incidentId === incident.id,
                          )}
                          onSelect={() => setSelectedId(incident.id)}
                        />
                      ))}
                    </section>
                  )}
                </div>
              ) : (
                <div className="empty-state healthy-state">
                  <CheckCircleIcon
                    size={32}
                    weight="light"
                    aria-hidden="true"
                  />
                  <strong>
                    {shiftStarted
                      ? "Line 1 is running normally"
                      : "Shift ready"}
                  </strong>
                  <span>5 cells reporting. No action needed.</span>
                  <button
                    className="secondary-button"
                    onClick={() => setRailView("telemetry")}
                  >
                    View live data
                  </button>
                </div>
              )
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

      {incidentDialogOpen && (
        <NewIncidentDialog
          onClose={closeIncidentDialog}
          onCreate={createIncident}
        />
      )}
      {dispatchIncident && (
        <DispatchDialog
          key={dispatchIncident.id}
          incident={dispatchIncident}
          onClose={closeDispatchDialog}
          onSend={dispatchTicket}
        />
      )}
      {notice && (
        <div
          className={`response-toast toast-${notice.tone}`}
          role={notice.tone === "alert" ? "alert" : "status"}
          key={notice.id}
        >
          {notice.tone === "confirmed" ? (
            <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />
          ) : notice.tone === "alert" ? (
            <ShieldWarningIcon size={18} weight="fill" aria-hidden="true" />
          ) : (
            <BroadcastIcon size={18} weight="bold" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      )}
    </main>
  );
}
