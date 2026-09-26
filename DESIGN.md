# Interface decisions

Preserve the original factory view, with vehicle occupancy based on conveyor space rather than a three-car limit. Changes to the incident model are not permission to redesign the machinery, duplicate assets, or change the scene's identity.

## Preserve

- Reuse `SingleLineModel` for both factory views: original cars, conveyors, one glass robot, wheel fixture, roller test, floor, lighting and camera direction.
- Represent additional logical stations with mapped incident locations. Do not invent additional machinery to fill space.
- Keep the established dark controls and light 3D floor. A generic list of AI design stereotypes is not a reason to replace a user-approved palette.
- Keep general maintenance that is always available.

## Default screen

Use the full-height factory area on the left and a simple **Repair order** queue on the right. The user explicitly rejected a permanently visible incident report and multiple competing explanations. The earlier instruction to place the selected report below the factory no longer applies.

Number waiting incidents only. Each row contains:

- rank;
- station and an explicit label only for safety;
- a plain-language problem title;
- the current production consequence and repair duration, or the future buffer/stop deadline while production is protected;
- one emphasized repair-start deadline.

The row must answer “What is wrong, why does it matter, and when does it affect us?” A single technical reason or forecast-unit cost is not sufficient. For example, “Car body supply has stopped,” “Stored car bodies keep assembly running,” and “Buffer runs out in 18 min” connect the fault, the protection provided by inventory and the approaching event. Do not invent a more specific machine failure than the assessment establishes.

Active repairs appear in an unnumbered group below, with plain-language titles and remaining response time; completed work is available on request. Display order and rank-movement indications must use the same waiting-only order.

Place Play, the clock and Next event below the factory. **Demo controls** contains playback speed, one-minute stepping, reset, buffers. A single maintenance footer shows that maintenance is always available, plus Auto-dispatch.

## Phone layout

Below 768px, replace the factory workspace with a single-column supervisor interface. Retain the established charcoal surfaces, thin borders, Geist typography, and semantic urgency colors. Use **Incidents**, **Line**, and **Updates** in bottom navigation. Keep the header compact with line status and a small unread indicator for updates. Waiting incidents preserve the shared priority order, active repairs appear beneath them, and resolved incidents remain in a collapsed disclosure. Each waiting row shows the station, plain problem title, and one emphasized action deadline; deeper consequences and diagnostics appear in the report. Put all playback, next-event stepping, speed, reset and auto-dispatch controls in **Demo controls**.

Use the same simulation and report actions as desktop. Reports and forms fill the phone viewport, with safe-area spacing and at least 44px touch targets. Lead the report with consequence and timing, followed by diagnosis and recommended response. Place case evidence, decision factors and containment controls after the diagnosis; keep supporting evidence and ranking explanations collapsed below. Keep export inside supporting evidence and maintenance actions at the bottom. Never mount the factory scene or preload its models on a phone viewport. Returning to desktop restores its factory view without resetting the simulation.

## Report interaction

Only activating an incident in the right list opens the report drawer. This includes waiting, active and resolved incidents. A factory marker highlights or scrolls the corresponding queue entry without opening a report. New AI results, initial loading, reset and queue updates never open the drawer automatically.

Keep the selected report attached to its incident as ranks and statuses change. Lead with the incident, one reason and the applicable maintenance action. Put the full timing calculation, evidence, assumptions, diagnostics and history inside the drawer, with progressive disclosure where useful.

Provide an explicit Close control, Escape dismissal and appropriate focus management. Return focus to the triggering row when possible, or to the queue heading if that row is no longer available. Use modal semantics only when the background is actually blocked.

## Visual detail

- Use 16px queue problem titles, 13px consequence and event-timing text, and 12px urgency badges. Make the timing line prominent enough to scan without opening the report.
- Keep controls consistent and name the dispatch destination. Use neutral selection; reserve warning colors for actual conditions.
- Avoid redundant arrows, zero counts, permanent “New” tags, padded rank numbers and separators without a grouping purpose.
- Expose input buffers on request, with explicit units. Keep the default factory view uncluttered.
- Show one physical consequence and one event-specific timing line. Show actual production loss as “Production running X% slower” or “Production stopped”. Keep forecast-unit costs and recovery-slack calculations in the report. Do not replace physical meaning with an arrival timestamp or a generic “forecast impact” statement.
- Keep complete model explanations available in the report; simplicity must not hide uncertainty or turn a hypothesis into a fact.

