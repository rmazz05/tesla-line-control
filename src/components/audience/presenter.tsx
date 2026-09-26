"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, ArrowClockwiseIcon, CheckCircleIcon, FactoryIcon, PauseIcon, PlayIcon, QrCodeIcon, UsersIcon, WarningCircleIcon, WrenchIcon } from "@phosphor-icons/react";
import { DEMO_SPEED, MAX_PARTICIPANTS, PRESENCE_MS, AUDIENCE_FAULTS } from "@/lib/audience/catalog";
import { demoRequest, randomToken, useRoom, type Credentials } from "@/lib/audience/client";
import type { HostAction } from "@/lib/audience/types";
import { getIncidentPresentation } from "@/lib/priority/presentation";
import { AudienceMachineMap } from "./machine-map";
import { AudienceInvite } from "./invite";
import { SupervisorPhone } from "../supervisor-phone";
import styles from "./audience.module.css";

const Factory = dynamic(() => import("../factory-twin").then(module => module.PriorityFactoryTwin), { ssr: false, loading: () => <div className={styles.loading}>Loading factory view…</div> });
const HOST_KEY = "audience-host-v1";

export function AudiencePresenter() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState(true);
  const [view, setView] = useState<"factory" | "machines">("factory");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"end" | null>(null);
  const retry = useRef<{ action: HostAction; incidentId?: string; requestId: string } | null>(null);
  const creation = useRef<Credentials | null>(null);
  const { snapshot, accept, error, connected } = useRoom(credentials, 1000);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(HOST_KEY);
        if (saved) {
          const value = JSON.parse(saved);
          if (/^[A-F0-9]{6}$/.test(value.code) && /^[a-f0-9]{64}$/.test(value.token)) setCredentials({ code: value.code, token: value.token });
        }
      } catch { setNotice("Browser storage is unavailable. Allow storage before creating a room."); }
      setLoaded(true);
    });
  }, []);

  async function create() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const credential = creation.current ?? { code: randomToken().slice(0, 6).toUpperCase(), token: randomToken() };
      creation.current = credential;
      // Save the recovery credential before the request; a lost response cannot orphan the room.
      localStorage.setItem(HOST_KEY, JSON.stringify(credential));
      const next = await demoRequest(credential, { action: "create" });
      accept(next); setCredentials(credential); setInvite(true);
      creation.current = null;
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create the room. Try again."); }
    finally { setBusy(false); }
  }
  async function command(action: HostAction, incidentId?: string) {
    if (!credentials || busy) return;
    setBusy(true); setNotice("");
    const previous = retry.current;
    const body = previous?.action === action && previous.incidentId === incidentId ? previous : { action, incidentId, requestId: randomToken() };
    retry.current = body;
    try {
      accept(await demoRequest(credentials, body));
      retry.current = null; setConfirmation(null);
      if (action === "start") setInvite(false);
      if (action === "reset") { setInvite(true); setSelectedId(null); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the action. Retry it safely."); }
    finally { setBusy(false); }
  }
  const selected = snapshot?.ranking.find(item => item.incident.id === selectedId);
  const waiting = snapshot?.ranking.filter(item => item.incident.status === "open") ?? [];
  const repairing = snapshot?.ranking.filter(item => item.incident.status === "repairing") ?? [];
  const online = snapshot?.participants.filter(person => snapshot.now - person.lastSeen <= PRESENCE_MS).length ?? 0;
  const broken = snapshot?.participants.filter(person => person.faults.length > 0).length ?? 0;
  const phaseText = { lobby: "Lobby open", live: "Audience is live", paused: "Round paused", ended: "Round ended" };

  return <div className={styles.presenter}>
    <header className={styles.topbar}><Link href="/" className={styles.brand}>Line Priority</Link><span className={styles.modeBadge}>Audience demo</span><Link href="/" className={styles.back}><ArrowLeftIcon size={16} />Back to product</Link></header>
    {!snapshot ? <main className={styles.setup}>
      <FactoryIcon size={38} weight="light" />
      <h1>Let the room run the factory.</h1>
      <p>Each spectator becomes a machine. Their choices create real-time incidents for the supervisor to prioritize.</p>
      <ol><li>Share the QR code and fill the line.</li><li>Start the round to unlock fault switches.</li><li>Pause, compare priorities, and dispatch repairs.</li></ol>
      <button className={styles.primary} onClick={create} disabled={busy || !loaded || (!!credentials && !error)}>{busy ? "Creating room…" : credentials && !error ? "Reconnecting…" : "Create audience room"}<ArrowRightIcon size={18} /></button>
      {credentials && !error && <p role="status">Reconnecting to your existing room…</p>}
      <small>Up to {MAX_PARTICIPANTS} people. Separate from the product simulation.</small>
      {(notice || error) && <p className={styles.error} role="alert">{notice || error}</p>}
    </main> : <>
      <div className={styles.sessionBar}>
        <div className={styles.sessionIdentity}><span className={styles.liveDot} data-live={snapshot.phase === "live" && connected} /><strong>{phaseText[snapshot.phase]}</strong><span>Room {snapshot.code} · Round {snapshot.round}</span></div>
        <div className={styles.sessionActions}>
          <span className={styles.peopleCount}><UsersIcon size={18} /><b>{snapshot.participants.length}</b> joined <span> / {online} online</span></span>
          <button className={styles.secondary} onClick={() => command("reset")} disabled={busy}><ArrowClockwiseIcon size={17} />New round</button>
          <button className={styles.secondary} onClick={() => setInvite(value => !value)} aria-expanded={invite}><QrCodeIcon size={18} />{invite ? "Hide QR code" : "Show QR code"}</button>
          {snapshot.phase !== "ended" && <button className={styles.primary} disabled={busy || !connected || (!snapshot.participants.length && snapshot.phase === "lobby")} onClick={() => command(snapshot.phase === "live" ? "pause" : "start")}>
            {snapshot.phase === "live" ? <PauseIcon size={17} weight="fill" /> : <PlayIcon size={17} weight="fill" />}{snapshot.phase === "live" ? "Pause round" : snapshot.phase === "paused" ? "Resume round" : "Begin round"}
          </button>}
        </div>
      </div>
      {(notice || error) && <div className={styles.error} role="alert">{notice || error}{error && " The last confirmed state remains visible."}</div>}
      {invite && credentials && <AudienceInvite credentials={credentials} connected={connected} />}
      {snapshot.participants.length > 0 && <section className={styles.joinedAudience} aria-label="Audience participants">
        <div className={styles.joinedHeading}><UsersIcon size={17} /><strong>{snapshot.participants.length}</strong><span>joined</span></div>
        <ul>{snapshot.participants.map((person, index) => <li key={person.id} style={{ "--join-order": Math.min(index, 20) } as CSSProperties} data-away={snapshot.now - person.lastSeen > PRESENCE_MS}>{person.name}</li>)}</ul>
      </section>}
      <main className={styles.workspace}>
        <section className={styles.factoryPane} aria-label="Audience factory">
          <div className={styles.paneHeading}><div><h2>General assembly</h2><span>{broken} {broken === 1 ? "machine has" : "machines have"} faults</span></div><div className={styles.viewToggle} aria-label="Factory view"><button aria-pressed={view === "factory"} onClick={() => setView("factory")}>Factory</button><button aria-pressed={view === "machines"} onClick={() => setView("machines")}>Machine map</button></div></div>
          {view === "factory" ? <div className={styles.scene}><Factory ranking={snapshot.ranking} readings={snapshot.readings} minute={snapshot.minute} selectedId={selectedId} simulationRun={snapshot.round} playing={snapshot.phase === "live" && connected} onSelectIncident={id => { setSelectedId(id); document.getElementById(`audience-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }} audience={snapshot.participants.map(person => ({ id: person.id, name: person.name, stationId: person.stationId, hasFault: person.faults.length > 0, online: snapshot.now - person.lastSeen <= PRESENCE_MS }))} /></div> : <AudienceMachineMap snapshot={snapshot} />}
          <div className={styles.activity} role="status"><span className={styles.activityTime}>{snapshot.minute.toFixed(1)} min</span><span>{snapshot.message}</span></div>
          <div className={styles.presenterControls}><span>{DEMO_SPEED}× simulated time · Synthetic data</span><div>{snapshot.phase !== "ended" && <button className={styles.textButton} onClick={() => setConfirmation("end")} disabled={busy}>End demo</button>}</div></div>
          {confirmation && <div className={styles.confirmation}><p>End this round and lock all participant switches?</p><button className={styles.secondary} onClick={() => setConfirmation(null)}>Cancel</button><button className={styles.primary} disabled={busy} onClick={() => command(confirmation)}>End round</button></div>}
          <details className={styles.roster}><summary>Participants ({snapshot.participants.length})</summary><ul>{snapshot.participants.map(person => <li key={person.id}><strong>{person.name}</strong><span>{person.id} · {person.stationId}</span><span>{snapshot.now - person.lastSeen > PRESENCE_MS ? "Reconnecting" : person.faults.length ? `${person.faults.length} faults` : "Healthy"}</span></li>)}</ul></details>
        </section>
        <SupervisorPhone className={styles.audiencePhone} running={snapshot.phase === "live"} connected={connected} started={snapshot.round > 1 || snapshot.phase !== "lobby"} minute={snapshot.minute}>
        <section className={`${styles.queue} ${styles.phoneQueue}`} aria-label="Supervisor repair order">
          <div className={styles.queueHeading}><h2>Repair order</h2><span>{waiting.length} waiting</span></div>
          <div className={styles.phoneQueueScroll}>
          {!waiting.length && !repairing.length && <div className={styles.empty}><CheckCircleIcon size={30} weight="light" /><h3>{snapshot.phase === "lobby" ? "The line is ready." : "No faults to repair."}</h3><p>{snapshot.phase === "lobby" ? "Joined machines light up green. Start the round when the room is ready." : "Audience choices appear here in the same priority order used by the product."}</p></div>}
          <ol className={styles.queueList}>{waiting.map(item => {
            const presentation = getIncidentPresentation(item, snapshot.minute);
            const fault = AUDIENCE_FAULTS.find(fault => fault.stationId === item.incident.assessment.stationId && fault.assessment.title === item.incident.assessment.title);
            const reporters = fault ? snapshot.participants.filter(person => person.faults.includes(fault.id)) : [];
            return <li key={item.incident.id} id={`audience-${item.incident.id}`} data-selected={selectedId === item.incident.id}>
              <button className={styles.incidentButton} onClick={() => setSelectedId(selectedId === item.incident.id ? null : item.incident.id)} aria-expanded={selectedId === item.incident.id}>
                <span className={styles.rank} data-urgency={presentation.urgency}>{item.rank}</span><span className={styles.incidentCopy}><span>{item.incident.assessment.stationId} · {reporters.length} {reporters.length === 1 ? "machine" : "machines"}</span><strong>{presentation.title}</strong><b data-urgency={presentation.urgency}>{presentation.timingLabel}</b>{presentation.calculation && <small>{presentation.calculation}</small>}</span>
              </button>
              {selectedId === item.incident.id && <div className={styles.incidentDetail}><p>{item.priorityReason}</p><p>{presentation.consequence}</p><p className={styles.reporters}>Reported by {reporters.map(person => person.name).join(", ") || "the audience"}</p>{(item.decision.evidence.safetyReview || item.decision.evidence.uncontainedSpread) && item.incident.containmentConfirmedAtMinute == null && <button className={styles.secondary} disabled={busy} onClick={() => command("contain", item.incident.id)}><WarningCircleIcon size={17} />Confirm containment</button>}<button className={styles.primary} disabled={busy} onClick={() => command("repair", item.incident.id)}><WrenchIcon size={17} />Dispatch maintenance</button></div>}
            </li>;
          })}</ol>
          {repairing.length > 0 && <section className={styles.repairs}><h3>In repair · {repairing.length}</h3>{repairing.map(item => <div key={item.incident.id}><WrenchIcon size={18} /><span><strong>{item.incident.assessment.stationId}</strong><span>{getIncidentPresentation(item, snapshot.minute).title}</span><small>{getIncidentPresentation(item, snapshot.minute).timingLabel}</small></span><button className={styles.textButton} onClick={() => command("finish", item.incident.id)} disabled={busy}>Complete repair</button></div>)}</section>}
          </div>
          {waiting.length > 0 && <div className={styles.dispatch}><button className={styles.primary} disabled={busy || !connected} onClick={() => command("repair", waiting[0].incident.id)}><WrenchIcon size={18} />Repair #{waiting[0].rank} · {waiting[0].incident.assessment.stationId}</button><span>Maintenance is always available.</span></div>}
          {selected && <span className={styles.srOnly} role="status">Selected {selected.incident.assessment.title}</span>}
        </section>
        </SupervisorPhone>
      </main>
    </>}
  </div>;
}
