"use client";

import { useState } from "react";
import { CASE_SOURCE } from "@/lib/priority/case-library";
import type { RankedIncident } from "@/lib/priority/types";
import styles from "./priority-dashboard.module.css";

export function IncidentDecision({ item, pending, onContain, showCases = true }: { item: RankedIncident; pending: boolean; onContain: () => void; showCases?: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const { evidence } = item.decision;
  const canContain = item.incident.status === "open" && item.incident.assessment.stationId && !evidence.contained && (evidence.safetyReview || evidence.uncontainedSpread);
  return <section className={styles.decisionEvidence} aria-label="Decision evidence">
    {canContain && <div className={styles.containmentAction}>
      <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm equipment isolation and personnel clear in this demo.</label>
      <button className={styles.button} disabled={!confirmed || pending} onClick={onContain}>Record containment</button>
    </div>}
    {evidence.contained && <p className={styles.containmentRecorded}>Containment confirmed by supervisor. Station held until repair and verification finish.</p>}
    {showCases && <IncidentCases item={item} />}
    <details className={styles.reportDetails}>
      <summary>Other decision factors</summary>
      <dl className={styles.decisionFactors}>
        {evidence.factors.filter(factor => factor.name === "Dependency" || factor.name === "Spread" && !evidence.safetyReview && !evidence.uncontainedSpread || factor.name === "Protection" && !evidence.contained && !evidence.safetyReview && !evidence.uncontainedSpread).map(factor => <div key={factor.name}><dt>{factor.name}</dt><dd>{factor.finding}<small>{factor.source}</small></dd></div>)}
      </dl>
      <ul className={styles.decisionUnknowns}>{evidence.unknowns.filter(value => !value.startsWith("Cases are authored") && !value.startsWith("No comparable cases") && !(evidence.safetyReview && value.startsWith("Whether people"))).map(value => <li key={value}>{value}</li>)}</ul>
    </details>
  </section>;
}

export function IncidentCases({ item }: { item: RankedIncident }) {
  const { evidence } = item.decision;
  return <details className={styles.reportDetails}>
      <summary>{evidence.cases.length ? `${evidence.cases.length} comparable cases${evidence.injuryCases ? ` · ${evidence.injuryCases} involved injury` : ""}` : "Case evidence"}</summary>
      <p className={styles.caseSource}>{evidence.cases.length ? `${CASE_SOURCE}. Matches do not establish the same failure mechanism or an injury probability.` : "No equipment and symptom match is recorded. Absence of history does not establish low risk."}</p>
      {evidence.cases.map(record => <article key={record.id} className={styles.caseRecord}>
        <h4>{record.id} · {record.equipment}</h4>
        <p><strong>Observed:</strong> {record.symptom}. {record.conditions}</p>
        <p><strong>Outcome:</strong> {record.outcome}</p>
        <p className={styles.muted}><strong>Check the difference:</strong> {record.limitation}</p>
      </article>)}
    </details>;
}
