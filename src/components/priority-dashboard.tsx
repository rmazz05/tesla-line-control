"use client";

import { DecisionMethod, ResponseResults } from "./priority-demo-evidence";
import { compareResponseTiming, RESPONSE_DELAYS } from "@/lib/priority/response-impact";
import { IncidentDecision, IncidentCases } from "./incident-decision";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CaretRightIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ClockIcon,
  WarningCircleIcon,
  DownloadSimpleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShieldWarningIcon,
  SkipForwardIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { STATIONS } from "@/lib/priority/config";
import {
  addIncident,
  advanceSimulation,
  createSimulation,
  getRankedIncidents,
  getStationReadings,
  resolveIncident,
  setAutoDispatch,
  confirmContainment,
  startRepair,
} from "@/lib/priority/engine";
import { estimatedRepairMinutes } from "@/lib/priority/repair";
import { getRankingBasis } from "@/lib/priority/ranking-reason";
import { scenarioEvents, scenarioDuration, DEMO_DECISION_MINUTE } from "@/lib/priority/scenarios";
import { getIncidentPresentation, getIncidentTitle, getRecommendedResponse } from "@/lib/priority/presentation";
import type {
  AssessmentRequest,
  AssessmentResponse,
  PriorityIncident,
  RankedIncident,
  SimulationState,
  StationId,
} from "@/lib/priority/types";
import styles from "./priority-dashboard.module.css";
import { getLineActivity, type LineActivity } from "@/lib/priority/activity";
import { INSPECT_CHANNEL, isInspectMessage, requestPcInspect } from "@/lib/attention/pc-inspect";
import { MobilePriorityDashboard } from "./mobile-priority-dashboard";

const DESKTOP_QUERY = "(min-width: 768px)";
function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function desktopSnapshot() { return window.matchMedia(DESKTOP_QUERY).matches; }
// Render the lightweight phone layout during SSR. Never import the factory's
// model-preloading module until a desktop viewport has actually been confirmed.
function serverDesktopSnapshot() { return false; }

const PriorityFactoryTwin = dynamic(
  () => import("./factory-twin").then((module) => module.PriorityFactoryTwin),
  { ssr: false, loading: () => <div className={styles.sceneLoading}>Loading production line…</div> },
);

const sourceLabels = { scenario: "Scenario assessment", openai: "OpenAI assessment", offline: "Offline assessment" };
const stateLabels = { running: "Running", slowed: "Slowed", stopped: "Stopped", starved: "Waiting for input", blocked: "Output blocked" };

function timecode(minutes: number) {
  const seconds = Math.max(0, Math.round(minutes * 60));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function duration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "Not established";
  if (minutes <= 0) return "Now";
  if (minutes < 1) return `${Math.ceil(minutes * 60)}s`;
  return `${Number(minutes.toFixed(1))} min`;
}
function slackLabel(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "Uncertain";
  if (minutes < 0) return `${Number(Math.abs(minutes).toFixed(1))} min behind`;
  return `${Number(minutes.toFixed(1))} min spare`;
}
function cx(...classes: (string | false | undefined)[]) { return classes.filter(Boolean).join(" "); }

type DashboardState = { simulation: SimulationState; selectedId: string | null; activity: LineActivity | null; simulationRun: number };
function initialDashboard(scenario: "shift" | "demo" = "demo"): DashboardState {
  const simulation = createSimulation(scenario);
  return { simulation, selectedId: null, activity: null, simulationRun: 0 };
}

type DashboardAction =
  | { type: "update"; apply: (simulation: SimulationState) => SimulationState }
  | { type: "select"; id: string }
  | { type: "reset"; scenario?: "shift" | "demo" };
function reducer(state: DashboardState, action: DashboardAction): DashboardState {
  if (action.type === "select") return { ...state, selectedId: action.id };
  if (action.type === "reset") return { ...initialDashboard(action.scenario ?? state.simulation.scenario), simulationRun: state.simulationRun + 1 };
  const simulation = action.apply(state.simulation);
  return { ...state, simulation, activity: getLineActivity(state.simulation, simulation) ?? state.activity };
}

