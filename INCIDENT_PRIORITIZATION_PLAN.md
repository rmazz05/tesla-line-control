# Current decision policy

The implementation is in `src/lib/priority/policy.ts`; case retrieval and evidence assessment are in `case-library.ts`. The same decision object drives sorting, queue actions, report reasoning and export. The model cannot write a score, case record, numerical forecast or containment confirmation.

Ordered gates:
- R1: credible current personnel hazard or serious injury history with current exposure/protection unconfirmed. Current hazardous observations precede historical signals. Request immediate qualified review.
- R2: uncontained quality consequences can propagate into later work. Confirm protection or containment.
- R3: unknown consequences require verification, not an assumed low-risk classification.
- R4: comparable production incidents follow the shortest supported repair-start window. Exhausted windows show Start now; current stops precede slowdowns and future effects. Required operations precede confirmed backups at equal windows/effects; larger slowdowns then win.
- Repairs in progress leave the waiting order. Equal decision factors use report time, station and incident ID. The explanation identifies a tie rather than inventing different risk.

Only synthetic scenario observations can assert independent verification or a calibrated backup. Live AI assessments cannot assert those controls. A supervisor can explicitly confirm isolation and personnel clearance; the equipment remains stopped until repair and verification finish. The action is recorded independently of repair dispatch.

Case records match both the station/equipment and symptom catalog family. Conditions and mismatches are visible; retrieval establishes relevance, not identical causes. History includes injuries and benign outcomes without averaging away serious harm. No injury probability is computed. No safety countdown is inferred.

Maintenance is always available. One fixed repair duration includes checks and drives displayed estimates and simulated completion; it counts down only after dispatch. The connected-flow forecast supplies production-only deadlines from authored demo assumptions. No what-if exploration UI is included.

Tests cover ordering gates, irrelevant cases, containment transitions, unknowns, case/control trust boundaries, exact repair durations, finite-buffer conservation, concurrent repairs, stable ties, UI wording and API validation.

Forecast stability: simulation and paired forecasts stop exactly at known repair completions, scheduled holds, and buffer-empty/full boundaries. Forecast flow is evaluated at the current instant instead of averaging over a future half-minute. This prevents tick-phase-dependent deadlines and rapid colour/order reversals without delaying real changes or safety escalations.
