# Product

## Current supervisor workflow

The primary stakeholder is the production supervisor running this shift. The main
workspace now presents **Needs you**, **Awaiting acknowledgment**, and **Being
handled**, with concrete next actions. Calls require a named acknowledgment;
returned work requires recorded supervisor verification. Personnel concerns and
spreading quality problems hold the whole modeled area. Equipment isolation,
product containment, and area restart are distinct confirmations. Handover notes
accumulate from recorded actions. The queue and factory markers share the same
attention order. This supersedes the repair-only queue and automatic completion
described in earlier sections below. See [SUPERVISOR_ATTENTION.md](./SUPERVISOR_ATTENTION.md)
for the policy, assumptions, tests and remaining scope.

## Independent audience demo

The audience mode at `/demo` is a separate optional presentation flow. Spectators scan a QR link to `/join/[code]`, enter a first name, receive a persistent machine assignment, and select any of three station-specific synthetic faults. Up to 120 virtual audience machines are distributed across the eight existing logical stations. Duplicate reports aggregate by fault; each participant keeps their own selections. The original product and its prepared scenarios remain independent.

The presenter controls lobby, start, pause, reset, containment and maintenance. Green presence indicators mean joined and healthy; red indicates a selected fault, while the repair queue retains the engine's urgency colors. Use the original factory view plus an optional lightweight machine map. Phones never load the 3D factory. Keep the dark product identity, large touch controls, clear saved/sending/reconnecting states, and an explicit paused state. Run on one persistent laptop/Node server with atomic disk persistence and ordinary HTTP polling. See AUDIENCE_DEMO.md for operation and limitations.

## Register

product

## Users

Production supervisors responsible for one moving vehicle line during a shift. They work on the factory floor, often while several problems compete for attention. They are accountable for safety, quality, output, and confirmed handoffs to Maintenance, Quality, Material Flow, Production Planning, or Engineering. They are operational decision-makers, not machine-design or controls engineers.

## Product Purpose

Help a supervisor decide which incident needs attention next as a production line changes. The primary experience models eight connected stations and general maintenance that is always available. Safety comes first, then the least time left to begin a complete maintenance response. Subtract the displayed total repair estimate from impact time. Any reviewed fault can be dispatched immediately; specialist routing is outside the demo's scope.

Success means the supervisor can see what is wrong, how urgently it needs attention, what it affects and when the consequence happens. They can then request maintenance and inspect the supporting assessment when needed. Technical fault names, forecast-unit costs and unexplained scores must not be required to understand the next action.

The hackathon demonstration runs ten synthetic incidents across forty simulated minutes, followed by two natural-language reports from judges. The complete pitch lasts five minutes. The original operations dashboard remains available as a separate view.

## Main experience

Preserve the original factory geometry, machinery, floor and lighting when changing the incident model. Eight logical stations use mapped incident locations rather than extra invented machinery.

The laptop layout has a full-height factory area on the left and a simple **Repair order** queue on the right. Number only waiting incidents. Each row contains the rank and station, a plain problem title, one repair-start countdown, and a compact impact-minus-restoration calculation. Do not repeat the same urgency in a badge, sentence and clock. Red means the response window is exhausted; amber means five minutes or less to act; muted blue means more time. Safety receives an explicit label. Shared policy drives both queue and marker colors.

The original 3D factory uses space-based vehicle occupancy with continuing arrivals and departures and local robot/test motion while playback runs. Pausing and reduced-motion preferences stop this movement. Compact staggered scene pins combine rank and station; inactive stations have short floor labels. One activity strip announces meaningful events. The maintenance footer offers Repair #1 and Auto-dispatch.

The incident report is closed by default. It opens only when the supervisor clicks or keyboard-activates an incident in the right list, including an active or resolved incident. Factory markers only highlight or scroll the corresponding queue entry. Initial loading, reset, new AI assessments and priority changes must not open the report automatically. This supersedes the earlier layout with a permanently visible report below the factory.

Keep Play, the simulation clock and Next event below the factory. Put speed, one-minute stepping, reset, buffers in **Demo controls**. Keep one maintenance footer showing that maintenance is always available, plus Auto-dispatch. Detailed metrics, evidence and diagnostic reasoning belong in the report drawer.

## Phone experience

At viewport widths below 768px, supervisors use a dedicated phone layout with the same incident state and priority policy as the laptop. Bottom navigation contains **Incidents**, **Line**, and **Updates**. Waiting incidents lead the default view in priority order; active repairs follow below, and resolved incidents sit in an expandable list. A compact header communicates line status, and an unread dot points to new in-app updates. Keep playback, next-event stepping, speed, reset and auto-dispatch together in **Demo controls**.

