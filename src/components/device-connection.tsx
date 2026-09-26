"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isLocalAddress, isPrivateAddress, type DeviceConnection } from "@/lib/manager/connection-types";
import styles from "./priority-dashboard.module.css";
import connectionStyles from "./device-connection.module.css";

export function DeviceConnectionPanel({ workspaceKey, desktopConnected }: { workspaceKey: string; desktopConnected: boolean }) {
  const [connection, setConnection] = useState<DeviceConnection>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!workspaceKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function prepare(method: "POST" | "GET") {
      try {
        const { origin, hostname, protocol } = window.location;
        if (!isLocalAddress(hostname)) {
          setConnection(protocol === "https:" && !isPrivateAddress(hostname)
            ? { status: "ready", origin }
            : { status: "error", error: "Open Connect devices in the local app on the PC running the simulation." });
          return;
        }
        const response = await fetch("/api/manager/connection", {
          method, headers: { Authorization: `Bearer ${workspaceKey}`, ...(method === "GET" ? { "X-Connection-Origin": origin } : {}) },
          cache: "no-store", signal: controller.signal,
        });
        const result: DeviceConnection = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok && result.status !== "error") throw new Error("Connection unavailable");
        setConnection(result);
        if (result.status === "starting" || result.status === "ready") {
          timer = setTimeout(() => void prepare("GET"), result.status === "starting" ? 1_000 : 5_000);
        }
      } catch {
        if (!controller.signal.aborted) setConnection({ status: "error", error: "Connection unavailable. Keep this computer online and try again." });
      }
    }
    void prepare("POST");
    return () => { controller.abort(); clearTimeout(timer); };
  }, [workspaceKey, attempt]);

  const link = connection.status === "ready" ? `${connection.origin}/#workspace=${workspaceKey}` : "";
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopyStatus("Workspace link copied."); }
    catch { setCopyStatus("Select and copy the workspace link above."); }
  }

  return <div className={`${styles.panelBody} ${connectionStyles.body}`}>
    <p>Scan the code with your phone to open this workspace from any Wi-Fi network or mobile data. Keep this PC page open for Inspect on PC.</p>
    {connection.status === "starting" && <p role="status" aria-live="polite">Preparing your connection… This can take up to a minute.</p>}
    {(connection.status === "error" || connection.status === "idle") && <>
      <p className={styles.error} role="alert">{connection.status === "error" ? connection.error : "The connection has ended. Prepare a new connection to continue."}</p>
      <button className={styles.button} onClick={() => { setConnection({ status: "starting" }); setCopyStatus(""); setAttempt(value => value + 1); }}>Try again</button>
    </>}
    {link && <>
      <p role="status">Ready to connect.</p>
      <div className={styles.deviceQR}><QRCodeSVG value={link} size={190} marginSize={3} title="Scan to connect to this manager workspace" /></div>
      <label className={`${styles.field} ${connectionStyles.link}`}>Workspace link<input readOnly value={link} onFocus={event => event.target.select()} /></label>
      <button className={styles.button} onClick={() => void copyLink()}>Copy workspace link</button>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </>}
    <p className={styles.muted}>Keep the PC page open for desktop inspections. If you launched the app locally, keep its computer awake and online. Share the workspace link only with people who should have access.</p>
    <p>{desktopConnected ? "PC workspace connected." : "No PC workspace currently connected. Pending inspections appear when it reconnects."}</p>
  </div>;
}
