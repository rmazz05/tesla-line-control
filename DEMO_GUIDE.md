# Presentation and manager workflow

Use **Audience demo** (`/demo`) for the presentation. The audience joins by QR and creates the faults; see [AUDIENCE_DEMO.md](./AUDIENCE_DEMO.md).

Use the manager workspace (`/`) and **Demo controls** to test factory operations and phone-to-PC inspection; see [docs/MANAGER_WORKSPACE.md](./docs/MANAGER_WORKSPACE.md). Random simulations do not pause when a report opens.

The historical five-minute script below is available only through **Demo controls → Scripted fixtures and workspace reset → 3-incident rehearsal**. Press **Run simulation** or **Next event** in the controls. This explicitly selected fixture still pauses at the simultaneous arrival. Use the current supervisor request → acknowledgment → verification workflow in place of the old direct dispatch steps.

---

# Historical scripted rehearsal

Keep the app visible throughout. The factory and the supervisor's priority queue are the demonstration. There are no slides, presentation mode or separate evidence workspace.

## Speaking sequence

| Time | App action | Explain |
| --- | --- | --- |
| 0:00–0:30 | Open on the healthy factory. | “During a supervisor's shift, several incidents can stack up at once. Which one deserves attention first?” |
| 0:30–1:00 | Press **Start demo**. Three reports arrive together after four seconds at the default speed; the clock pauses automatically. | “We consider possible harm to people, comparable cases, wider consequences, confirmed alternatives and the time available to respond. AI interprets the report; evidence and explicit rules determine priority.” |
| 1:00–1:50 | Select the first incident, GA-18, in the right queue. | Read the original observation and ranking decision. “The fixture still runs, but comparable demo cases include injury. Current exposure needs review before we prioritize output.” Expand the matching cases if useful. The factory stays visible beside the incident. |
| 1:50–2:25 | Choose GA-12 in the comparison strip above the report; all competing deadlines remain visible. | “Supply comes ahead of the backup tool because its response window closes sooner. The wheel station has a confirmed alternative.” Keep the explanation tied to the displayed evidence and current times. |
| 2:25–3:40 | **Report incident**. Ask a judge for one observed event at one station; submit it. | “Let's test another report.” The app returns to the factory and updated queue. Select that new row to inspect the original report, provider label and ranking reason. Explain the result actually returned, including missing evidence. |
| 3:40–4:30 | Back to the queue; open GA-18. In the simulation, confirm isolation/personnel clearance, record containment, then dispatch. Return to the queue and resume briefly. | “The supervisor can check the evidence and act. Confirmed containment changes the decision, and dispatched work leaves the waiting list.” The factory shows the station response. The activity strip identifies another incident whose response window was recalculated, using the actual before/after engine states. Other incidents remain available for parallel maintenance. |
| 4:30–5:00 | Leave the factory and updated queue visible. | “We turn competing reports into a prioritized worklist whose reasons a supervisor can inspect. The order updates with new evidence, changing line conditions and completed responses.” |

**Show incoming reports** jumps directly to the same simultaneous arrival if you need to skip the initial four seconds. Keep playback paused while explaining evidence. Opening a report pauses playback. Reports open only from explicit incident/review actions; a new AI result highlights its queue entry without opening anything.

## Rehearsal notes

- One judge input is sufficient; a second is optional if time remains.
- The prepared incidents and case library are synthetic fixtures. They are not live model calls or actual Tesla records. Live judge inputs use OpenAI when available; the report labels offline fallback honestly.
- Safety concerns take precedence over production loss. Historical cases prompt review; they do not establish current exposure or an injury probability.
- Production priority uses the modeled time until impact minus a fixed repair duration. No maintenance waiting time is assumed. Repairs can run in parallel.
- Historical average downtime is not currently an input; configured demo repair durations and the connected line forecast are. Do not claim validated savings, an optimal scheduling algorithm or injury prevention results.
- Skip full-shift settings, optional timing results, exports and diagnostic details in the main five minutes. Keep them for questions.
