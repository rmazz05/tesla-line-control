"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircleIcon, CopyIcon, QrCodeIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Credentials } from "@/lib/audience/client";
import type { AudienceConnection } from "@/lib/audience/connection-types";
import { isLocalAddress, isPrivateAddress } from "@/lib/manager/connection-types";
import { MAX_PARTICIPANTS } from "@/lib/audience/catalog";
import styles from "./audience.module.css";

export function AudienceInvite({ credentials, connected }: { credentials: Credentials; connected: boolean }) {
  const [connection, setConnection] = useState<AudienceConnection>({ status: "starting", message: "Preparing the audience connection…" });
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let active: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function prepare(method: "POST" | "GET") {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(), 10_000);
      let nextMethod: "POST" | "GET" = "GET";
      let delay = 2500;
      let poll = true;
      try {
        const { origin, protocol, hostname } = window.location;
        // An already-public presenter page can use the address it was reached at.
        if (protocol === "https:" && !isLocalAddress(hostname) && !isPrivateAddress(hostname)) {
          setConnection({ status: "ready", origin, checkedAt: Date.now() });
          poll = false; return;
        }
        const response = await fetch(`/api/demo/connection?code=${credentials.code}`, {
          method, headers: { Authorization: `Bearer ${credentials.token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
          ...(method === "POST" ? { body: "{}" } : {}), cache: "no-store", signal: active.signal,
        });
        const result = await response.json() as AudienceConnection;
        if (stopped) return;
        if (!response.ok) {
          if (result.status !== "error") throw new Error("Connection unavailable");
          setConnection(result);
          if (response.status < 500) poll = false;
          else { nextMethod = method; delay = 5000; }
          return;
        }
        if (!["idle", "starting", "ready", "error"].includes(result.status)) throw new Error("Invalid connection response");
        if (result.status === "idle") {
          setConnection({ status: "starting", message: "Preparing the audience connection…" });
          nextMethod = "POST"; delay = 500;
        } else {
          setConnection(result);
          delay = result.status === "starting" ? 1000 : 3000;
        }
      } catch {
        if (!stopped) setConnection({ status: "error", message: "Connection interrupted. Keep this laptop online. We’re reconnecting automatically." });
        delay = 3000; nextMethod = method;
      } finally {
        clearTimeout(timeout); inFlight = false;
        if (!stopped && poll) timer = setTimeout(() => void prepare(nextMethod), delay);
      }
    }
    const wake = () => { if (document.visibilityState !== "hidden") void prepare("GET"); };
    void prepare("POST");
    window.addEventListener("online", wake); window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true; active?.abort(); clearTimeout(timer);
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake);
    };
  }, [credentials.code, credentials.token, attempt]);

  const ready = connection.status === "ready" && connected;
  const link = ready ? `${connection.origin}/join/${credentials.code}` : "";
  const message = !connected ? "Reconnecting to the demo…" : connection.status === "starting" || connection.status === "error" ? connection.message : "Checking audience access…";
  return <section className={`${styles.invite} ${styles.automaticInvite}`} aria-label="Join this audience demo">
    <div className={styles.audienceQr} data-ready={ready}>
      {link ? <QRCodeSVG value={link} size={224} level="M" marginSize={4} title="Scan to join this audience room" /> : <div className={styles.qrPending}><QrCodeIcon size={56} weight="light" aria-hidden="true" /><span>Getting ready</span></div>}
    </div>
    <div className={styles.inviteCopy}>
      <div className={styles.inviteStatus} data-ready={ready} role="status">{ready ? <CheckCircleIcon size={20} aria-hidden="true" /> : connection.status === "error" ? <WarningCircleIcon size={20} aria-hidden="true" /> : <SpinnerGapIcon size={20} className={styles.connectionSpinner} aria-hidden="true" />}<strong>{ready ? "Ready for the audience" : message}</strong></div>
      <h1>{ready ? "Scan. Join. Become a machine." : "Preparing your QR code."}</h1>
      <p>{ready ? "iPhone or Android. Any Wi-Fi or mobile data. Open your camera, enter your name, and find your machine on the line." : "The app prepares the connection for your audience. The QR will appear when it’s ready."}</p>
      {link && <a className={styles.joinLink} href={link} target="_blank" rel="noreferrer">{link}</a>}
      <div className={styles.inviteFacts}><span>Up to {MAX_PARTICIPANTS} participants</span><span>One shared simulation</span></div>
      <p className={styles.keepOnline}>Keep the presenter page open throughout the demo. For a locally hosted demo, keep its computer awake and online.</p>
      {connection.status === "error" && <button type="button" className={styles.secondary} onClick={() => { setConnection({ status: "starting", message: "Preparing the audience connection…" }); setAttempt(value => value + 1); }}>Retry connection</button>}
      {copyNotice && <p role="status">{copyNotice}</p>}
    </div>
    {link && <button className={styles.secondary} onClick={async () => {
      try { await navigator.clipboard.writeText(link); setCopied(true); setCopyNotice(""); }
      catch { setCopyNotice("Select and copy the audience link shown above."); }
    }}><CopyIcon size={17} aria-hidden="true" />{copied ? "Link copied" : "Copy join link"}</button>}
  </section>;
}