function RankMovement({ item }: { item: RankedIncident }) {
  if (item.previousRank === null) return null;
  const change = item.previousRank - item.rank;
  if (!change) return null;
  return <span className={cx(styles.rankMovement, change > 0 && styles.movedUp)} aria-label={`Moved ${change > 0 ? "up" : "down"} ${Math.abs(change)} ${Math.abs(change) === 1 ? "place" : "places"}`}>
    {change > 0 ? <ArrowUpIcon size={12} weight="bold" /> : <ArrowDownIcon size={12} weight="bold" />}{Math.abs(change)}
  </span>;
}

function FactList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className={styles.reportSection}><h4>{title}</h4>{items.length ? <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className={styles.muted}>{empty}</p>}</section>;
}

function exportReport(incident: PriorityIncident, ranked: RankedIncident | undefined, simulation: SimulationState) {
  const a = incident.assessment;
  const section = (title: string, items: string[]) => `## ${title}\n${items.length ? items.map((item) => `- ${item}`).join("\n") : "Not established."}\n`;
  const markdown = [
    `# Incident report: ${getIncidentTitle(a)}\n`,
    `Synthetic factory simulation · ${sourceLabels[a.source]}\n`,
    `Incident: ${incident.id}\nStation: ${a.stationId ?? "Unconfirmed"}\nReported: T+${timecode(incident.reportedAtMinute)}\nReport generated: T+${timecode(simulation.minute)}\nStatus: ${incident.status}\n`,
    `## Original report\n${incident.reportText}\n`,
    `## Current decision\n${ranked ? `Rank ${ranked.rank}. ${ranked.whyNow}\nTime to operational impact: ${duration(ranked.criticalInMinutes)}\nRecovery slack: ${slackLabel(ranked.slackMinutes)}` : "Incident resolved."}\n`,
    `## Diagnostic hypothesis\n${a.diagnosis}\n`,
    section("Decision factors", ranked?.decision.evidence.factors.map(factor => `${factor.name}: ${factor.finding} Source: ${factor.source}`) ?? []),
    section("Comparable cases (synthetic demonstration data)", ranked?.decision.evidence.cases.map(record => `${record.id}: ${record.equipment}; ${record.symptom}. Conditions: ${record.conditions} Outcome: ${record.outcome} Limitation: ${record.limitation}`) ?? []),
    section("Missing evidence", ranked?.decision.evidence.unknowns ?? []),
    section("Observed / reported evidence", a.evidence),
    section("Assumptions and uncertainty", a.assumptions),
    section("Potential consequences", a.consequences),
    section("Diagnostic checks", a.checks),
    `## Recommended action\n${getRecommendedResponse(ranked, a.recommendedAction)}\n`,
    `Repair estimate: ${a.needsReview || a.kind === "unknown" ? "Unconfirmed; verification required" : duration(estimatedRepairMinutes(a))}. Response team: General maintenance. Safety evidence: ${a.safety}. Quality evidence: ${a.quality}.\n`,
    a.followUpQuestion ? `## Clarification needed\n${a.followUpQuestion}\n` : "",
    section("Incident timeline", incident.history.filter((entry) => !entry.text.startsWith("Rank ")).map((entry) => `T+${timecode(entry.minute)} — ${entry.text}`)),
    section("Priority history", simulation.rankChanges.filter((entry) => entry.incidentId === incident.id).map((entry) => `T+${timecode(entry.minute)} — ${entry.from === null ? "New" : `#${entry.from}`} → ${entry.to === null ? "Resolved" : `#${entry.to}`}. ${entry.reason}`)),
    "These results use synthetic process assumptions. Operational-impact estimates are not time-to-injury predictions or validated maintenance instructions.\n",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `${incident.id}-report.md`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native dialogs keep keyboard focus inside the open panel and restore its trigger. */
function Panel({ title, id, onClose, drawer = false, children }: {
  title: string; id: string; onClose: () => void; drawer?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else document.getElementById("queue-title")?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={cx(styles.panel, drawer && styles.drawer)} aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className={styles.panelHeading}><h2 id={id}>{title}</h2><button className={styles.iconButton} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><XIcon size={20} /></button></div>
    {children}
  </dialog>;
}

export function PriorityDashboard() {
  const desktop = useSyncExternalStore(subscribeToViewport, desktopSnapshot, serverDesktopSnapshot);
  const [{ simulation, selectedId, activity, simulationRun }, dispatch] = useReducer(reducer, undefined, () => initialDashboard());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [panel, setPanel] = useState<"report" | "intake" | "controls" | "method" | "results" | null>(null);
  const [buffersOpen, setBuffersOpen] = useState(false);
  const [report, setReport] = useState("");
  const [station, setStation] = useState<StationId | "">("");
  const [pending, setPending] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState<{ configured: boolean; model: string } | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const runToken = useRef(0);
  const judgeSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const reportInput = useRef<HTMLTextAreaElement>(null);
  const ranking = useMemo(() => getRankedIncidents(simulation), [simulation]);
  const readings = useMemo(() => getStationReadings(simulation), [simulation]);
  const simulationDuration = scenarioDuration(simulation.scenario);
  const nextEvent = scenarioEvents(simulation.scenario).find((event) => !simulation.injectedEventIds.includes(event.id));
  const selected = simulation.incidents.find((incident) => incident.id === selectedId);
  const selectedRank = ranking.find((item) => item.incident.id === selectedId);
  const selectedPresentation = selectedRank ? getIncidentPresentation(selectedRank, simulation.minute) : null;
  const resolved = simulation.incidents.filter((incident) => incident.status === "resolved").slice().reverse();
  const waiting = ranking.filter((item) => item.incident.status === "open");
  const repairing = ranking.filter((item) => item.incident.status === "repairing");
  const complete = !nextEvent && ranking.length === 0;
  const results = useMemo(() => panel === "results" && complete ? RESPONSE_DELAYS.map(delay => compareResponseTiming(simulation, delay)!) : null, [panel, complete, simulation]);
  const running = playing && !complete;
  const awaitingDemoReview = simulation.scenario === "demo" && simulation.minute < DEMO_DECISION_MINUTE;
  const canDispatchSelected = selected?.status === "open" && !selected.assessment.needsReview && selected.assessment.stationId !== null && selected.assessment.kind !== "unknown" && selected.assessment.repairMinutes.max > 0;
  const finalOutput = readings.at(-1)?.ratePerHour ?? 0;
  const nominalOutput = STATIONS[STATIONS.length - 1].ratePerMinute * 60;
  const lineOutput = finalOutput === 0 ? "stopped" : finalOutput < nominalOutput ? "slowed" : "normal";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/incidents/assess", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Provider unavailable"); return response.json(); })
      .then((data: { configured: boolean; model: string }) => setProvider(data))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setProviderUnavailable(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      // Stop exactly at the concurrent arrival, at any playback speed. The
      // presenter sees the whole decision before the clock consumes its window.
      const untilReview = simulation.scenario === "demo" && simulation.minute < DEMO_DECISION_MINUTE
        ? DEMO_DECISION_MINUTE - simulation.minute : Infinity;
      const step = Math.min(speed / 60, untilReview);
      dispatch({ type: "update", apply: current => advanceSimulation(current, step) });
      if (step === untilReview) setPlaying(false);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running, speed, simulation.minute, simulation.scenario]);
  useEffect(() => { if (panel === "intake") reportInput.current?.focus(); }, [panel]);
  useEffect(() => () => requestController.current?.abort(), []);

  const incidentsRef = useRef(simulation.incidents);
  incidentsRef.current = simulation.incidents;

  useEffect(() => {
    if (!desktop || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(INSPECT_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (!isInspectMessage(event.data)) return;
      const id = event.data.incidentId;
      if (!incidentsRef.current.some((incident) => incident.id === id)) {
        setNotice("The phone asked for an incident that is not on this PC yet. Run the same demo in both windows.");
        return;
      }
      dispatch({ type: "select", id });
      setPlaying(false);
      setPanel("report");
    };
    return () => channel.close();
  }, [desktop]);

  function inspectOnPc(id: string) {
    setNotice(requestPcInspect(id)
      ? "Sent to the factory PC. Keep a wide window of this app open on this computer."
      : "This browser cannot open the incident on another window.");
  }

  function advance(minutes: number) { dispatch({ type: "update", apply: (current) => advanceSimulation(current, minutes) }); }
  function nextIncident() {
    if (!nextEvent) return;
    setPlaying(false);
    advance(Math.max(0, nextEvent.minute - simulation.minute));
  }
  function reset(scenario: "shift" | "demo" = simulation.scenario ?? "demo") {
    runToken.current += 1;
    requestController.current?.abort();
    dispatch({ type: "reset", scenario });
    setPlaying(false); setPending(false); setPanel(null); setNotice(null); setIntakeError(null);
  }
  function closePanel() {
    if (desktop && panel === "report") window.requestAnimationFrame(() => (document.getElementById(`queue-${selectedId}`) ?? document.getElementById("queue-title"))?.focus({ preventScroll: true }));
    if (panel === "intake" && pending) {
      requestController.current?.abort();
      setPending(false);
    }
    setPanel(null);
  }
  // Queue entries and mobile status/activity links open reports. Scene markers only highlight the queue.
  function openReport(id: string) {
    dispatch({ type: "select", id });
    setPlaying(false);
    setPanel("report");
  }
  function highlightIncident(id: string) {
    if (panel === "report") setPanel(null);
    dispatch({ type: "select", id });
    window.requestAnimationFrame(() => document.getElementById(`queue-${id}`)?.scrollIntoView({ block: "nearest", behavior: "instant" }));
  }
  function openIntake() { setPlaying(false); setPanel("intake"); }
  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (report.trim().length < 5 || pending) return;
    setPlaying(false);
    const token = runToken.current;
    const submittedReport = report.trim();
    const request: AssessmentRequest = {
      report: submittedReport, stationId: station || null, minute: simulation.minute, telemetry: readings,
      activeIncidents: ranking.map(({ incident }) => ({ id: incident.id, stationId: incident.assessment.stationId, title: incident.assessment.title })),
    };
    const controller = new AbortController(); requestController.current = controller;
    setPending(true); setIntakeError(null); setNotice(null);
    try {
      const response = await fetch("/api/incidents/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The incident could not be assessed. Please try again.");
      if (token !== runToken.current || controller.signal.aborted) return;
      const result = data as AssessmentResponse;
      judgeSequence.current += 1;
      const id = `judge-${token}-${judgeSequence.current}`;
      dispatch({ type: "update", apply: (current) => addIncident(current, result.assessment, submittedReport, id) });
      dispatch({ type: "select", id });
      setReport(""); setStation(""); setPanel(null);
      setNotice(result.warning ?? `${result.mode === "openai" ? "AI assessment" : "Offline assessment"} added to the queue.`);
      window.setTimeout(() => document.getElementById(`queue-${id}`)?.scrollIntoView({ block: "nearest" }), 30);
    } catch (error) {
      if (token !== runToken.current || controller.signal.aborted) return;
      setIntakeError(error instanceof Error ? error.message : "The assessment failed. Please try again.");
    } finally { if (token === runToken.current && requestController.current === controller) setPending(false); }
  }

  const RankingContainer = desktop ? "section" : "details";
  const rankingExplanation = selected?.status === "open" && selectedRank ? <RankingContainer className={styles.rankingExplanation}>
    {desktop ? <h4>Ranking decision</h4> : <summary>Ranking decision</summary>}
    <p>{getRankingBasis(selectedRank, waiting)}</p>
  </RankingContainer> : null;
  const incidentDecision = selected && selectedRank ? <IncidentDecision key={selected.id} item={selectedRank} pending={pending} showCases={!desktop} onContain={() => dispatch({ type: "update", apply: current => confirmContainment(current, selected.id) })} /> : null;

  const reportContents = selected ? <>
      <div className={styles.reportBody}>
        <div className={styles.reportMeta}><span>{selected.assessment.stationId ?? "Location unconfirmed"} · {selected.status === "resolved" ? "Resolved" : selected.status === "repairing" ? "In progress" : `Priority ${selectedRank?.rank ?? "pending"}`}</span>{desktop && <button className={styles.iconButton} onClick={() => exportReport(selected, selectedRank, simulation)} aria-label="Download incident report as Markdown" title="Download report"><DownloadSimpleIcon size={18} /></button>}</div>
        <h3 className={styles.reportTitle}>{getIncidentTitle(selected.assessment)}</h3>
        {selected.assessment.needsReview && <div className={styles.reviewCallout}><ShieldWarningIcon size={18} /><p>{selected.assessment.followUpQuestion ?? "Confirm the observations before scheduling a repair."}</p></div>}
        {selectedRank && <dl className={styles.reportMetrics}>{selected.status === "open" && <div><dt>When to act</dt><dd className={styles.reportActionTiming} data-urgency={selectedPresentation?.urgency}>{selectedPresentation?.timingLabel}</dd></div>}<div><dt>{selected.status === "repairing" ? "Repair remaining" : "Estimated repair"}</dt><dd>{selected.status === "repairing" ? duration(Math.max(0, (selected.repairCompletesAtMinute ?? simulation.minute) - simulation.minute)) : selected.assessment.needsReview ? "Unconfirmed" : duration(estimatedRepairMinutes(selected.assessment))}</dd></div></dl>}
        {rankingExplanation}
        {desktop && selectedRank && <IncidentCases item={selectedRank} />}
        {incidentDecision}
        <details className={styles.reportDetails}><summary>Original report</summary><section className={styles.observedReport}><span>{sourceLabels[selected.assessment.source]}</span><blockquote>{selected.reportText}</blockquote></section></details>
        <details className={styles.reportDetails}><summary>Recommended response & diagnostics</summary><section className={styles.diagnosis}><h4>{selected.containmentConfirmedAtMinute != null || selected.status !== "open" ? "Initial diagnostic hypothesis" : "Diagnostic hypothesis"}</h4><p>{selected.assessment.diagnosis}</p><h4>Recommended response</h4><p>{getRecommendedResponse(selectedRank, selected.assessment.recommendedAction)}</p></section>{selected.assessment.evidence.some(text => !text.includes(selected.reportText)) && <FactList title="Additional evidence" items={selected.assessment.evidence.filter(text => !text.includes(selected.reportText))} empty="" />}<FactList title="Checks" items={selected.assessment.checks} empty="Awaiting verification." /><FactList title="Assumptions" items={selected.assessment.assumptions} empty="No additional assumptions." />{!desktop && <button className={styles.textButton} onClick={() => exportReport(selected, selectedRank, simulation)}><DownloadSimpleIcon size={17} aria-hidden="true" />Download report</button>}</details>
        <details className={styles.reportDetails}><summary>Incident history</summary><ol className={styles.history}>{simulation.rankChanges.filter((change) => change.incidentId === selected.id && change.from !== null && change.to !== null).slice().reverse().map((change, index) => <li key={`rank-${index}`}><time>T+{timecode(change.minute)}</time><span>{change.from === null ? "New" : `#${change.from}`} → {change.to === null ? "Resolved" : `#${change.to}`}</span></li>)}</ol><ol className={styles.history}>{selected.history.filter((entry) => !entry.text.startsWith("Rank ")).slice().reverse().map((entry, index) => <li key={`event-${index}`}><time>T+{timecode(entry.minute)}</time><span>{entry.text}</span></li>)}</ol></details>
        <p className={styles.source}>{sourceLabels[selected.assessment.source]} · Synthetic line assumptions</p>
      </div>
      {selected.status !== "resolved" && <div className={styles.reportActions}>{selected.status === "open" ? <button className={styles.primaryButton} disabled={!canDispatchSelected || pending} title={selected.assessment.needsReview ? "Verify the report before scheduling a repair" : "Dispatch general maintenance"} onClick={() => dispatch({ type: "update", apply: (current) => startRepair(current, selected.id) })}>Dispatch to {selected.assessment.stationId ?? "station"}</button> : null}<button className={styles.textButton} disabled={pending} onClick={() => dispatch({ type: "update", apply: (current) => resolveIncident(current, selected.id) })}>Mark resolved</button></div>}
  </> : null;

  return <div className={cx(styles.shell, !desktop && styles.mobileShell)}>
    {!desktop ? <MobilePriorityDashboard
      simulation={simulation}
      ranking={ranking}
      readings={readings}
      activity={activity}
      running={running}
      pending={pending}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      onOpenReport={openReport}
      onInspectOnPc={inspectOnPc}
      onOpenIntake={openIntake}
      onOpenControls={() => setPanel("controls")}
    /> : <><header className={styles.topbar}>
      <Link href="/" className={styles.brand} aria-label="Tesla Line Priority home"><span className={styles.wordmark}>TESLA</span><span className={styles.brandDivider} /><span>Line Priority</span></Link>
      <div className={styles.topbarRight}><button className={styles.textButton} onClick={() => { setPlaying(false); setPanel("controls"); }}>Demo controls</button></div>
    </header>

    <main className={styles.workspace}>
      <section className={styles.factory} aria-label="Production line">
        <div className={styles.factoryHeading}><div><h1>General assembly</h1><span>Line 1</span></div><span className={styles.lineSummary} data-state={lineOutput}>Production {lineOutput === "slowed" ? `running ${Number(((1-finalOutput/nominalOutput)*100).toFixed(1))}% slower` : lineOutput === "stopped" ? "stopped" : "running"}</span></div>
        <div className={styles.workbench}>
          <div className={styles.scene}><PriorityFactoryTwin ranking={ranking} readings={readings} selectedId={selectedId} playing={running} minute={simulation.minute} simulationRun={simulationRun} onSelectIncident={highlightIncident} /></div>
        </div>
        {buffersOpen && <div className={styles.bufferStrip} aria-label="Station input buffers">{readings.map((reading) => <div key={reading.id} className={styles.bufferStation} title={`${reading.name}: ${stateLabels[reading.state]}`}><span>{reading.id}</span><progress value={reading.bufferUnits} max={reading.bufferCapacity} aria-label={`${reading.id} input buffer`} /><small>{Number(reading.bufferUnits.toFixed(1))} / {reading.bufferCapacity} units</small></div>)}</div>}
        {activity && <div className={styles.activity} role="status" aria-live="polite" aria-atomic="true">
          <div key={activity.id} className={styles.activityContent} data-kind={activity.kind}><span className={styles.activityIcon}>{activity.kind === "resolved" ? <CheckCircleIcon size={20} /> : activity.kind === "repairing" ? <WrenchIcon size={20} /> : <WarningCircleIcon size={20} />}</span><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><time>{timecode(activity.minute)}</time></div>
        </div>}
        <section className={styles.playback} aria-label="Simulation controls">
          <button className={styles.playButton} onClick={() => setPlaying((value) => !value)} disabled={complete || pending} aria-label={running ? "Pause simulation" : simulation.minute === 0 ? "Start simulation" : "Resume simulation"}>{running ? <PauseIcon size={15} weight="fill" /> : <PlayIcon size={15} weight="fill" />}{running ? "Pause" : complete ? "Complete" : simulation.minute === 0 ? "Start demo" : "Resume"}</button>
          <div className={styles.clock}><strong>{timecode(simulation.minute)}</strong><span>{simulation.scenario === "demo" ? "elapsed" : `/ ${simulationDuration}:00`}</span></div>
          {simulation.scenario === "demo" ? <span className={styles.timelineSpacer} aria-hidden="true" /> : <progress className={styles.timeline} max={simulationDuration} value={Math.min(simulation.minute, simulationDuration)} aria-label="Simulation progress" />}
          {(nextEvent || repairing.length > 0) && <button className={styles.nextButton} onClick={() => nextEvent ? nextIncident() : advance(Math.max(...repairing.map(item => item.incident.repairCompletesAtMinute ?? simulation.minute)) - simulation.minute)} disabled={(!nextEvent && !repairing.length) || pending}>{nextEvent ? simulation.scenario === "demo" ? "Show incoming reports" : "Next event" : "Finish repairs"}<SkipForwardIcon size={16} /></button>}
        </section>
      </section>

      {panel === "report" && selected ? <section className={cx(styles.queue, styles.reportInspector)} aria-label="Incident report" onKeyDown={event => { if (event.key === "Escape") closePanel(); }}>
        <div className={styles.inspectorHeading}><button className={styles.textButton} onClick={closePanel} autoFocus><ArrowLeftIcon size={16} />Back to priorities</button><span>Incident report</span></div>
        {waiting.length > 0 && <nav className={styles.priorityContext} aria-label="Compare waiting incidents">{waiting.map(item => {
          const p = getIncidentPresentation(item, simulation.minute);
          return <button key={item.incident.id} aria-pressed={selected.id === item.incident.id} onClick={() => openReport(item.incident.id)} data-urgency={p.urgency}><span><b>{item.rank}</b> {item.incident.assessment.stationId ?? "Unknown"}</span><small>{p.timingLabel}</small></button>;
        })}</nav>}
        {reportContents}
      </section> : <>      <section className={styles.queue} aria-labelledby="queue-title">
        <div className={styles.queueHeading}><div><h2 id="queue-title" tabIndex={-1}>Priorities <span>{waiting.length || ""}</span></h2><button className={styles.addButton} onClick={openIntake}><PlusIcon size={16} />Report incident</button></div></div>
        {notice && <div className={styles.notice} role="status"><p>{notice}</p><button className={styles.iconButton} onClick={() => setNotice(null)} aria-label="Dismiss notification"><XIcon size={16} /></button></div>}
        <div className={styles.queueScroll}>
          {waiting.length === 0 ? <div className={styles.emptyQueue}><CheckCircleIcon size={24} /><h3>{repairing.length ? "All incidents are being repaired" : resolved.length ? "All reported incidents resolved" : "All stations operating normally"}</h3><p>{simulation.incidents.length === 0 ? running ? "Monitoring the line for new incidents." : simulation.scenario === "demo" ? "Start the demo to receive three simultaneous reports." : "Start the simulation to see how incidents are detected and prioritized." : nextEvent ? "Continue the simulation for the next event." : repairing.length ? "Continue playback or finish the active repairs." : "Compare the effect of your response timing."}</p>{complete && <button className={styles.primaryButton} onClick={() => setPanel("results")}>View results</button>}</div> : <ol className={styles.incidentList}>{waiting.map((item, index) => {
            const { incident } = item;
            const presentation = getIncidentPresentation(item, simulation.minute);
            const recentMovement = simulation.rankChanges.some((change) => change.incidentId === incident.id && change.from !== null && change.to !== null && simulation.minute - change.minute <= 1);
            return <li key={incident.id}><button id={`queue-${incident.id}`} className={cx(styles.incidentRow, index === 0 && styles.firstRow, selectedId === incident.id && styles.selectedRow)} data-urgency={presentation.urgency} onClick={() => openReport(incident.id)} aria-haspopup="dialog">
              <div className={styles.rank}><strong>{item.rank}</strong>{recentMovement && <RankMovement item={item} />}</div>
              <div className={styles.incidentBody}>
                <div className={styles.incidentMeta}><span>{incident.assessment.stationId ?? "Location unconfirmed"}</span><CaretRightIcon size={15} aria-hidden="true" /></div>
                <h3>{presentation.title}</h3>
                <p className={styles.incidentDeadline}>{item.decision.evidence.safetyReview ? <ShieldWarningIcon size={16} aria-hidden="true" /> : item.decision.group < 3 ? <WarningCircleIcon size={16} aria-hidden="true" /> : <ClockIcon size={15} aria-hidden="true" />}<span>{presentation.timingLabel}</span></p>
                <p className={styles.incidentCalculation} title="Current station output comes from the simulation. The repair estimate includes checks; maintenance is always available.">{presentation.calculation ?? presentation.consequence}</p>
              </div>
            </button></li>;
          })}</ol>}
          {repairing.length > 0 && <section className={styles.activeRepairs} aria-labelledby="repairs-title"><h3 id="repairs-title">In progress <span>{repairing.length}</span></h3>{repairing.map(({ incident }) => <button id={`queue-${incident.id}`} key={incident.id} className={styles.repairRow} onClick={() => openReport(incident.id)} aria-haspopup="dialog"><WrenchIcon size={17} /><span><strong>{incident.assessment.stationId} · {getIncidentTitle(incident.assessment)}</strong>{incident.assessment.safety !== "none" && <small className={styles.urgentText}>Safety hold active</small>}</span><time>{duration(Math.max(0, (incident.repairCompletesAtMinute ?? simulation.minute) - simulation.minute))} left</time></button>)}</section>}
          {resolved.length > 0 && <details className={styles.resolved}><summary>Resolved <span>{resolved.length}</span></summary>{resolved.map((incident) => <button key={incident.id} className={styles.resolvedRow} onClick={() => openReport(incident.id)} aria-haspopup="dialog"><CheckCircleIcon size={16} /><span>{incident.assessment.stationId} · {getIncidentTitle(incident.assessment)}</span></button>)}</details>}
        </div>
        {waiting[0] && <div className={styles.responseFooter}><button className={styles.primaryButton} disabled={pending} onClick={() => waiting[0].decision.group < 3 ? openReport(waiting[0].incident.id) : dispatch({ type: "update", apply: current => startRepair(current, waiting[0].incident.id) })}>{waiting[0].decision.group < 3 ? <ShieldWarningIcon size={17} /> : <WrenchIcon size={17} />}{waiting[0].decision.group < 3 ? "Review" : "Dispatch to"} {waiting[0].incident.assessment.stationId ?? "unconfirmed station"}</button></div>}
      </section></>}
    </main></>}

    {panel === "intake" && <Panel key="intake" title="Report an incident" id="intake-title" onClose={closePanel}>
      <form className={styles.panelBody} onSubmit={submitIncident}><label className={styles.field} htmlFor="incident-report">What happened?<textarea ref={reportInput} id="incident-report" value={report} onChange={(event) => setReport(event.target.value)} placeholder="Describe the machine, location and what was observed." maxLength={2400} minLength={5} rows={5} required disabled={pending} /></label><label className={styles.field}>Station<select value={station} onChange={(event) => setStation(event.target.value as StationId | "")} disabled={pending}><option value="">Infer from report</option>{STATIONS.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select></label><div className={styles.intakeBottom}><span className={styles.muted}>{provider?.configured ? "OpenAI connected" : providerUnavailable ? "Connection unavailable" : provider ? "Offline assessment" : "Connecting…"}</span><button className={styles.primaryButton} type="submit" disabled={pending || report.trim().length < 5}>{pending ? "Assessing…" : "Assess and rank"}</button></div>{pending && <p className={styles.formNote} role="status">Interpreting the report and calculating its priority…</p>}{intakeError && <p className={styles.error} role="alert">{intakeError}</p>}</form>
    </Panel>}

    {panel === "controls" && <Panel key="controls" title="Demo controls" id="controls-title" onClose={closePanel}>
      <div className={styles.panelBody}>
        {!desktop && <div className={styles.mobilePlayback}>
          <button className={styles.primaryButton} disabled={complete || pending} aria-label={running ? "Pause simulation" : simulation.minute === 0 ? "Start simulation" : "Resume simulation"} onClick={() => { setPlaying((value) => !value); setPanel(null); }}>{running ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}{running ? "Pause" : complete ? "Complete" : simulation.minute === 0 ? "Start" : "Resume"}</button>
          <button className={styles.button} disabled={(!nextEvent && !repairing.length) || pending} onClick={() => { if (nextEvent) nextIncident(); else advance(Math.max(...repairing.map(item => item.incident.repairCompletesAtMinute ?? simulation.minute)) - simulation.minute); setPanel(null); }}>{nextEvent ? "Next event" : "Finish repairs"}<SkipForwardIcon size={17} /></button>
        </div>}
        <label className={styles.controlRow}>Playback speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[1, 10, 30, 60].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
        <div className={styles.controlRow}><span>Simulation time <strong>{timecode(simulation.minute)}</strong></span><button className={styles.button} onClick={() => advance(1)} disabled={pending}>+1 min</button></div>
        {desktop && <label className={styles.controlRow}>Show station input buffers<input type="checkbox" checked={buffersOpen} onChange={(event) => setBuffersOpen(event.target.checked)} /></label>}
        {<label className={styles.controlRow}>Auto-dispatch<input type="checkbox" checked={simulation.autoDispatch} disabled={pending || awaitingDemoReview} title={awaitingDemoReview ? "Available after the initial priority review" : undefined} onChange={(event) => { const enabled = event.target.checked; dispatch({ type: "update", apply: (current) => setAutoDispatch(current, enabled) }); }} /></label>}
        <div className={styles.controlRow}><span>General maintenance</span><span>Always available</span></div><p className={styles.muted}>Auto-dispatch starts production repairs. Safety concerns and uncontained consequences stay open for supervisor review.</p>
        <div className={styles.controlRow}><span>Current demo</span><strong>{simulation.scenario === "demo" ? "3 focused incidents" : "10-incident shift"}</strong></div><div className={styles.controlBottom}><button className={styles.button} onClick={() => { setPlaying(false); setPanel("method"); }}>Decision process</button>{complete && <button className={styles.button} onClick={() => setPanel("results")}>View results</button>}<button className={styles.button} onClick={() => reset(simulation.scenario === "demo" ? "shift" : "demo")}>Start {simulation.scenario === "demo" ? "full shift" : "focused demo"}</button><button className={styles.button} onClick={() => reset()}><ArrowCounterClockwiseIcon size={16} />Reset simulation</button></div>
      </div>
    </Panel>}

    {panel === "method" && <Panel key="method" title="How priority is decided" id="method-title" onClose={closePanel}><DecisionMethod waiting={waiting} /></Panel>}
    {panel === "results" && results && <Panel key="results" title="Response impact" id="results-title" onClose={closePanel}><ResponseResults results={results} /></Panel>}

    {!desktop && panel === "report" && selected && <Panel key={`report-${selected.id}`} title="Incident report" id="report-title" onClose={closePanel} drawer>{reportContents}</Panel>}

  </div>;
}
