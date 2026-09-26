"use client";

import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon, SkipForwardIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import styles from "./simulation-controls.module.css";

export function SimulationControls({ running, pending, started, minute, duration, speed, nextEvent, onPlay, onNext, onReplay, onSpeed, onSettings }: {
  running: boolean; pending: boolean; started: boolean; minute: number; duration: number; speed: number; nextEvent: boolean;
  onPlay: () => void; onNext: () => void; onReplay: () => void; onSpeed: (speed: number) => void; onSettings: () => void;
}) {
  const seconds = Math.floor(minute * 60);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <section className={styles.controls} aria-label="Simulation playback">
    <button className={styles.play} disabled={pending} onClick={onPlay}>
      {running ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}
      {running ? "Pause simulation" : started ? "Resume simulation" : "Run simulation"}
    </button>
    <div className={styles.time}><span className={styles.status} data-running={running}><i />{running ? "Running" : started ? "Paused" : "Ready"}</span><strong>{time}<span> / {duration} min</span></strong><progress max={duration} value={Math.min(minute, duration)} aria-label="Simulation elapsed time" /></div>
    <div className={styles.actions}>
      <label className={styles.speed}><span>Speed</span><select aria-label="Simulation speed" value={speed} disabled={pending} onChange={event => onSpeed(Number(event.target.value))}>{[1, 10, 30, 60].map(value => <option value={value} key={value}>{value}×</option>)}</select></label>
      <button disabled={pending || !nextEvent} onClick={onNext}><SkipForwardIcon size={18} /><span>Next event</span></button>
      <button className={styles.icon} disabled={pending || !started} onClick={onReplay} aria-label="Replay simulation from the beginning" title="Replay simulation"><ArrowCounterClockwiseIcon size={18} /></button>
      <button className={styles.icon} onClick={onSettings} aria-label="Simulation settings" title="Simulation settings"><SlidersHorizontalIcon size={19} /></button>
    </div>
  </section>;
}
