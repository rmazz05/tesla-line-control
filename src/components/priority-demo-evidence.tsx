import { compareResponseTiming } from "@/lib/priority/response-impact";
import { getRankingBasis } from "@/lib/priority/ranking-reason";
import type { RankedIncident } from "@/lib/priority/types";
import styles from "./priority-dashboard.module.css";

export function DecisionMethod({ waiting, supervisor = false }: { waiting: RankedIncident[]; supervisor?: boolean }) {
  if (supervisor) return <div className={styles.panelBody}>
    <p className={styles.methodLead}>Recommend the next supervisor action, then track who has accepted the work.</p>
    <ol className={styles.methodSteps}>
      <li><strong>Protect the area</strong><span>Personnel concerns and spreading quality problems hold the whole modeled area. Recorded containment and area restart are separate decisions.</span></li>
      <li><strong>Resolve missing observations</strong><span>Ask for the observation that is missing or arrange an investigation. A named acknowledgment establishes ownership; a request alone does not.</span></li>
      <li><strong>Protect response windows</strong><span>Production contact windows reserve the upper catalog repair estimate, two minutes for acknowledgment and one minute of supervisor attention. Timing is unavailable while the area is held.</span></li>
      <li><strong>Monitor accepted work</strong><span>Bring back missed checkpoints and returned work. Simulated repair completion never releases equipment without supervisor verification.</span></li>
      <li><strong>Protect current attention</strong><span>A selected action gets a one-minute focus allowance. Protection work and deadlines that close before it finishes can interrupt. These durations are demo assumptions.</span></li>
    </ol>
    <p>All eight stations represent one supervisor area. This version does not yet model staffing qualifications or finite maintenance resources. AI interprets reports; it cannot acknowledge a request, confirm containment or authorize restart.</p>
  </div>;
  return <div className={styles.panelBody}>
    <p className={styles.methodLead}>The AI interprets the report. An explicit decision policy sets the order.</p>
    {waiting.length > 0 && <section className={styles.methodOrder}><h3>Applied to this queue</h3>{waiting.map(item => <div key={item.incident.id}><strong>{item.rank}. {item.incident.assessment.stationId ?? "Location unknown"}</strong><p>{getRankingBasis(item, waiting)}</p></div>)}</section>}
    <details className={styles.reportDetails} open={!waiting.length}><summary>Decision rules, in order</summary>
    <ol className={styles.methodSteps}>
      <li><strong>Protect people</strong><span>Current exposure or relevant injury history requires review before production-only work.</span></li>
      <li><strong>Contain wider consequences</strong><span>Check whether defects or failures can reach other operations, and whether protection is confirmed.</span></li>
      <li><strong>Verify missing evidence</strong><span>An unknown consequence cannot be treated as a low-risk incident.</span></li>
      <li><strong>Protect the repair window</strong><span>For production issues, compare time until impact minus repair time. Then use current effect and confirmed alternatives.</span></li>
    </ol>
    <div className={styles.methodFormula}>Time until impact − repair time = time left to start</div>
    </details>
    <details className={styles.reportDetails}><summary>What makes the decision traceable?</summary><p>Report → equipment and symptom match → comparable cases and current controls → ordered rules → repair-window forecast. Each incident report records its evidence, unknowns and priority changes.</p><p>Case records and production parameters are synthetic. AI cannot invent case history, confirm isolation, or override the decision policy. Equal evidence uses report time and stable identifiers.</p></details>
  </div>;
}

const number = (value: number) => Number(value.toFixed(1)).toLocaleString();
export function ResponseResults({ results }: { results: NonNullable<ReturnType<typeof compareResponseTiming>>[] }) {
  const result = results[0];
  return <div className={styles.panelBody}>
    <p className={styles.methodLead}>Your actions, replayed with longer delays.</p>
    <p>Replay your recorded responses, then move every action 10, 20 or 30 minutes later. Incidents, starting stock and repairs stay identical.</p>
    <div className={styles.resultHeadline}><strong>{number(result.actual.stopped)} min</strong><span>finished production stopped with your responses</span></div>
    <table className={styles.resultTable}><caption>Simulated output over {result.horizon} minutes, including recovery</caption><thead><tr><th scope="col">Response timing</th><th scope="col">Finished units</th><th scope="col">Stopped</th></tr></thead><tbody>
      <tr><th scope="row">Your responses</th><td>{number(result.actual.produced)}</td><td>{number(result.actual.stopped)} min</td></tr>
      {results.map(row => <tr key={row.delayMinutes}><th scope="row">{row.delayMinutes} min later</th><td>{number(row.delayed.produced)}</td><td>{number(row.delayed.stopped)} min</td></tr>)}
    </tbody></table>
    <p>Stock can absorb a short delay. Once that protection runs out, waiting reaches finished production.</p>
    {result.containments.length > 0 ? <section className={styles.methodOrder}><h3>Safety review has a separate clock</h3>{result.containments.map((entry, i) => <p key={i}><strong>{entry.station}</strong>: containment confirmed {number(entry.actual)} min after the report. Delaying responses adds the same 10, 20 or 30 min to that unconfirmed interval.</p>)}<p>Normal output does not establish safety. This measures time to confirmation, not injuries prevented.</p></section> : <p>No supervisor containment confirmation was recorded. Repair completion is not counted as a containment confirmation.</p>}
    <details className={styles.reportDetails}><summary>Comparison assumptions</summary><p>Every run uses the same physics, incident reports and repair durations, with maintenance always available. Future unreported incidents are excluded. Every run includes all recorded repairs, the longest delay, and a 60-minute recovery window. All runs finish with {result.actual.unresolved} unfinished incidents{results.some(row => row.delayed.unresolved !== result.actual.unresolved) ? "; delayed runs retain unfinished work" : ""}. Output uses a continuous-flow model, so fractional units are possible.</p><p>This measures the effect of response timing. It does not prove an optimal ranking or validated factory savings. Safety holds remain active in every run.</p>{result.manualReleases > 0 && <p>{result.manualReleases} manual completion action(s) are reproduced in every run. Those durations were supervisor-entered rather than completed by the repair timer.</p>}</details>
  </div>;
}
