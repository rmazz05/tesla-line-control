"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRightIcon, CheckCircleIcon, FactoryIcon, LockKeyIcon, PauseCircleIcon, WarningCircleIcon, WifiHighIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { AUDIENCE_FAULTS } from "@/lib/audience/catalog";
import { demoRequest, randomToken, RequestError, useRoom } from "@/lib/audience/client";
import { displayedFaults, enqueueFault, readPhoneSession, savePhoneSession, type PhoneSession, type StorageLike } from "@/lib/audience/phone-session";
import { STATIONS } from "@/lib/priority/config";
import styles from "./audience.module.css";

function browserStores(): StorageLike[] {
  const stores: StorageLike[] = [];
  // Prefer this tab's copy if a browser temporarily refuses localStorage writes.
  try { stores.push(window.sessionStorage); } catch { /* Keep joining available. */ }
  try { stores.push(window.localStorage); } catch { /* Keep joining available. */ }
  return stores;
}
export function AudienceParticipant({ code }: { code: string }) {
  const [session, setSession] = useState<PhoneSession | null>(null);
  const saved = useRef<PhoneSession | null>(null);
  const [durable, setDurable] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [retrying, setRetrying] = useState(false);
  const token = session?.token;
  const credentials = useMemo(() => token ? { code, token } : null, [code, token]);
  const { snapshot, accept, error, errorStatus, connected, refresh } = useRoom(session?.joined ? credentials : null, 2000);
  const commit = useCallback((update: (previous: PhoneSession | null) => PhoneSession) => {
    const next = update(saved.current);
    saved.current = next;
    setDurable(savePhoneSession(`audience-v1-${code}`, next, browserStores()));
    setSession(next);
  }, [code]);

  useEffect(() => {
    let stopped = false;
    queueMicrotask(() => {
      if (stopped) return;
      const restored = readPhoneSession(`audience-v1-${code}`, browserStores());
      commit(() => restored ?? { token: randomToken(), joined: false, name: "", queue: [] });
      setName(restored?.name ?? "");
    });
    return () => { stopped = true; };
  }, [code, commit]);

  const head = session?.queue[0];
  const hasMachine = Boolean(snapshot?.me);
  useEffect(() => {
    if (!head || !credentials || !hasMachine || !session?.joined) return;
    let stopped = false;
    let sending = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function send() {
      if (stopped || sending) return;
      clearTimeout(timer);
      sending = true;
      try {
        const next = await demoRequest(credentials!, { action: "toggle", ...head }, controller.signal);
        if (!stopped) {
          accept(next);
          commit(previous => ({ ...previous!, queue: previous!.queue.filter(item => item.requestId !== head!.requestId) }));
          setRetrying(false); setNotice("");
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof RequestError && error.status < 500 && error.status !== 429 && error.status !== 408) {
          commit(previous => ({ ...previous!, queue: [] }));
          setRetrying(false); setNotice(error.message); refresh();
        } else {
          setRetrying(true);
          attempts++;
          timer = setTimeout(send, Math.min(8000, 1000 * attempts));
        }
      } finally { sending = false; }
    }
    const wake = () => { if (document.visibilityState !== "hidden") void send(); };
    window.addEventListener("online", wake); window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    void send();
    return () => {
      stopped = true; controller.abort(); clearTimeout(timer);
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake);
    };
  }, [head, credentials, hasMachine, session?.joined, accept, commit, refresh]);

  useEffect(() => {
    // A reset removes this token from the room. The API then returns 401
    // instead of a snapshot, so drop the saved assignment and let them rejoin.
    if (session?.joined && (errorStatus === 401 || (snapshot && !snapshot.me))) {
      commit(previous => ({ ...previous!, joined: false, queue: [] }));
    }
  }, [snapshot, errorStatus, session?.joined, commit]);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!credentials || busy || !name.trim()) return;
    setBusy(true); setNotice("");
    // Save the identity before sending. Retrying a lost join response is idempotent.
    commit(previous => ({ ...previous!, name: name.trim() }));
    try {
      const next = await demoRequest(credentials, { action: "join", name });
      commit(previous => ({ ...previous!, joined: true, name: next.me?.name ?? name.trim() }));
      accept(next);
    } catch (error) { setNotice(error instanceof RequestError ? error.message : "Could not reach the factory. Check your connection and tap Join again. Your machine won’t be duplicated."); }
    finally { setBusy(false); }
  }
  const me = session?.joined ? snapshot?.me : null;
  const stationIndex = STATIONS.findIndex(station => station.id === me?.stationId);
  const station = STATIONS[stationIndex];
  const faults = AUDIENCE_FAULTS.filter(fault => fault.stationId === me?.stationId);
  const queue = session?.queue ?? [];
  const active = displayedFaults(me?.faults ?? [], queue, snapshot?.round ?? 1);
  const validCode = /^[A-F0-9]{6}$/.test(code);
  const expired = errorStatus === 404;
  const canChange = snapshot?.phase === "live" && !expired && errorStatus !== 401;
  const phaseLabel = snapshot?.phase === "live" ? "Round live" : snapshot?.phase === "paused" ? "Round paused" : snapshot?.phase === "ended" ? "Round complete" : "Waiting to start";
  const syncText = queue.length ? (retrying || !connected ? "Waiting to sync" : "Saving…") : connected ? (notice ? "Review your choices" : "Saved") : "Reconnecting…";

  return <main className={styles.phone}>
    <header className={styles.phoneHeader}><span className={styles.brand}>Line Priority</span><span className={styles.roomCode}>ROOM {code}</span></header>
    {!validCode || expired ? <section className={styles.join}>
      <WarningCircleIcon size={36} weight="light" aria-hidden="true" />
      <h1>{expired ? "This room is no longer available." : "This link doesn’t look right."}</h1>
      <p>Scan the QR code currently shown by the presenter to join the factory.</p>
      {expired && <button type="button" className={styles.secondary} onClick={refresh}>Check room again</button>}
    </section> : !me || !snapshot ? <section className={styles.join}>
      <div className={styles.joinEyebrow}><FactoryIcon size={22} aria-hidden="true" /><span>LINE PRIORITY</span></div>
      <h1>Become a machine.</h1>
      {session?.joined && errorStatus !== 401 ? <div className={styles.reconnect} role="status">
        <strong>{error ? "Finding your connection…" : "Getting your machine back…"}</strong>
        <p>Your assignment is saved. Keep this page open.</p>
        {error && <button type="button" className={styles.secondary} onClick={refresh}>Retry connection</button>}
      </div> : <form onSubmit={join}>
        <label htmlFor="participant-name">Your name</label>
        <input id="participant-name" value={name} onChange={event => setName(Array.from(event.target.value).slice(0, 24).join(""))} autoComplete="given-name" autoCapitalize="words" enterKeyHint="go" required placeholder="Your first name" disabled={busy} />
        <button className={styles.primary} type="submit" disabled={!credentials || busy || !name.trim()}>{busy ? "Joining…" : "Join"}{!busy && <ArrowRightIcon size={20} aria-hidden="true" />}</button>
      </form>}
    </section> : <>
      <div className={styles.connection} data-online={connected} role="status">{connected ? <WifiHighIcon size={16} aria-hidden="true" /> : <WifiSlashIcon size={16} aria-hidden="true" />}<span>{connected ? "Connected" : "Reconnecting"}</span><span className={styles.phaseLabel}>{phaseLabel}</span></div>
      <section className={styles.machineIdentity} aria-labelledby="machine-title">
        <span className={styles.machineCode}><strong>YOU’RE THIS MACHINE</strong><span>{me.id}</span></span>
        <h1 id="machine-title">{station?.name}</h1>
        <div className={styles.linePosition} role="img" aria-label={`Your machine is at station ${stationIndex + 1} of ${STATIONS.length}, ${me.stationId}.`}>
          {STATIONS.map((item, index) => <span key={item.id} data-here={item.id === me.stationId} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>)}
        </div>
        <div className={styles.machineState} data-fault={active.length > 0}>{active.length ? <WarningCircleIcon size={22} aria-hidden="true" /> : <CheckCircleIcon size={22} aria-hidden="true" />}<strong>{active.length ? `${active.length} ${active.length === 1 ? "issue" : "issues"} selected` : "No issues"}</strong><span>{queue.length ? "Saving" : ""}</span></div>
      </section>
      {snapshot.phase !== "live" && <div className={styles.hold} role="status">{snapshot.phase === "lobby" ? <LockKeyIcon size={24} aria-hidden="true" /> : <PauseCircleIcon size={24} aria-hidden="true" />}<strong>{snapshot.phase === "lobby" ? "Waiting for round" : snapshot.phase === "paused" ? "Round paused" : "Round complete"}</strong></div>}
      <fieldset className={styles.faults} disabled={!canChange}>
        <legend>Choose issues</legend>
        {faults.map(fault => <label key={fault.id} className={styles.fault} data-selected={active.includes(fault.id)}>
          <span><small>{fault.component}</small><strong id={`${fault.id}-label`}>{fault.label}</strong></span>
          <span className={styles.switchControl}><input type="checkbox" role="switch" aria-labelledby={`${fault.id}-label`} checked={active.includes(fault.id)} onChange={event => {
            if (!me || !snapshot || !canChange) return;
            const change = { requestId: randomToken(), faultId: fault.id, active: event.target.checked, round: snapshot.round, version: me.faultVersion };
            setNotice("");
            commit(previous => ({ ...previous!, queue: enqueueFault(previous!.queue.filter(item => item.round === snapshot.round), change) }));
          }} /><span aria-hidden="true">{!canChange ? "Locked" : active.includes(fault.id) ? "On" : "Off"}</span></span>
        </label>)}
      </fieldset>
      <div className={styles.syncState} data-pending={queue.length > 0 || !connected} role="status">{queue.length || !connected ? <WifiHighIcon size={18} aria-hidden="true" /> : <CheckCircleIcon size={18} aria-hidden="true" />}<span>{syncText}</span>{!connected && <button type="button" className={styles.textButton} onClick={refresh}>Retry</button>}</div>
    </>}
    {notice && <p className={styles.error} role="alert">{notice}</p>}
    {errorStatus === 401 && me && <div className={styles.error} role="alert"><p>Your machine could not be recovered. Rejoin with your saved name.</p><button type="button" className={styles.secondary} onClick={() => { setNotice(""); commit(previous => ({ ...previous!, joined: false, queue: [] })); }}>Rejoin the factory</button></div>}
    {!durable && <footer className={styles.phoneFooter}><span>Keep this tab open to keep your machine.</span></footer>}
  </main>;
}
