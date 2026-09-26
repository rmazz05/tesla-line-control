"use client";

import { ArrowRightIcon, CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { STATIONS } from "@/lib/priority/config";
import { AUDIENCE_FAULTS, PRESENCE_MS } from "@/lib/audience/catalog";
import type { RoomSnapshot } from "@/lib/audience/types";
import styles from "./audience.module.css";

export function AudienceMachineMap({ snapshot }: { snapshot: RoomSnapshot }) {
  return <div className={styles.machineMap}>
    <div className={styles.mapLabel}><span>General assembly · Audience machines</span><span>Production flow <ArrowRightIcon size={16} /></span></div>
    <ol className={styles.stationGrid}>{STATIONS.map(station => {
      const people = snapshot.participants.filter(person => person.stationId === station.id);
      const faultIds = [...new Set(people.flatMap(person => person.faults))];
      return <li className={styles.station} key={station.id} data-fault={faultIds.length > 0}>
        <span className={styles.stationId}>{station.id}<span>{people.length} joined</span></span>
        <h3>{station.name}</h3>
        <div className={styles.machineDots}>{people.length ? people.map(person => <span key={person.id} className={styles.machineDot} data-fault={person.faults.length > 0} data-away={snapshot.now - person.lastSeen > PRESENCE_MS} title={`${person.name} · ${person.id} · ${person.faults.length ? person.faults.map(id => AUDIENCE_FAULTS.find(fault => fault.id === id)?.label).join(", ") : "Healthy"}${snapshot.now - person.lastSeen > PRESENCE_MS ? " · Reconnecting" : ""}`}>
          {person.faults.length ? <WarningIcon size={12} weight="fill" /> : <CheckIcon size={12} weight="bold" />}<span>{person.id.slice(1)}</span>
        </span>) : <span className={styles.unassigned}>Waiting for a machine</span>}</div>
        <ul className={styles.stationFaults}>{faultIds.map(id => <li key={id}>{AUDIENCE_FAULTS.find(fault => fault.id === id)?.label}</li>)}</ul>
      </li>;
    })}</ol>
    <div className={styles.legend}><span><i data-tone="healthy" />Joined & healthy</span><span><i data-tone="fault" />Fault selected</span><span><i data-tone="away" />Reconnecting</span></div>
  </div>;
}
