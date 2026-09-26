"use client";

import { BatteryFullIcon, CellSignalFullIcon, WifiHighIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import styles from "./supervisor-phone.module.css";

export function SupervisorPhone({ children, running, connected, started, minute, className }: {
  children: ReactNode; running: boolean; connected: boolean; started: boolean; minute: number; className?: string;
}) {
  const clockMinute = Math.floor(8 * 60 + minute) % (24 * 60);
  const time = `${String(Math.floor(clockMinute / 60)).padStart(2, "0")}:${String(clockMinute % 60).padStart(2, "0")}`;
  const status = !connected ? "Reconnecting" : running ? "Live" : started ? "Paused" : "Ready";
  return <aside className={`${styles.stage}${className ? ` ${className}` : ""}`} aria-label="Production supervisor phone preview">
    <header className={styles.caption}><span>Supervisor’s phone</span><span className={styles.live} data-live={connected && running}><i />{status}</span></header>
    <div className={styles.deviceSpace}>
      <div className={styles.device} aria-label="iPhone 17 mockup">
        <span className={styles.volume} aria-hidden="true" /><span className={styles.power} aria-hidden="true" />
        <div className={styles.screen}>
          <div className={styles.statusBar} aria-hidden="true"><time>{time}</time><span><CellSignalFullIcon size={14} weight="fill" /><WifiHighIcon size={15} weight="bold" /><BatteryFullIcon size={21} weight="fill" /></span></div>
          <div className={styles.island} aria-hidden="true"><i /></div>
          <div className={styles.content}>{children}</div>
          <div className={styles.homeIndicator} aria-hidden="true"><span /></div>
        </div>
      </div>
    </div>
  </aside>;
}
