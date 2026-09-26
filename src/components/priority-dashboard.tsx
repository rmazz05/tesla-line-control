"use client";

import { AlgorithmWorkbench } from "./algorithm-workbench";
import { SupervisorPhone } from "./supervisor-phone";
import { SimulationControls } from "./simulation-controls";
import { DeviceConnectionPanel } from "./device-connection";
import { useManagerWorkspace } from "@/lib/manager/client";
import type { ManagerCommand, SupervisorCommand } from "@/lib/manager/types";
import { DecisionMethod } from "./priority-demo-evidence";
import { SupervisorQueue, SupervisorResponse } from "./supervisor-workflow";
import { getAttentionPlan, getSupervisorRanking, type AttentionAction } from "@/lib/priority/attention";
import { IncidentCases } from "./incident-decision";
import { ProductionSchematic } from "./production-schematic";
import {
  CircuitryIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  CubeIcon,
  PathIcon,
  WarningCircleIcon,
  DownloadSimpleIcon,
  DesktopIcon,
  CaretRightIcon,
  SlidersHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SkipForwardIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { STATIONS } from "@/lib/priority/config";
import {
  createSimulation,
  getRankedIncidents,
  getStationReadings,
} from "@/lib/priority/engine";
import { estimatedRepairMinutes } from "@/lib/priority/repair";
import { getIncidentTitle, getRecommendedResponse } from "@/lib/priority/presentation";
import type {
  PriorityIncident,
  RankedIncident,
  SimulationState,
  StationId,
} from "@/lib/priority/types";
import styles from "./priority-dashboard.module.css";
import phoneStyles from "./supervisor-mobile.module.css";
import { MobilePriorityDashboard } from "./mobile-priority-dashboard";

const DESKTOP_QUERY = "(min-width: 768px) and (min-height: 600px), (min-width: 1024px)";
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

const EMPTY_SIMULATION = createSimulation("manual", true);

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
    `## Current decision\n${ranked?.supervisorAction ? `${ranked.supervisorAction.title}. ${ranked.supervisorAction.reason}\n${ranked.supervisorAction.timing}` : ranked ? `Rank ${ranked.rank}. ${ranked.whyNow}\nTime to operational impact: ${duration(ranked.criticalInMinutes)}\nRecovery slack: ${slackLabel(ranked.slackMinutes)}` : "Incident resolved."}\n`,
    `## Diagnostic hypothesis\n${a.diagnosis}\n`,
    section("Decision factors", ranked?.decision.evidence.factors.map(factor => `${factor.name}: ${factor.finding} Source: ${factor.source}`) ?? []),
    section("Comparable cases (synthetic demonstration data)", ranked?.decision.evidence.cases.map(record => `${record.id}: ${record.equipment}; ${record.symptom}. Conditions: ${record.conditions} Outcome: ${record.outcome} Limitation: ${record.limitation}`) ?? []),
    section("Missing evidence", ranked?.decision.evidence.unknowns ?? []),
    section("Observed / reported evidence", a.evidence),
    section("Assumptions and uncertainty", a.assumptions),
    section("Potential consequences", a.consequences),
    section("Diagnostic checks", a.checks),
    `## Recommended action\n${getRecommendedResponse(ranked, a.recommendedAction)}\n`,
    `Repair estimate: ${a.needsReview || a.kind === "unknown" ? "Unconfirmed; verification required" : duration(estimatedRepairMinutes(a))}. Response team: ${incident.response?.team ?? "Not yet contacted"}. Confirmed owner: ${incident.response?.owner ?? "None"}. Safety evidence: ${a.safety}. Quality evidence: ${a.quality}.\n`,
    a.followUpQuestion ? `## Clarification needed\n${a.followUpQuestion}\n` : "",
    section("Incident timeline", incident.history.filter((entry) => !entry.text.startsWith("Rank ")).map((entry) => `T+${timecode(entry.minute)} — ${entry.text}`)),
    section("Legacy production ranking history (not supervisor attention order)", simulation.rankChanges.filter((entry) => entry.incidentId === incident.id).map((entry) => `T+${timecode(entry.minute)} — ${entry.from === null ? "New" : `#${entry.from}`} → ${entry.to === null ? "Resolved" : `#${entry.to}`}. ${entry.reason}`)),
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
    <div className={`${styles.panelHeading} ${phoneStyles.panelHeading}`} data-back={drawer}>{drawer && <button className={styles.iconButton} onClick={onClose} aria-label="Back to workspace"><ArrowLeftIcon size={20} /></button>}<h2 id={id}>{title}</h2>{!drawer && <button className={styles.iconButton} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><XIcon size={20} /></button>}</div>
    {children}
  </dialog>;
}

export function PriorityDashboard() {
  const desktop = useSyncExternalStore(subscribeToViewport, desktopSnapshot, serverDesktopSnapshot);
  const workspace = useManagerWorkspace(desktop);
  const simulation = workspace.state?.simulation ?? EMPTY_SIMULATION;
  const simulationRun = workspace.state?.run ?? 0;
  const activity = workspace.activity;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lineView, setLineView] = useState<"algorithm" | "3d" | "schematic">("algorithm");
  const [mobileView, setMobileView] = useState<"supervisor" | "algorithm">("supervisor");
  const speed = workspace.state?.speed ?? 30;
  const [panel, setPanel] = useState<"report" | "intake" | "controls" | "method" | "devices" | "workspace" | null>(null);
  const [buffersOpen, setBuffersOpen] = useState(false);
  const [report, setReport] = useState("");
  const [station, setStation] = useState<StationId | "">("");
  const pending = workspace.busy || !workspace.state || !!workspace.error;
  const [seed, setSeed] = useState(1);
  const [runDuration, setRunDuration] = useState(60);
  const [interval, setInterval] = useState(5);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);
  const [seenHandoff, setSeenHandoff] = useState("");
  const [seenRun, setSeenRun] = useState(0);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState<{ configured: boolean; model: string } | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const reportInput = useRef<HTMLTextAreaElement>(null);
  const ranking = useMemo(() => getSupervisorRanking(simulation, getRankedIncidents(simulation)), [simulation]);
  const readings = useMemo(() => getStationReadings(simulation), [simulation]);
  const simulationDuration = workspace.state?.settings.duration ?? 60;
  const nextEvent = workspace.state?.nextEventAt != null;
  const selected = simulation.incidents.find((incident) => incident.id === selectedId);
  const selectedRank = ranking.find((item) => item.incident.id === selectedId);
  const waiting = ranking.filter((item) => item.incident.status === "open");
  const repairing = ranking.filter((item) => item.incident.status === "repairing" && item.incident.repairCompletesAtMinute !== null);
  const attention = useMemo(() => getAttentionPlan(simulation, ranking), [simulation, ranking]);
  const running = workspace.state?.playing ?? false;
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
  useEffect(() => { if (panel === "intake") reportInput.current?.focus(); }, [panel]);

  // Adjust local navigation only when the shared run or inspection changes.
  if (simulationRun !== seenRun) {
    setSeenRun(simulationRun); setSelectedId(null); setPanel(panel === "controls" ? "controls" : null); setHandoffStatus(null); setNotice(null);
    if (workspace.state) { setSeed(workspace.state.settings.seed); setRunDuration(workspace.state.settings.duration); setInterval(workspace.state.settings.meanInterval); }
  }
  const handoff = workspace.state?.inspection;
  const handoffKey = handoff ? `${simulationRun}:${handoff.sequence}` : "";
  if (desktop && handoff && handoffKey !== seenHandoff && panel !== "intake" && !workspace.busy) {
    setSeenHandoff(handoffKey); setSelectedId(handoff.incidentId); setPanel("report");
  }

  async function command(change: ManagerCommand) {
    try { return await workspace.send(change); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the change."); return null; }
  }
  function advance(minutes: number) { void command({ type: "step", minutes }); }
  function nextIncident() { void command({ type: "next" }); }
  function reset(mode: "random" | "shift" | "demo" | "manual", fresh = false) {
    const nextSeed = fresh ? crypto.getRandomValues(new Uint32Array(1))[0] : seed;
    void command({ type: "reset", mode, settings: { seed: nextSeed, duration: runDuration, meanInterval: interval } });
  }
  async function toggleSimulation() {
    if (simulation.scenario === "manual" && simulation.incidents.length === 0) {
      await command({ type: "reset", mode: "shift", settings: { seed, duration: runDuration, meanInterval: interval }, playing: true });
    } else await command({ type: "play", playing: !running });
  }
  function replaySimulation() {
    void command({ type: "reset", mode: simulation.scenario ?? "shift", settings: workspace.state!.settings, playing: true });
  }
  function openDevices() { setPanel("devices"); }
  async function inspectOnPC() {
    if (!selectedId) return;
    const result = await command({ type: "inspect", incidentId: selectedId });
    if (result) setHandoffStatus(result.desktopConnected ? "Inspection requested on the connected PC workspace." : "Inspection queued. Open this workspace on your PC using Connect devices.");
  }
  function closePanel() {
    if (desktop && panel === "report") window.requestAnimationFrame(() => (document.getElementById(`queue-${selectedId}`) ?? document.getElementById("queue-title"))?.focus({ preventScroll: true }));
    setPanel(null);
  }
  // Queue entries and mobile status/activity links open reports. Scene markers only highlight the queue.
  function openReport(id: string) {
    setSelectedId(id); setHandoffStatus(null);
    setPanel("report");
  }
  function highlightIncident(id: string) {
    if (panel === "report") setPanel(null);
    setSelectedId(id);
    window.requestAnimationFrame(() => document.getElementById(`queue-${id}`)?.scrollIntoView({ block: "nearest", behavior: "instant" }));
  }
  function openIntake() { setPanel("intake"); }
  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (report.trim().length < 5 || pending) return;
    setIntakeError(null);
    try {
      const result = await workspace.send({ type: "report", report: report.trim(), stationId: station || null });
      if (!result) return;
      setReport(""); setStation(""); setPanel(null);
      setNotice(result.notice ?? "Incident added to the shared queue.");
    } catch (error) { setIntakeError(error instanceof Error ? error.message : "The assessment failed. Please try again."); }
  }

  const supervisorChange = (change: SupervisorCommand) => { void command(change); };
  function workOn(action: AttentionAction) {
    supervisorChange({ type: "focus", actionId: action.id });
    if (action.incidentId) openReport(action.incidentId);
  }
  const selectedAction = attention.actions.find(action => action.incidentId === selectedId);

  const reportContents = selected ? <>
      <div className={`${styles.reportBody} ${phoneStyles.report}`}>
        {notice && <p className={styles.error} role="status">{notice}</p>}
        <div className={styles.reportMeta}><span>{selected.assessment.stationId ?? "Location unconfirmed"} · {selected.status === "resolved" ? "Resolved" : desktop ? selectedRank?.supervisorAction?.title ?? "Review required" : `Reported T+${timecode(selected.reportedAtMinute)}`}</span>{desktop && <button className={styles.iconButton} onClick={() => exportReport(selected, selectedRank, simulation)} aria-label="Download incident report as Markdown" title="Download report"><DownloadSimpleIcon size={18} /></button>}</div>
        <h3 className={styles.reportTitle}>{getIncidentTitle(selected.assessment)}</h3>
        {!desktop && <div className={phoneStyles.handoff}>
          <button disabled={pending} onClick={() => void inspectOnPC()}><DesktopIcon size={20} aria-hidden="true" /><span>Inspect on PC<small>Report, 3D view & schematic</small></span><CaretRightIcon size={18} aria-hidden="true" /></button>
          {handoffStatus && <p role="status">{handoffStatus}</p>}
          {handoffStatus && !workspace.state?.desktopConnected && <button className={phoneStyles.connectLink} onClick={openDevices}>Connect a PC</button>}
        </div>}
        {selectedRank && <SupervisorResponse mobile={!desktop} key={selected.id} simulation={simulation} item={selectedRank} pending={pending} onChange={supervisorChange} />}
        {selectedRank && <IncidentCases item={selectedRank} />}
        <details className={styles.reportDetails}><summary>Original report</summary><section className={styles.observedReport}><span>{sourceLabels[selected.assessment.source]}</span><blockquote>{selected.reportText}</blockquote></section></details>
        <details className={styles.reportDetails}><summary>Recommended response & diagnostics</summary><section className={styles.diagnosis}><h4>{selected.containmentConfirmedAtMinute != null || selected.status !== "open" ? "Initial diagnostic hypothesis" : "Diagnostic hypothesis"}</h4><p>{selected.assessment.diagnosis}</p><h4>Recommended response</h4><p>{getRecommendedResponse(selectedRank, selected.assessment.recommendedAction)}</p></section>{selected.assessment.evidence.some(text => !text.includes(selected.reportText)) && <FactList title="Additional evidence" items={selected.assessment.evidence.filter(text => !text.includes(selected.reportText))} empty="" />}<FactList title="Checks" items={selected.assessment.checks} empty="Awaiting verification." /><FactList title="Assumptions" items={selected.assessment.assumptions} empty="No additional assumptions." />{!desktop && <button className={styles.textButton} onClick={() => exportReport(selected, selectedRank, simulation)}><DownloadSimpleIcon size={17} aria-hidden="true" />Download report</button>}</details>
        <details className={styles.reportDetails}><summary>Incident history</summary><ol className={styles.history}>{simulation.rankChanges.filter((change) => !simulation.supervisor && change.incidentId === selected.id && change.from !== null && change.to !== null).slice().reverse().map((change, index) => <li key={`rank-${index}`}><time>T+{timecode(change.minute)}</time><span>{change.from === null ? "New" : `#${change.from}`} → {change.to === null ? "Resolved" : `#${change.to}`}</span></li>)}</ol><ol className={styles.history}>{selected.history.filter((entry) => !entry.text.startsWith("Rank ")).slice().reverse().map((entry, index) => <li key={`event-${index}`}><time>T+{timecode(entry.minute)}</time><span>{entry.text}</span></li>)}</ol></details>
        <p className={styles.source}>{sourceLabels[selected.assessment.source]} · Synthetic line assumptions</p>
      </div>

  </> : null;

  const algorithm = <AlgorithmWorkbench simulation={simulation} ranking={ranking} readings={readings} attention={attention} selectedId={selectedId} running={running} onSelect={highlightIncident} />;
  const playback = <SimulationControls running={running} pending={pending} started={simulation.scenario !== "manual" || simulation.incidents.length > 0 || simulation.minute > 0} minute={simulation.minute}
    duration={simulation.scenario === "random" ? simulationDuration : simulation.scenario === "demo" ? 24 : 40} speed={speed} nextEvent={nextEvent}
    onPlay={() => void toggleSimulation()} onNext={nextIncident} onReplay={replaySimulation} onSpeed={speed => void command({ type: "speed", speed })} onSettings={() => setPanel("controls")} />;

  return <div className={cx(styles.shell, !desktop && styles.mobileShell, !desktop && phoneStyles.theme)}>
    {(workspace.error || !workspace.state) && <div className={styles.connectionBanner} role="status">{workspace.error ?? "Connecting to manager workspace…"}</div>}
    {workspace.state?.notice && <div className={styles.connectionBanner} role="status">{workspace.state.notice}</div>}
    {/* Phone simulation analysis is a secondary workspace tool; keep the supervisor's next action first. */}
    {!desktop ? <>{mobileView === "algorithm" ? <><div className={phoneStyles.analysisHeader}><button onClick={() => setMobileView("supervisor")}><ArrowLeftIcon size={20} aria-hidden="true" />Back to supervisor</button></div>{playback}{algorithm}</> : <MobilePriorityDashboard
      simulation={simulation}
      ranking={ranking}
      readings={readings}
      activity={activity}
      running={running}
      pending={pending}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      onOpenReport={openReport}
      onOpenIntake={openIntake}
      onOpenWorkspace={() => setPanel("workspace")}
      attentionCount={attention.actions.length}
      supervisorContent={<SupervisorQueue preview simulation={simulation} ranking={ranking} pending={pending} onReview={openReport} onFocus={workOn} onChange={supervisorChange} />}
    />}</> : <><header className={styles.topbar}>
      <Link href="/" className={styles.brand} aria-label="Tesla Line Priority home"><span className={styles.wordmark}>TESLA</span><span className={styles.brandDivider} /><span>Factory simulation</span></Link>
      <div className={styles.topbarRight}><button className={styles.textButton} onClick={openDevices}>Connect devices</button><Link className={styles.textButton} href="/demo">Audience demo</Link></div>
    </header>

    {playback}
    <main className={styles.workspace}>
      <section className={styles.factory} aria-label="Production line">
        <div className={styles.factoryHeading}>
          <div className={styles.factoryIdentity}>
            <div><h1>{lineView === "algorithm" ? "Decision engine" : "General assembly"}</h1><span>Line 01</span></div>
            <span className={styles.lineSummary} data-state={lineOutput}>Production {lineOutput === "slowed" ? `running ${Number(((1-finalOutput/nominalOutput)*100).toFixed(1))}% slower` : lineOutput === "stopped" ? "stopped" : "running"}</span>
          </div>
          <div className={styles.viewSwitch} role="group" aria-label="Production line view">
            <button aria-pressed={lineView === "algorithm"} aria-controls="factory-algorithm" onClick={() => setLineView("algorithm")}><CircuitryIcon size={18} />Algorithm</button>
            <button aria-pressed={lineView === "3d"} aria-controls="factory-3d" onClick={() => setLineView("3d")}><CubeIcon size={18} />3D</button>
            <button aria-pressed={lineView === "schematic"} aria-controls="factory-schematic" onClick={() => setLineView("schematic")}><PathIcon size={18} />Line map</button>
          </div>
        </div>
        <div className={styles.workbench}>
          {lineView === "algorithm" && <div id="factory-algorithm" className={styles.algorithmLayer}>{algorithm}</div>}
          <div id="factory-3d" className={styles.viewLayer} data-active={lineView === "3d"} aria-hidden={lineView !== "3d"} inert={lineView !== "3d"}>
            {lineView === "3d" && <PriorityFactoryTwin ranking={ranking} readings={readings} selectedId={selectedId} playing={running} minute={simulation.minute} simulationRun={simulationRun} onSelectIncident={highlightIncident} />}
          </div>
          <div id="factory-schematic" className={styles.viewLayer} data-active={lineView === "schematic"} aria-hidden={lineView !== "schematic"} inert={lineView !== "schematic"}>
            <ProductionSchematic ranking={ranking} readings={readings} selectedId={selectedId} minute={simulation.minute} onSelectIncident={highlightIncident} />
          </div>
        </div>
        {buffersOpen && <div className={styles.bufferStrip} aria-label="Station input buffers">{readings.map((reading) => <div key={reading.id} className={styles.bufferStation} title={`${reading.name}: ${stateLabels[reading.state]}`}><span>{reading.id}</span><progress value={reading.bufferUnits} max={reading.bufferCapacity} aria-label={`${reading.id} input buffer`} /><small>{Number(reading.bufferUnits.toFixed(1))} / {reading.bufferCapacity} units</small></div>)}</div>}
        {lineView !== "algorithm" && activity && <div className={styles.activity} role="status" aria-live="polite" aria-atomic="true">
          <div key={activity.id} className={styles.activityContent} data-kind={activity.kind}><span className={styles.activityIcon}>{activity.kind === "resolved" ? <CheckCircleIcon size={20} /> : activity.kind === "repairing" ? <WrenchIcon size={20} /> : <WarningCircleIcon size={20} />}</span><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><time>{timecode(activity.minute)}</time></div>
        </div>}
        <div className={styles.simulationMetrics}><span><strong>{Math.floor(simulation.producedUnits)}</strong> units produced</span><span><strong>{Math.floor(simulation.lostUnits)}</strong> units lost</span><span>{simulation.scenario === "manual" ? "Ready" : "Simulated shift"}</span></div>
      </section>

      <SupervisorPhone running={running} connected={!!workspace.state && !workspace.error} started={simulation.scenario !== "manual" || simulation.incidents.length > 0} minute={simulation.minute}>
      {panel === "report" && selected ? <section className={cx(styles.queue, styles.reportInspector, styles.phoneQueue)} aria-label="Incident report" onKeyDown={event => { if (event.key === "Escape") closePanel(); }}>
        <div className={styles.inspectorHeading}><button className={styles.textButton} onClick={closePanel} autoFocus><ArrowLeftIcon size={16} />Back to priorities</button><span>Incident report</span></div>
        {selectedAction && <div className={styles.priorityContext}><span>{selectedAction.title} · {selectedAction.station}</span></div>}
        {reportContents}
      </section> : <section className={cx(styles.queue, styles.phoneQueue)} aria-labelledby="queue-title">
        <div className={cx(styles.queueHeading, styles.phoneHeading)}><span className={styles.phoneLine}>General assembly · Line 01</span><div><h2 id="queue-title" tabIndex={-1}>Priorities <span aria-live="polite" aria-atomic="true" aria-label={`${attention.actions.length} supervisor actions`}>{attention.actions.length || ""}</span></h2><button className={styles.addButton} onClick={openIntake} aria-label="Report incident"><PlusIcon size={18} /><span>Report</span></button></div></div>
        {notice && <div className={styles.notice} role="status"><p>{notice}</p><button className={styles.iconButton} onClick={() => setNotice(null)} aria-label="Dismiss notification"><XIcon size={16} /></button></div>}
        <div className={styles.queueScroll}>
          <SupervisorQueue key={simulationRun} preview selectedId={selectedId ?? ranking[0]?.incident.id} simulation={simulation} ranking={ranking} pending={pending} onReview={openReport} onFocus={workOn} onChange={supervisorChange} />
        </div>
      </section>}
      </SupervisorPhone>
    </main></>}

    {panel === "workspace" && <Panel key="workspace" title="Workspace" id="workspace-title" onClose={closePanel}>
      <div className={`${styles.panelBody} ${phoneStyles.workspace}`}>
        <div className={phoneStyles.workspaceIdentity}><span>Line 01</span><h3>General assembly</h3><p>Production supervisor</p></div>
        <button className={phoneStyles.workspaceOption} onClick={openDevices}><DesktopIcon size={22} aria-hidden="true" /><span>Connect devices<small>Continue an inspection on your PC</small></span><CaretRightIcon size={18} aria-hidden="true" /></button>
        <button className={phoneStyles.workspaceOption} onClick={() => setPanel("controls")}><SlidersHorizontalIcon size={22} aria-hidden="true" /><span>Simulation settings<small>{running ? "Simulation running" : "Simulation paused"} · T+{timecode(simulation.minute)}</small></span><CaretRightIcon size={18} aria-hidden="true" /></button>
        <button className={phoneStyles.workspaceOption} onClick={() => { setMobileView("algorithm"); setPanel(null); window.scrollTo({ top: 0, behavior: "instant" }); }}><CircuitryIcon size={22} aria-hidden="true" /><span>Decision engine<small>Inspect the simulation and priority logic</small></span><CaretRightIcon size={18} aria-hidden="true" /></button>
        <p className={phoneStyles.workspaceNote}>{simulation.scenario === "manual" ? "Manual reports only. No live factory feed is connected." : "This workspace uses simulated factory data."} Team actions record your confirmations; the app does not place calls or send messages.</p>
        <Link className={styles.textButton} href="/demo">Audience demo<CaretRightIcon size={16} aria-hidden="true" /></Link>
      </div>
    </Panel>}

    {panel === "intake" && <Panel key="intake" title="Report an incident" id="intake-title" onClose={closePanel}>
      <form className={styles.panelBody} onSubmit={submitIncident}><label className={styles.field} htmlFor="incident-report">What happened?<textarea ref={reportInput} id="incident-report" value={report} onChange={(event) => setReport(event.target.value)} placeholder="Describe the machine, location and what was observed." maxLength={2400} minLength={5} rows={5} required disabled={pending} /></label><label className={styles.field}>{desktop ? "Station" : "Station (optional)"}<select value={station} onChange={(event) => setStation(event.target.value as StationId | "")} disabled={pending}><option value="">Infer from report</option>{STATIONS.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select></label><div className={styles.intakeBottom}><span className={styles.muted}>{provider?.configured ? desktop ? "OpenAI connected" : "Assessment ready" : providerUnavailable ? "Connection unavailable" : provider ? "Offline assessment" : "Connecting…"}</span><button className={styles.primaryButton} type="submit" disabled={pending || report.trim().length < 5}>{pending ? "Assessing…" : desktop ? "Assess and rank" : "Submit report"}</button></div>{pending && <p className={styles.formNote} role="status">Interpreting the report and calculating its priority…</p>}{intakeError && <p className={styles.error} role="alert">{intakeError}</p>}</form>
    </Panel>}

    {panel === "controls" && <Panel key="controls" title="Simulation settings" id="controls-title" onClose={closePanel}>
      <div className={styles.panelBody}>
        {notice && <p className={styles.error} role="status">{notice}</p>}
        <div className={styles.mobilePlayback}>
          <button className={styles.primaryButton} disabled={pending} onClick={() => void toggleSimulation()}>{running ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}{running ? "Pause simulation" : "Run simulation"}</button>
          <button className={styles.button} disabled={!nextEvent || pending} onClick={nextIncident}>Next event<SkipForwardIcon size={17} /></button>
        </div>
        <label className={styles.controlRow}>Playback speed<select value={speed} disabled={pending} onChange={event => void command({ type: "speed", speed: Number(event.target.value) })}>{[1, 10, 30, 60].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
        <div className={styles.controlRow}><span>Simulation time <strong>{timecode(simulation.minute)}</strong></span><button className={styles.button} onClick={() => advance(1)} disabled={pending}>+1 min</button></div>
        {repairing.length > 0 && <button className={styles.button} disabled={pending} onClick={() => advance(Math.max(...repairing.map(item => item.incident.repairCompletesAtMinute!)) - simulation.minute)}>Advance to team returns</button>}
        <h3>Random factory run</h3>
        <label className={styles.controlRow}>Replay seed<input aria-label="Replay seed" type="number" min={0} max={4294967295} value={seed} onChange={e => setSeed(Number(e.target.value))} /></label>
        <label className={styles.controlRow}>Arrival period<select value={runDuration} onChange={e => setRunDuration(Number(e.target.value))}>{[30, 60, 120].map(value => <option key={value} value={value}>{value} min</option>)}</select></label>
        <label className={styles.controlRow}>Incident frequency<select value={interval} onChange={e => setInterval(Number(e.target.value))}><option value={8}>Quiet · average 8 min</option><option value={5}>Normal · average 5 min</option><option value={1.5}>Busy · average 1.5 min</option></select></label>
        <div className={styles.controlBottom}><button className={styles.primaryButton} disabled={pending} onClick={() => reset("random", true)}>New random run</button><button className={styles.button} disabled={pending || !Number.isInteger(seed) || seed < 0 || seed > 4294967295} onClick={() => reset("random")}>Replay seed</button></div>
        <p className={styles.muted}>New runs replace the current shift. The same seed replays the same events.</p>
        <div className={styles.controlRow}><span>Current source</span><strong>{simulation.scenario === "random" ? `Random · seed ${workspace.state?.settings.seed}` : simulation.scenario === "shift" ? "Scripted 10-incident shift" : simulation.scenario === "demo" ? "Scripted 3-incident rehearsal" : "Manual reports only"}</strong></div>
        <p className={styles.muted}>{simulation.incidents.length} reports · {ranking.length} active · {Math.floor(simulation.producedUnits)} units produced · {Math.floor(simulation.lostUnits)} lost · {Number(simulation.stoppedMinutes.toFixed(1))} min stopped{simulation.scenario === "random" ? ` · arrivals end at ${simulationDuration} min` : ""}. Reports stay live while open. Team requests need a named acknowledgment; returned work needs supervisor verification.</p>
        {desktop && <label className={styles.controlRow}>Show station input buffers<input type="checkbox" checked={buffersOpen} onChange={event => setBuffersOpen(event.target.checked)} /></label>}
        <details><summary>Scripted fixtures and workspace reset</summary><div className={styles.controlBottom}><button className={styles.button} disabled={pending} onClick={() => reset("demo")}>3-incident rehearsal</button><button className={styles.button} disabled={pending} onClick={() => reset("shift")}>10-incident shift</button><button className={styles.button} disabled={pending} onClick={() => reset("manual")}><ArrowCounterClockwiseIcon size={16} />Clear to manual workspace</button></div></details>
        <div className={styles.controlBottom}><button className={styles.button} onClick={() => setPanel("method")}>Decision process</button><Link className={styles.button} href="/demo">Audience demo</Link></div>
      </div>
    </Panel>}

    {panel === "devices" && <Panel key="devices" title="Connect devices" id="devices-title" onClose={closePanel}>
      <DeviceConnectionPanel workspaceKey={workspace.key} desktopConnected={workspace.state?.desktopConnected ?? false} />
    </Panel>}

    {panel === "method" && <Panel key="method" title="How priority is decided" id="method-title" onClose={closePanel}><DecisionMethod waiting={waiting} supervisor /></Panel>}

    {!desktop && panel === "report" && selected && <Panel key={`report-${selected.id}`} title="Incident report" id="report-title" onClose={closePanel} drawer>{reportContents}</Panel>}

  </div>;
}