## Repair windows and urgency

Safety concerns come first. Other actionable waiting incidents are ranked by their **remaining repair start window**, smallest first:

> time left to act = time until impact − displayed total repair estimate.

A negative window means the conservative response no longer fits before impact, not a measured amount of downtime. The queue shows “Start now” without a shortfall, or “Start within N min,” plus impact and restoration estimates. The shared policy clamps exhausted start windows to zero. Among “Start now” incidents, current production stops precede current slowdowns, larger percentage reductions precede smaller ones, then approaching deadlines. Positive windows are ordered earliest first. Equal windows and effects use report time, station and incident ID. Unknown timing remains explicit; active repairs stay outside the waiting queue.

This is a least-slack heuristic aimed at avoiding missed restoration windows. It accounts for unlimited parallel maintenance responses and preserves work already underway. It is not an optimal schedule or a guarantee against downtime. The connected model still calculates buffers and production effects; the UI stays focused on the live incident queue; scenario and policy comparisons are outside the current scope.

## Motion and notifications

Preserve the original factory machinery and viewpoint. Representative cars move through flowing sections and queue behind stopped ones. Robot and test animation speeds follow their local station rates. Playback and reduced-motion preferences govern all movement. Motion illustrates flow rather than reconstructing individual vehicle inventory.

Scene pins combine rank and station once, with staggered screen offsets and leader lines that terminate at a dot on the equipment. Attachments stay on the visible conveyor or machinery, including the final inspection zone inside the exit bed. Remove active stations’ duplicate floor codes. Inactive stations retain abbreviated names. A single activity strip announces arrivals, repairs, completion and priority changes; it does not narrate every tick. The queue shows title, action window and production consequence, with no repeated urgency badge or consequence paragraph. Repair #1 dispatches directly; reports still open only from queue entries.

## Research used

These sources inform specific decisions rather than provide a universal detector of AI authorship:

