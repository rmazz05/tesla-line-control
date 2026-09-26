"use client";

import { ArrowRightIcon, CheckCircleIcon, ClockIcon, PauseCircleIcon, ShieldWarningIcon, WrenchIcon } from "@phosphor-icons/react";
import { getIncidentPresentation } from "@/lib/priority/presentation";
import { getStationEffect, getStationStatus } from "@/lib/priority/station-effect";
import { schematicIncidentTitle, schematicStations } from "@/lib/priority/schematic";
import type { RankedIncident, StationReading } from "@/lib/priority/types";
import styles from "./production-schematic.module.css";

export function ProductionSchematic({ readings, ranking, selectedId, minute, onSelectIncident }: {
  readings: StationReading[]; ranking: RankedIncident[]; selectedId: string | null; minute: number; onSelectIncident: (id: string) => void;
}) {
  const stations = schematicStations(readings, ranking, selectedId);
  const unlocated = ranking.filter(item => item.incident.status !== "resolved" && !item.incident.assessment.stationId);
  return <div className={styles.schematic}>
    <div className={styles.map}>
      <ol className={styles.stations} aria-label="Production flow, from body supply to inspection">
        {stations.map(({ id, name, reading, primary, incidents, selected }, index) => {
          const presentation = primary ? getIncidentPresentation(primary, minute) : null;
          const status = reading ? getStationStatus(reading) : null;
          const effect = reading ? getStationEffect(reading) : null;
          const repairing = primary?.supervisorAction ? primary.supervisorAction.rank === null : primary?.incident.status === "repairing";
          const StatusIcon = status?.tone === "waiting" ? ClockIcon : effect?.kind === "stopped" ? PauseCircleIcon : effect?.kind === "slowed" ? ClockIcon : CheckCircleIcon;
          const content = <>
            <span className={styles.nodeHeading}><span className={styles.stationCode}>{id}</span>{primary && <span className={styles.priority}>{repairing ? <><WrenchIcon size={14} /> {primary.supervisorAction?.title ?? "In repair"}</> : <>Priority <b>{primary.rank}</b></>}</span>}</span>
            <strong className={styles.stationName}>{name}</strong>
            <span className={styles.problem}>{primary ? schematicIncidentTitle(primary.incident.assessment) : null}</span>
            <span className={styles.production} data-state={status?.tone ?? "waiting"}><StatusIcon size={15} aria-hidden="true" /><span>{status?.label ?? "No reading"}</span></span>
          </>;
          const cycleIncident = () => {
            const current = incidents.findIndex(item => item.incident.id === selectedId);
            onSelectIncident(incidents[(current + 1) % incidents.length].incident.id);
          };
          return <li key={id} className={styles.station} data-index={index}>
            {primary ? <button className={styles.node} data-urgency={presentation?.urgency} data-selected={selected} onClick={cycleIncident}
              aria-pressed={selected} aria-label={`${id}, ${name}. ${presentation?.title}. ${repairing ? primary.supervisorAction?.title ?? "In repair" : `Priority ${primary.rank}`}. ${status?.label}. ${incidents.length > 1 ? `${incidents.length} incidents; select to cycle through them.` : "Highlight in priorities."}`} title={presentation?.title}>
              {content}{incidents.length > 1 && <span className={styles.more}>{incidents.length} incidents · next <ArrowRightIcon size={12} /></span>}
            </button> : <div className={styles.node}>{content}</div>}
            {index < 7 && <span className={styles.connector} aria-hidden="true"><ArrowRightIcon size={16} /></span>}
          </li>;
        })}
      </ol>
    </div>
    <div className={styles.caption}><span><span className={styles.rankKey}>#</span> Priority numbers match the list</span><span><ArrowRightIcon size={15} /> Production flow</span></div>
    {unlocated.length > 0 && <div className={styles.unlocated}><ShieldWarningIcon size={18} /><span>Location needs confirmation</span>{unlocated.map(item => <button key={item.incident.id} onClick={() => onSelectIncident(item.incident.id)}>Priority {item.rank}<ArrowRightIcon size={14} /></button>)}</div>}
  </div>;
}
