"use client";

import {
  ArrowRightIcon, BellSimpleIcon, CheckCircleIcon, FactoryIcon,
  ListNumbersIcon, PlusIcon, XIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ATTENTION_LABEL, placeAttention, type AttentionBucket } from "@/lib/attention/bucket";
import { STATIONS } from "@/lib/priority/config";
import { getIncidentPresentation, getIncidentTitle } from "@/lib/priority/presentation";
import { getStationEffect, getStationStatus } from "@/lib/priority/station-effect";
import type { LineActivity } from "@/lib/priority/activity";
import type { PriorityIncident, RankedIncident, SimulationState, StationReading } from "@/lib/priority/types";
import styles from "./mobile-priority-dashboard.module.css";

export interface MobilePriorityDashboardProps {
  simulation: SimulationState;
  ranking: RankedIncident[];
  readings: StationReading[];
  activity: LineActivity | null;
  running: boolean;
  pending: boolean;
  notice: string | null;
  onDismissNotice: () => void;
  onOpenReport: (id: string) => void;
  onInspectOnPc: (id: string) => void;
  onOpenIntake: () => void;
  onOpenControls: () => void;
}

type View = "incidents" | "line" | "activity";

type ActivityEntry = {
  id: string;
  minute: number;
  incident: PriorityIncident;
  label: string;
  text: string;
  kind: "reported" | "repairing" | "resolved" | "priority" | "update";
};

const navigation = [
  { id: "incidents", label: "Incidents", Icon: ListNumbersIcon },
  { id: "line", label: "Line", Icon: FactoryIcon },
  { id: "activity", label: "Updates", Icon: BellSimpleIcon },
] as const;