Incident diagnostics open as a full-screen report with reachable actions. Show the consequence, response timing, diagnosis and recommended response before case evidence and decision factors. Keep containment actions available and put detailed evidence, ranking explanations and history below the diagnosis with progressive disclosure. Preserve the dark industrial interface and omit the 3D scene entirely on phones, including its model downloads. This layout does not add background push notifications or cross-device synchronization.

## Brand Personality

Calm, precise, operational. The interface should feel credible to Tesla engineers while remaining immediately understandable to a non-engineering supervisor. Copy is direct and factual, with no consultant language or artificial-intelligence marketing.

## Anti-references

- Dense control-room dashboards that expose every metric, alert, and diagnostic at once.
- Corporate strategy dashboards, generic SaaS cards, decorative analytics, and invented executive terminology.
- Video-game factory scenes with oversized markers, excessive labels, or mixed-quality 3D assets.
- Interfaces that make the supervisor interpret error codes before taking the next action.

## Design Principles

1. Lead with the decision: make the next waiting repair understandable through its problem, urgency, physical consequence and expected event time.
2. Keep one line in view: the factory is a spatial map of the supervisor's own area, not a factory showcase.
3. Separate waiting work from active responses: an incident already being repaired is not another dispatch decision.
4. Reveal technical evidence only on request: the default screen contains no open report.
5. Use credible mock behavior: every demo action must work and every visible state must have a clear operational meaning.
6. Distinguish observations, diagnostic hypotheses and synthetic assumptions. Unknown equipment or fault meanings stay uncertain.
7. Keep urgency separate from resource availability: the repair order remains visible regardless of how many repairs are in progress.
8. Preserve explicit selection: changes to the queue do not replace the incident currently being reviewed.

## Accessibility & Inclusion

Target WCAG 2.2 AA for text, focus states, and controls. Never rely on color alone for line or incident status. Support keyboard use and reduced motion. Opening and closing the report must manage focus predictably and support Escape; a modal drawer must keep background controls inert. Preserve the primary incident workflow on tablet and mobile without requiring a precise 3D interaction.

## Scope for this demo

One live incident workflow: report, understand priority, dispatch, watch production recover. The what-if scenario explorer and policy comparison UI are removed. Keep the main prepared incident timeline and natural-language judge inputs. Do not add alternative scenario controls back without an explicit request.

## Incident decision policy

The queue orders attention by personnel risk, uncontained spread, unknowns requiring verification, then comparable production repair windows. Reports show case evidence and the applied rule. Historical cases and line conditions are clearly synthetic. Confirming containment is a supervisor action, distinct from repair; maintenance remains always available.

Vehicle occupancy is no longer capped at three. Cars retain their original dimensions; visible occupancy follows conveyor space and minimum separation, with entry gated by input flow and departures after inspection. It remains a visual representation, not a literal reconstruction of fractional buffer inventory.

## Focused pitch mode and response evidence

The initial app mode is a three-event synthetic demo: supply interruption with twelve stored bodies, an isolated primary wheel spindle with a calibrated operating backup, and cockpit vibration with comparable synthetic injury cases. The full shift remains selectable. General maintenance is always available. Only an explicitly authored isolated-backup intervention retains output during repair; all safety and containment holds override it. Results replay the supervisor's recorded actions with 10/20/30-minute delays using identical incidents and a common recovery horizon. This supports a response-timing demonstration, not an optimal-ranking or real-world savings claim.

The focused demonstration starts healthy, then injects all three reports simultaneously at minute 2 and pauses playback for priority comparison. A first response leaves the other two open. The initial review cannot be skipped by pre-enabling auto-dispatch. This presentation pacing does not change policy scores, repair duration or maintenance availability.


## In-app presentation flow

The current demo stays in the working application. Remove the slide-based pitch and separate evidence workspace. The factory remains visible throughout incident review. On desktop, selecting an incident replaces the right queue with an inspector and a Back to priorities action; it does not dim or replace the factory. Mobile retains its full-screen report. New AI reports highlight the queue entry without switching screens or opening a report. The focused scenario still starts healthy, introduces three simultaneous incidents and pauses for the supervisor. Presentation notes live in DEMO_GUIDE.md, not on app screens.

## Source-based plant context

The supervisor can switch between the whole 2023 Berlin plant layout and their illustrative line inside general assembly. This replaces the priority view's original isolated asset geometry while retaining the original operations view. The line includes working-scale access, material staging, equipment and supervisory context. Source-backed architecture and inferred line equipment must remain distinguishable through the plan reference. Current as-built conditions, exact Tesla station routing and supervisor software are not verified.
