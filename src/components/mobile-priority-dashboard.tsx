"use client";

import {
  ArrowRightIcon, BellSimpleIcon, DotsThreeIcon, FactoryIcon,
  ListNumbersIcon, PlusIcon, XIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { STATIONS } from "@/lib/priority/config";
import { getIncidentTitle } from "@/lib/priority/presentation";
import { getStationEffect, getStationStatus } from "@/lib/priority/station-effect";
import type { LineActivity } from "@/lib/priority/activity";
import type { PriorityIncident, RankedIncident, SimulationState, StationReading } from "@/lib/priority/types";
import styles from "./mobile-priority-dashboard.module.css";

export interface MobilePriorityDashboardProps {
  supervisorContent: ReactNode;
  attentionCount: number;
  simulation: SimulationState;
  ranking: RankedIncident[];
  readings: StationReading[];
  activity: LineActivity | null;
  running: boolean;
  pending: boolean;
  notice: string | null;
  onDismissNotice: () => void;
  onOpenReport: (id: string) => void;
  onOpenIntake: () => void;
  onOpenWorkspace: () => void;
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
  { id: "incidents", label: "Priorities", Icon: ListNumbersIcon },
  { id: "line", label: "Line", Icon: FactoryIcon },
  { id: "activity", label: "Activity", Icon: BellSimpleIcon },
] as const;

function timecode(minutes: number) {
  const seconds = Math.max(0, Math.round(minutes * 60));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function number(value: number) { return Number(value.toFixed(1)); }

function getActivityEntries(simulation: SimulationState): ActivityEntry[] {
  const entries: ActivityEntry[] = simulation.incidents.flatMap((incident) => incident.history.flatMap((entry, index): ActivityEntry[] => {
    // Priority history has its own structured records; do not show it twice.
    if (entry.text.startsWith("Rank ")) return [];
    const kind = entry.text.startsWith("Reported via") ? "reported"
      : entry.text.startsWith("Maintenance started") ? "repairing"
        : entry.text.startsWith("Repair and checks completed") || entry.text.startsWith("Supervisor marked") ? "resolved"
          : "update";
    const label = kind === "reported" ? "Incident reported" : kind === "repairing" ? "Repair started" : kind === "resolved" ? "Incident resolved"
      : entry.text.includes("confirmed they are acting.") ? "Ownership confirmed"
        : entry.text.includes("contacted by phone/radio.") ? "Team contacted"
          : entry.text.startsWith("Supervisor confirmed equipment isolation") ? "Equipment containment confirmed"
            : entry.text.startsWith("Supervisor confirmed affected product") ? "Product containment confirmed"
              : entry.text.startsWith("Team returned") || entry.text.startsWith("Responsible team returned") ? "Ready for verification"
                : entry.text.startsWith("Follow-up recorded:") ? "Follow-up recorded"
                  : entry.text.startsWith("Demo hold rule:") ? "Equipment hold applied"
                    : entry.text.startsWith("Equipment location confirmed:") ? "Location confirmed" : "Response updated";
    return [{ id: `${incident.id}-history-${index}`, minute: entry.minute, incident, label, text: entry.text, kind }];
  }));
  for (const [index, change] of simulation.rankChanges.entries()) {
    // Arrival and resolution already appear in the incident timeline above.
    if (simulation.supervisor || change.from === null || change.to === null) continue;
    const incident = simulation.incidents.find((item) => item.id === change.incidentId);
    if (!incident) continue;
    // Repairing incidents retain engine ranks but no longer belong to the waiting order.
    if (incident.repairStartedAtMinute !== null && change.minute >= incident.repairStartedAtMinute) continue;
    entries.push({ id: `${incident.id}-rank-${index}`, minute: change.minute, incident, label: `Priority ${change.from} → ${change.to}`, text: change.reason, kind: "priority" });
  }
  return entries.reverse().sort((a, b) => b.minute - a.minute);
}

export function MobilePriorityDashboard({
  simulation, ranking, readings, activity, running, pending, notice, supervisorContent, attentionCount,
  onDismissNotice, onOpenReport, onOpenIntake, onOpenWorkspace,
}: MobilePriorityDashboardProps) {
  const [view, setView] = useState<View>("incidents");
  const [seenActivity, setSeenActivity] = useState<LineActivity | null>(null);
  const hasUnreadActivity = !!activity && activity !== seenActivity && view !== "activity";
  const scrollPositions = useRef<Record<View, number>>({ incidents: 0, line: 0, activity: 0 });
  const entries = useMemo(() => getActivityEntries(simulation), [simulation]);
  const finalReading = readings.at(-1);
  const lineEffect = finalReading ? getStationEffect(finalReading) : null;
  const output = finalReading?.ratePerHour ?? 0;
  const nominalOutput = STATIONS[STATIONS.length - 1].ratePerMinute * 60;
  const lineState = lineEffect?.kind === "slowed" ? "Slowed" : lineEffect?.label ?? "Unknown";
  const title = view === "incidents" ? "Priorities" : view === "line" ? "Production" : "Activity";

  function changeView(next: View) {
    if (view === "activity" || next === "activity") setSeenActivity(activity);
    scrollPositions.current[view] = window.scrollY;
    setView(next);
    requestAnimationFrame(() => {
      document.getElementById("queue-title")?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollPositions.current[next], behavior: "instant" });
    });
  }

  function reviewIncident(id: string) {
    if (activity?.incidentId === id) setSeenActivity(activity);
    onOpenReport(id);
  }

  return <div className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.lineId}>Line 01</span><span className={styles.plantName}>General assembly</span></div>
      <button type="button" className={styles.lineState} data-state={simulation.scenario === "manual" ? "unknown" : lineEffect?.kind}
        onClick={() => changeView("line")} aria-label={simulation.scenario === "manual" ? "Line status: no live factory feed" : "Line status: production " + lineState.toLowerCase()}>
        <span className={styles.stateDot} aria-hidden="true" />{simulation.scenario === "manual" ? "No live feed" : lineState}
      </button>
      <button type="button" className={styles.iconButton} onClick={onOpenWorkspace}
        aria-label="Workspace options" aria-haspopup="dialog"><DotsThreeIcon size={24} aria-hidden="true" /></button>
    </header>

    <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
      {activity ? activity.title + ". " + activity.detail : ""}
    </div>

    <main className={styles.main} id="mobile-view">
      {view === "incidents" ? <div className={styles.phoneHeading}>
        <span className={styles.phoneLine}>General assembly · Line 01</span>
        <div className={styles.phoneHeadingRow}><h1 id="queue-title" tabIndex={-1}>Priorities <span aria-live="polite" aria-atomic="true" aria-label={`${attentionCount} supervisor actions`}>{attentionCount || ""}</span></h1>
        <button type="button" className={styles.phoneReport}
          onClick={onOpenIntake} disabled={pending} aria-label="Report incident" aria-haspopup="dialog">
          <PlusIcon size={19} aria-hidden="true" /><span>Report</span>
        </button></div>
      </div> : <div className={styles.heading}><div><p className={styles.eyebrow}>{simulation.scenario === "manual" ? "Manual workspace" : `Simulation · ${running ? "running" : "paused"}`}</p><h1 id="queue-title" tabIndex={-1}>{title}</h1><p className={styles.subtitle}>{view === "line" ? "The line, station by station" : "The latest across your line"}</p></div></div>}
      {notice && <div className={styles.notice} role="status"><p>{notice}</p>
        <button type="button" className={styles.iconButton} onClick={onDismissNotice} aria-label="Dismiss notification"><XIcon size={18} aria-hidden="true" /></button>
      </div>}
      {view === "incidents" && <div className={styles.phoneQueue}>{supervisorContent}</div>}

      {view === "line" && <>
        <section className={styles.production} aria-label="Production output">
          <span>{simulation.scenario === "manual" ? "Modeled output" : "General assembly"}</span>
          <p className={styles.output}>{number(output)} <span>cars / hour</span></p>
          <p className={styles.outputTarget}>Target {number(nominalOutput)} / hour</p>
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
            <span className={styles.activityMeta}><span>{entry.incident.assessment.stationId ?? "Unconfirmed station"}</span><time>T+{timecode(entry.minute)}</time></span>
            <span className={styles.repairTitle}>{entry.label}<ArrowRightIcon size={16} aria-hidden="true" /></span>
            <span className={styles.activityContext}>{getIncidentTitle(entry.incident.assessment)}</span>
          </button>
        </li>)}
      </ol> : <div className={styles.emptyState}><BellSimpleIcon size={28} aria-hidden="true" /><h2>A quiet start</h2><p>New incidents and team updates will appear here.</p></div>}
        <p className={styles.timeNote}>Times shown are elapsed simulation time.</p>
      </>}
    </main>

    <nav className={styles.navigation} aria-label="Supervisor views">
      {navigation.map(({ id, label, Icon }) => <button type="button" key={id} aria-current={view === id ? "page" : undefined}
        aria-label={id === "activity" && hasUnreadActivity ? "Activity, unread updates" : label}
        aria-controls="mobile-view" onClick={() => changeView(id)}>
        <span className={styles.navIcon}><Icon size={22} weight={view === id ? "fill" : "regular"} aria-hidden="true" />
          {id === "activity" && hasUnreadActivity && <span className={styles.navDot} />}
        </span><span>{label}</span>
      </button>)}
    </nav>
  </div>;
}
