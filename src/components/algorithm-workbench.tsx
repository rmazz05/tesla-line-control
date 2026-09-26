"use client";

import { ArrowRightIcon, CheckCircleIcon, CircuitryIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { ACKNOWLEDGMENT_MINUTES, SUPERVISOR_ACTION_MINUTES, areaIsHeld, type AttentionPlan } from "@/lib/priority/attention";
import { getIncidentTitle } from "@/lib/priority/presentation";
import type { RankedIncident, SimulationState, StationReading } from "@/lib/priority/types";
import styles from "./algorithm-workbench.module.css";

const rules = ["Protect people", "Contain quality", "Verify unknowns", "Compare deadlines"];
const stationNames = ["Body load", "Cockpit", "Glass", "Battery", "Torque", "Fluids", "Roller test", "Final gate"];
const states = { running: "Running", slowed: "Slowed", stopped: "Stopped", starved: "No input", blocked: "Blocked" };
const minutes = (value: number) => `${Number(value.toFixed(1))}m`;
const stamp = (value: number) => `${String(Math.floor(value)).padStart(2, "0")}:${String(Math.floor((value % 1) * 60)).padStart(2, "0")}`;

export function AlgorithmWorkbench({ simulation, ranking, readings, attention, selectedId, running, onSelect }: {
  simulation: SimulationState; ranking: RankedIncident[]; readings: StationReading[];
  attention: AttentionPlan; selectedId: string | null; running: boolean; onSelect: (id: string) => void;
}) {
  const selected = ranking.find(row => row.incident.id === selectedId) ?? ranking[0];
  const actionFor = (id: string) => attention.actions.find(action => action.incidentId === id);
  const action = selected ? actionFor(selected.incident.id) : undefined;
  const held = areaIsHeld(simulation);
  const arrivals = [...ranking].sort((a, b) => a.incident.reportedAtMinute - b.incident.reportedAtMinute || a.incident.id.localeCompare(b.incident.id));
  const evidence = selected?.decision.evidence;
  const selectedGroup = action?.group;
  const calculation = selected && action?.kind === "contact" && action.group === 3 && action.dueIn !== null && selected.criticalInMinutes !== null;
  const reason = !selected ? "Select a report to inspect its decision."
    : action?.group === 0 ? evidence?.safetyBasis === "history"
      ? `${evidence.injuryCases} comparable cases involved injury. Exposure is unconfirmed: protection takes priority.`
      : "Reported personnel exposure. Confirm protection before production responses."
    : action?.group === 1 ? "Unverified work can reach later stations. Containment takes priority over production."
    : action?.group === 2 ? selected.incident.assessment.followUpQuestion ?? "Consequences are unconfirmed. Obtain the missing observation before scheduling a repair."
    : action?.kind !== "contact" ? selected.supervisorAction?.reason ?? selected.whyNow
    : held ? "Area held. Production deadlines are suspended until restart."
    : action?.dueIn === null ? "No supported contact deadline. Reassess when conditions change."
    : attention.holdingFocus && attention.next?.incidentId === selected.incident.id ? "Current action stays in focus unless protection or a closing deadline interrupts."
    : "Contact deadline = time to impact − repair − acknowledgment − supervisor attention. Minimum: 0. Earliest deadline first.";

  return <div className={styles.workbench}>
    <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{ranking.length} active reports. {attention.next ? `Next: ${attention.next.title} at ${attention.next.station}.` : "No supervisor actions."}</p>
    <section className={styles.line} aria-label="Live factory schematic">
      <div className={styles.sectionHeading}><h2>Factory state</h2><span>{held ? "Area held" : `${Math.round(readings.at(-1)?.ratePerHour ?? 0)} units / h`}<span className={styles.divider}>·</span>Input buffers</span></div>
      <div className={styles.stations}>
        {readings.map((reading, index) => {
          const incident = ranking.find(row => row.incident.assessment.stationId === reading.id);
          return <button key={reading.id} className={styles.station} data-state={reading.state} data-selected={!!incident && selected?.incident.id === incident.incident.id}
            disabled={!incident} onClick={() => incident && onSelect(incident.incident.id)}
            aria-label={`${reading.id}, ${reading.name}, ${states[reading.state]}, ${Number(reading.bufferUnits.toFixed(1))} units in buffer${incident ? ", inspect decision" : ""}`}>
            <span className={styles.stationId}>{reading.id}{incident && <i aria-label="Active incident" />}</span>
            <strong>{stationNames[index]}</strong><span className={styles.stationState}>{states[reading.state]}</span>
            <progress value={reading.bufferUnits} max={reading.bufferCapacity} aria-label={`${reading.id} input buffer`} />
            <small>{Number(reading.bufferUnits.toFixed(1))} / {reading.bufferCapacity}</small>
          </button>;
        })}
      </div>
    </section>

    <section className={styles.engine} aria-labelledby="engine-heading">
      <div className={styles.sectionHeading}><h2 id="engine-heading"><CircuitryIcon size={19} aria-hidden="true" />Priority algorithm</h2><span className={styles.live} data-running={running}><i />{running ? "Evaluating live" : "Current evaluation"}</span></div>
      <ol className={styles.rules} aria-label="Decision rules, evaluated in order">
        {rules.map((rule, group) => <li key={rule} data-active={selectedGroup === group} data-protection={group < 2}>
          <span className={styles.ruleNumber}>{group + 1}</span><span>{rule}</span><ArrowRightIcon size={14} aria-hidden="true" />
        </li>)}
      </ol>
      {selected && <section className={styles.inspection} data-urgency={selected.supervisorAction?.urgency ?? selected.decision.urgency} aria-label="Selected decision explanation">
        <div className={styles.inspectionHeading}><span>{action && action.group < 2 ? <ShieldWarningIcon size={18} /> : <CheckCircleIcon size={18} />}<strong>{selected.incident.assessment.stationId} · {selected.supervisorAction?.rank != null ? `Why priority #${selected.supervisorAction.rank}` : "Response tracked"}</strong></span><span>{action ? `Rule ${action.group + 1}` : "Assigned"}</span></div>
        {calculation && <div className={styles.equation} aria-label="Contact deadline calculation in minutes">
          <span><strong>{minutes(selected.criticalInMinutes!)}</strong><small>To impact</small></span><b>−</b>
          <span><strong>{minutes(selected.incident.assessment.repairMinutes.max)}</strong><small>Repair</small></span><b>−</b>
          <span><strong>{minutes(ACKNOWLEDGMENT_MINUTES)}</strong><small>Acknowledge</small></span><b>−</b>
          <span><strong>{minutes(SUPERVISOR_ACTION_MINUTES)}</strong><small>Attention</small></span><b>→</b>
          <span className={styles.result}><strong>{action.dueIn! <= 0 ? "Now" : minutes(action.dueIn!)}</strong><small>Contact within</small></span>
        </div>}
        <p>{reason}</p>
      </section>}
      <div className={styles.flowHeading} aria-hidden="true"><span>Reports · arrival order</span><span>Applied rule</span><span>Contact within</span><span>Priority</span></div>
      <div className={styles.flow} aria-label="Live incident decisions">
        {arrivals.length ? arrivals.map(row => {
          const next = actionFor(row.incident.id);
          const priority = row.supervisorAction?.rank;
          const urgency = row.supervisorAction?.urgency ?? row.decision.urgency;
          const windowLabel = !next ? "Monitoring" : next.group < 2 ? "Immediate" : next.group === 2 ? "Verify first" : next.kind !== "contact" ? "Follow up now" : next.dueIn === null ? held ? "On hold" : "Unconfirmed" : next.dueIn <= 0 ? "Now" : minutes(next.dueIn);
          return <button key={row.incident.id} className={styles.flowRow} data-selected={selected?.incident.id === row.incident.id} data-urgency={urgency}
            aria-pressed={selected?.incident.id === row.incident.id} onClick={() => onSelect(row.incident.id)}>
            <span className={styles.report}><small>{row.incident.assessment.stationId ?? "Unlocated"}<time>T+{stamp(row.incident.reportedAtMinute)}</time></small><strong>{getIncidentTitle(row.incident.assessment)}</strong></span>
            <span className={styles.appliedRule}><span className={styles.routeLine} aria-hidden="true" /><span>{next ? rules[next.group] : "Track response"}</span></span>
            <span className={styles.window}>{windowLabel}</span>
            <span className={styles.priority}>{priority != null ? `#${priority}` : "—"}</span>
          </button>;
        }) : <div className={styles.empty}><CircuitryIcon size={30} aria-hidden="true" /><strong>{simulation.incidents.length ? "All reports resolved" : running ? "Waiting for the first report" : "Ready to simulate"}</strong><span>{simulation.incidents.length ? "New reports will be evaluated here." : "Factory events become ranked supervisor actions."}</span></div>}
      </div>

    </section>
    <footer className={styles.footer}><span>Simulation data</span><span>Re-evaluated as factory conditions change</span></footer>
  </div>;
}