- [Anthropic frontend design guidance](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md): avoid applying generic typography, labels, numbering, metadata and card treatments regardless of subject. Preserve the brief's own direction.
- [Linear: A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh): reduce unnecessary icon and separator prominence, use predictable controls, and refine details within the existing product.
- [Nielsen Norman Group: Five principles of visual design](https://www.nngroup.com/articles/principles-visual-design/): use scale, hierarchy, grouping and readable contrast to communicate importance.

Reviewed 26 September 2026. The observed issues and changes above are project-specific judgments, not claims that a particular color or font proves AI authorship.

## Production effects in the factory

Queue consequences and factory motion share current connected-flow readings. Once production is affected, never display “0 min to impact”: show “Production running X% slower” or “Production stopped”, alongside repair duration. Percentages on incident rows describe that station's actual combined output, while the factory header describes whole-line output. Supply buffers and future holds retain meaningful future deadlines. The 3D view shows amber slowed zones, red stopped zones, and compact percentage/stop labels. Cars cross final inspection before exiting and slow or stop according to each station's actual rate; downstream effects appear as buffers drain or fill, including at stations without their own incident.

Keep ranking explanations inside the incident report, with no “Why first?” section in the queue. Each report shows its reason prominently once; detailed rules and history stay collapsed. Never claim a hidden negative deadline is the reason one “Start now” item outranks another.

## Information ownership

Each report fact has one primary location: action and repair duration in the metrics; comparative reasoning in Ranking decision; case outcomes in Case evidence; additional context in Other decision factors; original observations, diagnosis and checks together in Report & diagnostic checks; past transitions in Incident history. Do not repeat the current explanation in history, repeat the action in an urgency badge, or show a second timing calculation. Repairing reports show only one remaining-time value. Queue rows summarize the incident; factory markers identify its location with one accessible action label.

## Focused evidence demonstration

The default desktop experience uses three incidents; the original ten-event shift remains in Demo controls. Preserve the factory geometry and existing queue layout. Decision logic is opened on demand and begins with the current queue, with full rules collapsed beneath it. It must not become another persistent “why first” block. After all reported/prepared incidents resolve, the empty queue offers View results. Results show the same recorded actions at 0/10/20/30-minute delay on a common recovery horizon, including zero differences; no preselected winning metric or injury-prevention claim. The demo clock shows elapsed time rather than an arbitrary completion target. Mobile exposes the same method and results through Demo controls.

The focused demo opens at minute zero with no incidents and healthy station readings. All three prepared reports arrive together at minute 2. Playback pauses exactly at that decision point, and auto-dispatch is unavailable before the initial review so the queue cannot disappear before comparison. Start/resume advances the clock; opening or resetting the demo must never pre-inject its first fault.

## Presentation workspace

Desktop Compare priorities is an in-workspace evidence table beside the queue, not a modal paragraph list. It shows consequences, confirmed protection and exact repair-window arithmetic from RankedIncident. Safety/unknown gates do not receive a production deadline. The factory remains mounted while hidden so switching views cannot reset vehicle motion. Scene overlays are hidden at their compositing parent, because their per-frame visibility cannot be relied on to inherit hidden state. The main response action names its station; maintenance availability and auto-dispatch live in Demo controls. Mobile retains its compact explanation view.


## In-app presentation flow

The current demo stays in the working application. Remove the slide-based pitch and separate evidence workspace. The factory remains visible throughout incident review. On desktop, selecting an incident replaces the right queue with an inspector and a Back to priorities action; it does not dim or replace the factory. Mobile retains its full-screen report. New AI reports highlight the queue entry without switching screens or opening a report. The focused scenario still starts healthy, introduces three simultaneous incidents and pauses for the supervisor. Presentation notes live in DEMO_GUIDE.md, not on app screens.


## Incident review composition

At wide laptop sizes, the decision area uses 43% of the workspace. While a report is open, a compact comparison strip retains all waiting ranks, stations and response windows. It supports switching incidents without returning to the queue. Show timing, decision, matching cases and containment before original source prose. Same-time supervisor actions may announce changed repair windows for other incidents, using actual before/after forecasts. Ordinary time ticks do not create these causal notifications.

## Factory navigation and equipment

Preserve the original assets and add schematic equipment for previously empty stations: body transfer, cockpit, battery, fluids and inspection. These are illustrative meshes, not plant CAD. Their operating motion follows local flow, playback and reduced-motion settings. Incident leaders terminate on the relevant equipment.

Use a continuous floor with ordinary cast shadows; omit distance fog and the bounded contact-shadow overlay. Orbit and Pan are explicit modes, with pointer-centered wheel zoom, zoom buttons and Fit view. Bound panning and prevent the camera from going below the floor. Resizing preserves the chosen viewing direction; only Fit view restores the overview.

## Schematic production overview

The desktop workspace has a persistent 3D factory / Schematic switch in the line header. The schematic follows the same eight stations and the same current readings as the 3D scene. Its connected path runs left to right across the first row, then right to left across the second; arrowheads show direction. Narrow panels fold into four rows without changing semantic station order.

A station shows its code, plain-language name, concise reported problem, queue priority and actual production state. Healthy stations recede into a neutral surface. Color supplements explicit priority numbers and state labels; it never stands alone. Blocked/starved stations name the adjacent handoff and do not acquire an incident badge. Multiple incidents remain accessible from the station; reports with no confirmed location remain explicitly unlocated. Clicking the map highlights the queue; only explicit incident review opens the report.

Both views remain mounted while switching. A 240–280ms opacity/transform transition preserves simulation, selection and camera state; the inactive view is inert and hidden from assistive technology. Reduced-motion disables the transition. The overview receives more desktop width, with 44px view/action controls and the priority queue kept alongside it. At 1280 × 633 the focused eight-station schematic fits without scrolling.

Applied ui-ux-pro-max accessibility, semantic-state, spacing, contrast, progressive-disclosure and motion guidance. Its installed SKILL.md was available, but its referenced search.py and data package were absent; no generated design-system results are claimed.

## Berlin plant and supervisor line

The priority 3D view now follows the 2023 Berlin planning baseline. This supersedes the earlier instruction to preserve the priority view's small asset scene; the original operations scene is retained. Use a metre-based campus and GA cutaway with **Whole plant / My line** scopes. Both scopes share world coordinates and continuous simulation state. Keep the dark dashboard/light factory identity and existing incident urgency semantics. The plan reference discloses approximated building dimensions and illustrative equipment/routes. Do not present the scene as a current Tesla digital twin. The adjacent schematic remains a logical process diagram.

Floor view places the camera at approximately human height in the supervisor aisle. Show the ceiling from inside, retaining the cutaway for aerial scopes. At oblique angles, arrange incident labels without collisions; let lower-priority background state labels recede while the incident list remains available.
