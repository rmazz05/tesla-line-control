"use client";

import { useState } from "react";
import { ArrowRightIcon, CaretRightIcon, CheckCircleIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { areaIsHeld, canRestartArea, getAttentionPlan, responseTeam, supervisorHandover, type AttentionAction } from "@/lib/priority/attention";
import type { SupervisorCommand } from "@/lib/manager/types";
import { STATIONS } from "@/lib/priority/config";
import { getIncidentTitle } from "@/lib/priority/presentation";
import type { RankedIncident, SimulationState } from "@/lib/priority/types";
import styles from "./supervisor-workflow.module.css";
import { usePriorityMotion } from "./use-priority-motion";

type Change = (command: SupervisorCommand) => void;
const stamp = (minute: number) => `T+${Number(minute.toFixed(1))} min`;
function timing(action: AttentionAction) {
  if (action.group < 2) return "Now";
  if (action.dueIn === null) return "Timing unconfirmed";
  return action.dueIn <= 0 ? "Now" : `Within ${Math.floor(action.dueIn)} min`;
}
function downloadHandover(simulation: SimulationState, ranking: RankedIncident[]) {
  const url = URL.createObjectURL(new Blob([supervisorHandover(simulation, ranking)], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "supervisor-handover.md"; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SupervisorQueue({ simulation, ranking, pending, onReview, onFocus, onChange, mobile = false, selectedId, preview = false }: {
  simulation: SimulationState; ranking: RankedIncident[]; pending: boolean;
  mobile?: boolean;
  selectedId?: string;
  preview?: boolean;
  onReview: (id: string) => void; onFocus: (action: AttentionAction) => void; onChange: Change;
}) {
  const plan = getAttentionPlan(simulation, ranking);
  const [restartCheckedFor, setRestartCheckedFor] = useState<string | null>(null);
  const restartVersion = simulation.incidents.map(i => `${i.id}:${i.status}:${i.containmentConfirmedAtMinute}:${i.response?.readyAt}`).join("|");
  const restartChecks = restartCheckedFor === restartVersion;
  const [note, setNote] = useState("");
  const held = areaIsHeld(simulation);
  const restartAllowed = canRestartArea(simulation);
  const resolved = simulation.incidents.filter(i => i.status === "resolved");
  const actions = plan.actions.filter(a => a.kind !== "restart");
  const motionList = usePriorityMotion(preview);
  return <div className={`${styles.queue} ${mobile ? styles.mobileQueue : ""} ${preview ? styles.phoneQueue : ""}`}>
    {held && <section className={styles.hold} aria-label="Area hold">
      <strong>{mobile && <ShieldWarningIcon size={18} aria-hidden="true" />}Whole area held</strong><p>{restartAllowed ? "Immediate concerns are contained. Review the established restart checks; isolated equipment stays held." : mobile ? "Confirm protection before restarting." : "Personnel protection or quality containment must be confirmed before area restart."}</p>
      {restartAllowed && <><label className={styles.check}><input type="checkbox" checked={restartChecks} onChange={e => setRestartCheckedFor(e.target.checked ? restartVersion : null)} />Established area restart checks are complete.</label>
        <button disabled={!restartChecks || pending} onClick={() => { onChange({ type: "restart", confirmed: restartChecks }); setRestartCheckedFor(null); }}>Confirm area restart</button></>}
    </section>}
    {plan.interruption && <p className={styles.interruption} role="alert">{plan.interruption}</p>}
    <section aria-label="Supervisor actions">
      {mobile ? <>
        {actions[0] && <article className={styles.nextAction} data-urgent={actions[0].group < 2}>
          <div className={styles.nextMeta}><span>{plan.holdingFocus ? "In focus" : "Next action"}</span><span>{timing(actions[0])}</span></div>
          <span className={styles.equipment}>{actions[0].station}</span>
          <h2>{getIncidentTitle(simulation.incidents.find(i => i.id === actions[0].incidentId)!.assessment)}</h2>
          <button id={`queue-${actions[0].incidentId}`} className={styles.nextButton} disabled={pending} onClick={() => onFocus(actions[0])}>{actions[0].title}<ArrowRightIcon size={19} aria-hidden="true" /></button>
          <details className={styles.nextReason}><summary>Why this comes first</summary><p>{actions[0].reason}</p></details>
        </article>}
        {actions.length > 1 && <div className={styles.upNext}>
          <h2>Up next <span>{actions.length - 1}</span></h2>
          {actions.slice(1).map((action, index) => <button key={action.id} id={`queue-${action.incidentId}`} className={styles.compactAction} onClick={() => onReview(action.incidentId!)}>
            <span className={styles.order}>{String(index + 2).padStart(2, "0")}</span>
            <span className={styles.actionCopy}><span className={styles.nextMeta}><span>{action.station}</span><span>{timing(action)}</span></span><strong>{getIncidentTitle(simulation.incidents.find(i => i.id === action.incidentId)!.assessment)}</strong><span className={styles.nextStep}>{action.title}</span></span>
            <CaretRightIcon size={17} aria-hidden="true" />
          </button>)}
        </div>}
        {!plan.actions.length && <div className={styles.clearState}><CheckCircleIcon size={32} aria-hidden="true" /><h2>{plan.awaiting.length ? "Responses requested" : plan.monitoring.length ? "Work is underway" : "Nothing needs you right now"}</h2><p>{plan.awaiting.length ? "Keep track of acknowledgments below." : plan.monitoring.length ? "We’ll bring the next checkpoint to your attention." : "New reports and follow-ups will appear here."}</p></div>}
      </> : <>
      {!preview && <h3 className={styles.queueLabel}>{plan.holdingFocus ? "Current action in focus" : "Priority queue"}</h3>}
      <div ref={motionList} className={styles.motionList}>
      {plan.actions.filter(a => a.kind !== "restart").map((action, index) => <article className={styles.action} data-motion-id={action.incidentId} data-first={index === 0} data-selected={selectedId === action.incidentId} data-urgency={action.group < 2 || action.dueIn === 0 ? "critical" : action.group === 2 || action.dueIn === null ? "review" : action.dueIn <= 5 ? "warning" : "buffered"} key={action.incidentId}>
        <div className={styles.meta}><span><b className={styles.rankBadge}>#{index + 1}</b>{action.station}</span><span className={styles.deadline}>{held && action.group === 3 && action.dueIn === null ? "On hold" : timing(action)}</span></div>
        <button id={`queue-${action.incidentId}`} className={styles.actionTitle} onClick={() => onReview(action.incidentId!)}>{getIncidentTitle(simulation.incidents.find(i => i.id === action.incidentId)!.assessment)}</button>
        <p className={styles.actionStep}>{action.title}</p>
        <details><summary>Why this priority?</summary><p>{action.reason}</p></details>
        {index === 0 && <button className={styles.takeAction} disabled={pending} onClick={() => onFocus(action)}>Take action<ArrowRightIcon size={16} aria-hidden="true" /></button>}
      </article>)}
      </div>
      {!plan.actions.length && <div className={styles.empty}><CheckCircleIcon size={28} aria-hidden="true" /><strong>{!simulation.incidents.length ? "No actions yet" : "All actions up to date"}</strong><p>{!simulation.incidents.length ? "Priorities appear when the simulation runs." : plan.awaiting.length ? "Waiting for team acknowledgment." : plan.monitoring.length ? "Team responses are being monitored." : "No outstanding supervisor actions."}</p></div>}
      </>}
    </section>
    {plan.awaiting.length > 0 && <section><h3>Awaiting acknowledgment<span>{plan.awaiting.length}</span></h3>{plan.awaiting.map(i => <button key={i.id} id={plan.actions.some(a => a.incidentId === i.id) ? undefined : `queue-${i.id}`} className={styles.commitment} onClick={() => onReview(i.id)}>
      <strong>{i.assessment.stationId ?? "Unknown location"} · {i.response!.team}</strong><span>No owner confirmed · follow up by {stamp(i.response!.checkpointAt)}</span>
    </button>)}</section>}
    {plan.monitoring.length > 0 && <section><h3>Being handled<span>{plan.monitoring.length}</span></h3>{plan.monitoring.map(i => <button key={i.id} id={`queue-${i.id}`} className={styles.commitment} onClick={() => onReview(i.id)}>
      <strong>{i.assessment.stationId ?? "Unknown location"} · {i.response!.owner}</strong><span>{i.response!.team} accepted · next checkpoint {stamp(i.response!.checkpointAt)}</span>
    </button>)}</section>}
    {resolved.length > 0 && <details><summary>Verified and closed · {resolved.length}</summary>{resolved.map(i => <button className={styles.commitment} key={i.id} onClick={() => onReview(i.id)}>{i.assessment.stationId} · {getIncidentTitle(i.assessment)}</button>)}</details>}
    <details><summary>Shift handover</summary>
      <p>Open commitments, confirmations and corrections are collected as you work.</p>
      <label className={styles.field}>Correction or shift note<textarea maxLength={1200} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className={styles.buttons}><button disabled={pending || note.trim().length < 5} onClick={() => { onChange({ type: "note", note }); setNote(""); }}>Record note</button><button onClick={() => downloadHandover(simulation, ranking)}>Download handover</button></div>
    </details>
  </div>;
}

export function SupervisorResponse({ simulation, item, pending, onChange, mobile = false }: { simulation: SimulationState; item: RankedIncident; pending: boolean; onChange: Change; mobile?: boolean }) {
  const [checks, setChecks] = useState(false);
  const [productChecks, setProductChecks] = useState(false);
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [checkpoint, setCheckpoint] = useState(5);
  const [station, setStation] = useState("");
  const i = item.incident;
  const r = i.response;
  const e = item.decision.evidence;
  const needsProtection = e.safetyReview || e.uncontainedSpread;
  const action = getAttentionPlan(simulation, [item]).actions.find(a => a.incidentId === i.id);
  return <section className={`${styles.response} ${mobile ? styles.mobileResponse : ""}`} aria-label="Supervisor response">
    <h3>{action?.title ?? "Response ownership"}</h3>
    {action && <p>{action.reason}</p>}
    {!i.assessment.stationId && <div>
      <label className={styles.field}>Confirmed equipment location<select value={station} onChange={event => setStation(event.target.value)}><option value="">Choose verified station</option>{STATIONS.map(s => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select></label>
      <label className={styles.field}>Observation confirming the location<textarea maxLength={600} value={note} onChange={event => setNote(event.target.value)} /></label>
      <button disabled={pending || !station || note.trim().length < 5} onClick={() => { onChange({ type: "location", incidentId: i.id, stationId: station, note }); setNote(""); }}>Record verified location</button>
    </div>}
    {needsProtection && <div className={styles.protection}>
      <label className={styles.check}><input type="checkbox" checked={checks} onChange={event => setChecks(event.target.checked)} />I confirm equipment isolation and personnel clearance under the established procedure.</label>
      <button className={mobile ? styles.primary : undefined} disabled={pending || !checks || !i.assessment.stationId} onClick={() => { onChange({ type: "contain", incidentId: i.id }); setChecks(false); }}>Record equipment containment</button>
      {!i.assessment.stationId && <p>Equipment location must be confirmed before containment can be recorded.</p>}
      {e.uncontainedSpread && !e.safetyReview && <><label className={styles.check}><input type="checkbox" checked={productChecks} onChange={event => setProductChecks(event.target.checked)} />Affected product is segregated and an approved check prevents further spread.</label><button disabled={pending || !productChecks || !i.assessment.stationId} onClick={() => { onChange({ type: "product-containment", incidentId: i.id, confirmed: productChecks }); setProductChecks(false); }}>Record product containment</button></>}
    </div>}
    {e.contained && <p>{i.containmentMode === "product-held" ? "Affected product contained; equipment isolation has not been asserted." : "Equipment isolation confirmed. Repair and verification remain required."}</p>}
    {!r ? <button className={mobile && needsProtection ? undefined : styles.primary} disabled={pending} onClick={() => onChange({ type: "request", incidentId: i.id })}>Record call to {responseTeam(i)}</button>
      : <><p className={styles.owner}>{r.acknowledgedAt === null ? `${r.team} contacted. Nobody has acknowledged yet.` : `${r.owner} · ${r.team} · accepted at ${stamp(r.acknowledgedAt)}`}</p>
        {r.acknowledgedAt === null && <><label className={styles.field}>Person who confirmed they are acting<input maxLength={80} value={owner} onChange={event => setOwner(event.target.value)} /></label><button className={styles.primary} disabled={pending || owner.trim().length < 2} onClick={() => onChange({ type: "acknowledge", incidentId: i.id, owner })}>Record acknowledgment</button></>}
        {r.readyAt != null ? <>
          <label className={styles.check}><input type="checkbox" checked={checks} onChange={event => setChecks(event.target.checked)} />Required return-to-production checks are complete and the reported issue is resolved.</label>
          <label className={styles.field}>Verification result<textarea value={note} maxLength={600} onChange={event => setNote(event.target.value)} /></label>
          <button className={styles.primary} disabled={pending || !checks || note.trim().length < 5 || needsProtection} onClick={() => onChange({ type: "verify", incidentId: i.id, confirmed: checks, note })}>Verify and close incident</button>
        </> : <>
          {r.acknowledgedAt !== null && i.status === "open" && !i.assessment.needsReview && i.assessment.kind !== "unknown" && i.assessment.stationId && <button className={styles.primary} disabled={pending || needsProtection} onClick={() => onChange({ type: "start-repair", incidentId: i.id })}>Start acknowledged response</button>}
          <p>Next checkpoint: {stamp(r.checkpointAt)}. {i.status === "repairing" && i.repairCompletesAtMinute !== null ? `Simulated team return expected at ${stamp(i.repairCompletesAtMinute)}; release is not automatic.` : ""}</p>
          <details open={r.checkpointAt <= simulation.minute}><summary>Record an update or follow-up</summary>
            <label className={styles.field}>What the team reported<textarea maxLength={600} value={note} onChange={event => setNote(event.target.value)} /></label>
            <label className={styles.field}>Next update in minutes<input type="number" min={1} max={30} value={checkpoint} onChange={event => setCheckpoint(Number(event.target.value))} /></label>
            <button disabled={pending || note.trim().length < 5 || checkpoint < 1 || checkpoint > 30} onClick={() => { onChange({ type: "update", incidentId: i.id, note, minutes: checkpoint }); setNote(""); }}>Record update</button>
            {r.acknowledgedAt !== null && i.status === "open" && (i.assessment.needsReview || i.assessment.kind === "unknown" || !i.assessment.stationId) && <button disabled={pending || note.trim().length < 5 || needsProtection} onClick={() => { onChange({ type: "investigation", incidentId: i.id, note }); setNote(""); }}>Record investigation returned</button>}
          </details>
        </>}
      </>}
    <p className={styles.caption}>{mobile ? "Records your confirmation. No call or message is sent." : "Records a supervisor-confirmed action in the simulation. No phone call or message is sent by this app."}</p>
  </section>;
}
