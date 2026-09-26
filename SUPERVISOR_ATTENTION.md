# Supervisor attention algorithm

The production supervisor is the primary user. Their job is to run the current
shift using approved methods: protect people and quality, maintain trained station
coverage, coordinate responses, verify returned work, and hand over the area.
Engineering designs and approves methods; the supervisor does not invent repair
procedures or optimize the schedule beyond the shift.

## Implemented policy

The main manager workspace enables `SimulationState.supervisor`. The production
engine remains the shared source of station flow and incident evidence. The
attention layer in `src/lib/priority/attention.ts` converts that evidence into
supervisor actions. The main desktop and phone views use the same policy.

1. **Protection:** current personnel concerns, comparable injury history with
   protection unconfirmed, and uncontained quality spread hold the whole modeled
   area. All eight modeled stations belong to this one area. This is a declared
   demo boundary, not a reconstruction of actual plant stop zones.
2. **Verification:** unknown consequences require an observation or a qualified
   investigation. A verified location supplies no diagnosis or numerical effect.
   An accepted investigation can be monitored, avoiding a permanently urgent
   unknown at the top of the list.
3. **Production and commitments:** prioritize due follow-ups, returned work,
   restart review and supported contact deadlines. Production contact time is
   impact time minus the upper catalog repair estimate, a two-minute acknowledgment
   allowance, and one minute of supervisor attention. These are authored bounds
   and allowances, not learned probabilities or service guarantees.
4. **Stable attention:** an explicitly selected action receives one simulated
   minute of focus. New protection actions and equal/higher-tier deadlines that
   expire before it finishes can interrupt it. Cosmetic reorderings do not.

Production countdowns are unavailable while an area hold is active. An area stop
must not be interpreted as evidence that a fault has become harmless. Deadlines
are recomputed after an explicitly confirmed area restart.

## Closed-loop response

`Not contacted → awaiting acknowledgment → accepted → returned → verified/closed`

- Recording a call does not create an owner or start a repair. It sends no real
  message. A supervisor records the name of the person who confirmed they act.
- Acknowledgment starts a known response only when protection is established.
  If acknowledgment comes before containment, starting the accepted response is
  a separate action after containment.
- Unknown reports remain investigations without fabricated repair durations.
- Accepted work leaves immediate attention until its checkpoint, a protection
  concern, or handback. Follow-up notes cannot manufacture acknowledgment.
- The demo repair timer returns work for supervisor verification. It never
  silently resolves the incident or restarts the area.
- Verification requires an explicit confirmation and recorded result. Unknown
  investigations require a responsible team's recorded return first.
- The model rejects generic closure and automatic dispatch in supervisor mode.

Equipment isolation and product containment are distinct. Product containment
requires confirmation that affected product is segregated **and** an approved
check prevents further spread. It cannot be used to clear a personnel concern.
An area restart cannot clear a remaining equipment hold or resolve another fault.

The queue, reports, and factory marker numbers use the same attention projection.
Shift handover is generated from recorded ownership, open commitments, protection,
and supervisor corrections. It is a reviewable draft, not an AI-generated history.

## Scope and validation

This is the first operational attention policy, not an optimal scheduling claim.
The legacy audience/replay simulation and legacy benchmark retain their original
behavior when supervisor mode is absent. Legacy output-loss comparisons are not
presented as evidence of this new policy's effectiveness.

Regression tests exercise whole-area holds, independent hazards, product versus
equipment containment, acknowledgment, overdue work, explicit verification,
unknown investigations, focus interruption, conservative contact windows,
handover, immutability and duplicate actions. Browser checks cover the shared
desktop/phone response flow. Passing tests establishes behavior under these
synthetic assumptions, not real factory reliability.

## Next algorithm milestones

1. Add staffing coverage, qualification validity and relief assignments, with a
   constraint that moving a person cannot create another uncovered station.
2. Represent supervisor action durations and finite maintenance/quality resources.
   Compare short feasible action sequences with the same information and resources.
3. Evaluate candidate questions by whether plausible answers change the action;
   never invent a probability of injury or treat scenario frequency as confidence.
4. Validate against held-out shift replays, then shadow real supervisor decisions.
   Measure critical response times, missed commitments, output, supervisor effort
   and unnecessary interruptions separately. Include losing cases and uncertainty.

The design draws on [attention-sensitive notification research](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/cacm-attention.pdf)
and [NIST's manufacturing twin credibility considerations](https://www.nist.gov/publications/credibility-consideration-digital-twins-manufacturing).
The implementation deliberately uses inspectable rules until data supports more
complex optimization.