function timecode(minutes: number) {
  const seconds = Math.max(0, Math.round(minutes * 60));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function number(value: number) { return Number(value.toFixed(1)); }

function elapsed(minute: number, reportedAtMinute: number) {
  const delta = Math.max(0, minute - reportedAtMinute);
  if (delta < 1) return "Just now";
  const rounded = Math.max(1, Math.round(delta));
  return `${rounded} min ago`;
}

function getActivityEntries(simulation: SimulationState): ActivityEntry[] {
  const entries: ActivityEntry[] = simulation.incidents.flatMap((incident) => incident.history.flatMap((entry, index): ActivityEntry[] => {
    // Priority history has its own structured records; do not show it twice.
    if (entry.text.startsWith("Rank ")) return [];
    const kind = entry.text.startsWith("Reported via") ? "reported"
      : entry.text.startsWith("Maintenance started") ? "repairing"
        : entry.text.startsWith("Repair and checks completed") || entry.text.startsWith("Supervisor marked") ? "resolved"
          : "update";
    const label = kind === "reported" ? "Incident reported" : kind === "repairing" ? "Repair started" : kind === "resolved" ? "Incident resolved" : "Response updated";
    return [{ id: `${incident.id}-history-${index}`, minute: entry.minute, incident, label, text: entry.text, kind }];
  }));
  for (const [index, change] of simulation.rankChanges.entries()) {
    // Arrival and resolution already appear in the incident timeline above.
    if (change.from === null || change.to === null) continue;
    const incident = simulation.incidents.find((item) => item.id === change.incidentId);
    if (!incident) continue;
    // Repairing incidents retain engine ranks but no longer belong to the waiting order.
    if (incident.repairStartedAtMinute !== null && change.minute >= incident.repairStartedAtMinute) continue;
    entries.push({ id: `${incident.id}-rank-${index}`, minute: change.minute, incident, label: `Priority ${change.from} → ${change.to}`, text: change.reason, kind: "priority" });
  }
  return entries.reverse().sort((a, b) => b.minute - a.minute);
}

export function MobilePriorityDashboard({
  simulation, ranking, readings, activity, running, pending, notice,
  onDismissNotice, onOpenReport, onInspectOnPc, onOpenIntake, onOpenControls,
}: MobilePriorityDashboardProps) {
  const [view, setView] = useState<View>("incidents");
  const [seenActivity, setSeenActivity] = useState<LineActivity | null>(null);
  const hasUnreadActivity = !!activity && activity !== seenActivity && view !== "activity";
  const placed = ranking.map((item) => ({ item, attention: placeAttention(item) }));
  const byBucket = (bucket: AttentionBucket) => placed.filter((entry) => entry.attention.bucket === bucket);
  const needsYou = byBucket("needs_you");
  const waitingAck = byBucket("waiting_ack");
  const handled = byBucket("being_handled");
  const monitor = byBucket("monitor");
  const resolved = simulation.incidents.filter((incident) => incident.status === "resolved")
    .slice().sort((a, b) => (b.resolvedAtMinute ?? 0) - (a.resolvedAtMinute ?? 0));
  const entries = useMemo(() => getActivityEntries(simulation), [simulation]);
  const finalReading = readings.at(-1);
  const lineEffect = finalReading ? getStationEffect(finalReading) : null;
  const output = finalReading?.ratePerHour ?? 0;
  const nominalOutput = STATIONS[STATIONS.length - 1].ratePerMinute * 60;
  const lineState = lineEffect?.kind === "slowed" ? "Slowed" : lineEffect?.label ?? "Unknown";
  const title = view === "incidents" ? "Needs you" : view === "line" ? "Line status" : "Updates";

  function changeView(next: View) {
    if (view === "activity" || next === "activity") setSeenActivity(activity);
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function reviewIncident(id: string) {
    if (activity?.incidentId === id) setSeenActivity(activity);
    onOpenReport(id);
  }

  return <div className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.wordmark}>TESLA</span><span className={styles.lineId}>Line 1</span></div>
      <button type="button" className={styles.lineState} data-state={lineEffect?.kind}
        onClick={() => changeView("line")} aria-label={"Line status: production " + lineState.toLowerCase()}>
        <span className={styles.stateDot} aria-hidden="true" />{lineState}
      </button>
      <button type="button" className={styles.demoButton} onClick={onOpenControls}
        aria-label={"Open demo controls, simulation " + (running ? "playing" : "paused")} aria-haspopup="dialog">
        Demo<span>{running ? "Playing" : "Paused"}</span>
      </button>
    </header>

    <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
      {activity ? activity.title + ". " + activity.detail : ""}
    </div>

    <main className={styles.main} id="mobile-view">
      <div className={styles.heading}>
        <h1 id="queue-title" tabIndex={-1}>{title}
          {view === "incidents" && needsYou.length > 0 && <span>{" " + needsYou.length}</span>}
        </h1>
        {view === "incidents" && <button type="button" className={styles.reportButton}
          onClick={onOpenIntake} disabled={pending} aria-label="Report incident" aria-haspopup="dialog">
          <PlusIcon size={17} aria-hidden="true" />Report
        </button>}
      </div>

      {notice && <div className={styles.notice} role="status"><p>{notice}</p>
        <button type="button" className={styles.iconButton} onClick={onDismissNotice} aria-label="Dismiss notification"><XIcon size={18} aria-hidden="true" /></button>
      </div>}

      {view === "incidents" && <>
        {needsYou.length > 0 ? <ol className={styles.incidentList} aria-label="Incidents that need the supervisor">
          {needsYou.map(({ item, attention }) => {
            const { incident } = item;
            const presentation = getIncidentPresentation(item, simulation.minute);
            return <li key={incident.id}>
              <button type="button" id={"queue-" + incident.id} className={styles.incidentRow}
                data-urgency={presentation.urgency} onClick={() => reviewIncident(incident.id)} aria-haspopup="dialog">
                <span className={styles.incidentMeta}>
                  <span className={styles.station}>{incident.assessment.stationId ?? "Location unconfirmed"}</span>
                  <span className={styles.deadline}>{elapsed(simulation.minute, incident.reportedAtMinute)}</span>
                </span>
                <span className={styles.incidentTitle}>{presentation.title}<ArrowRightIcon size={17} aria-hidden="true" /></span>
                <span className={styles.consequence}>{attention.reason}</span>
              </button>
              <button type="button" className={styles.inspectButton} onClick={() => onInspectOnPc(incident.id)}>
                Inspect on PC
              </button>
            </li>;
          })}
        </ol> : <div className={styles.emptyState}>
          <CheckCircleIcon size={24} aria-hidden="true" />
          <h2>{simulation.incidents.length === 0 ? "All stations operating normally" : "Nothing needs you right now"}</h2>
          {simulation.incidents.length === 0 && <button type="button" className={styles.textButton} onClick={onOpenControls}>Open demo controls<ArrowRightIcon size={16} aria-hidden="true" /></button>}
        </div>}

        {([
          ["waiting_ack", waitingAck],
          ["being_handled", handled],
          ["monitor", monitor],
        ] as const).map(([bucket, group]) => <details key={bucket} className={styles.details}>
          <summary>{ATTENTION_LABEL[bucket]} <span>{group.length}</span></summary>
          {group.map(({ item, attention }) => <button type="button" id={"queue-" + item.incident.id} key={item.incident.id}
            className={styles.repairRow} onClick={() => reviewIncident(item.incident.id)} aria-haspopup="dialog">
            <span className={styles.incidentMeta}><span className={styles.station}>{item.incident.assessment.stationId ?? "Location unconfirmed"}</span>
              <span>{elapsed(simulation.minute, item.incident.reportedAtMinute)}</span></span>
            <span className={styles.repairTitle}>{getIncidentTitle(item.incident.assessment)}<ArrowRightIcon size={16} aria-hidden="true" /></span>
            <span className={styles.consequence}>{attention.reason}</span>
          </button>)}
        </details>)}

        {resolved.length > 0 && <details className={styles.details}>
          <summary>Resolved <span>{resolved.length}</span></summary>
          {resolved.map((incident) => <button type="button" id={"queue-" + incident.id} key={incident.id}
            className={styles.resolvedRow} onClick={() => reviewIncident(incident.id)} aria-haspopup="dialog">
            <span className={styles.station}>{incident.assessment.stationId ?? "Location unconfirmed"}</span>
            <span className={styles.repairTitle}>{getIncidentTitle(incident.assessment)}<ArrowRightIcon size={16} aria-hidden="true" /></span>
          </button>)}
        </details>}
      </>}

      {view === "line" && <>
        <section className={styles.production} aria-label="Production output">
          <span>General assembly</span>
          <p className={styles.output}>{number(output)} <span>/ {number(nominalOutput)} cars per hour</span></p>
          <span className={styles.outputState} data-state={lineEffect?.kind}>{lineEffect?.description ?? "Reading unavailable"}</span>
        </section>
        <ul className={styles.stationList} aria-label="Station conditions">{readings.map((reading) => {
          const status = getStationStatus(reading);
          const incident = ranking.find((item) => reading.activeIncidentIds.includes(item.incident.id))?.incident;
          const content = <>
            <span className={styles.stationIdentity}><span className={styles.stationCode}>{reading.id}</span><strong>{reading.name}</strong></span>
            <span className={styles.stationCondition}><span data-state={status.tone} title={status.description}>{status.label}</span>
              <span className={styles.stationRate}>{number(reading.ratePerHour)} / h{incident && <ArrowRightIcon size={14} aria-hidden="true" />}</span>
            </span>
          </>;
          return <li key={reading.id}>{incident
            ? <button type="button" className={styles.stationRow} onClick={() => reviewIncident(incident.id)} aria-label={reading.name + ": " + status.label + ". Review incident"} aria-haspopup="dialog">{content}</button>
            : <div className={styles.stationRow}>{content}</div>}
          </li>;
        })}</ul>
        <details className={styles.details}>
          <summary>Production totals</summary>
          <dl className={styles.metrics}>
            <div><dt>Produced</dt><dd>{number(simulation.producedUnits)} <span>cars</span></dd></div>
            <div><dt>Lost output</dt><dd>{number(simulation.lostUnits)} <span>cars</span></dd></div>
            <div><dt>Line stopped</dt><dd>{number(simulation.stoppedMinutes)} <span>min</span></dd></div>
          </dl>
        </details>
        <details className={styles.details}>
          <summary>Input buffers</summary>
          {readings.map((reading) => <div className={styles.bufferRow} key={reading.id}>
            <span>{reading.id}</span><progress value={reading.bufferUnits} max={reading.bufferCapacity} aria-label={reading.id + " input buffer"} />
            <span>{number(reading.bufferUnits)} / {reading.bufferCapacity} units</span>
          </div>)}
        </details>
      </>}

      {view === "activity" && <>{entries.length ? <ol className={styles.activityList}>
        {entries.map((entry) => <li key={entry.id}>
          <button type="button" className={styles.activityRow} onClick={() => reviewIncident(entry.incident.id)} aria-haspopup="dialog">
            <span className={styles.activityMeta}><span>{entry.label} · {entry.incident.assessment.stationId ?? "Unconfirmed station"}</span><time>T+{timecode(entry.minute)}</time></span>
            <span className={styles.repairTitle}>{getIncidentTitle(entry.incident.assessment)}<ArrowRightIcon size={16} aria-hidden="true" /></span>
          </button>
        </li>)}
      </ol> : <div className={styles.emptyState}><BellSimpleIcon size={24} aria-hidden="true" /><h2>No updates yet</h2></div>}
        <p className={styles.timeNote}>Times shown are elapsed simulation time.</p>
      </>}
    </main>

    <nav className={styles.navigation} aria-label="Supervisor views">
      {navigation.map(({ id, label, Icon }) => <button type="button" key={id} aria-current={view === id ? "page" : undefined}
        aria-label={id === "activity" && hasUnreadActivity ? "Updates, unread activity" : label}
        aria-controls="mobile-view" onClick={() => changeView(id)}>
        <span className={styles.navIcon}><Icon size={22} weight={view === id ? "fill" : "regular"} aria-hidden="true" />
          {id === "activity" && hasUnreadActivity && <span className={styles.navDot} />}
        </span><span>{label}</span>
      </button>)}
    </nav>
  </div>;
}
