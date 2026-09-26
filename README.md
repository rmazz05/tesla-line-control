# Tesla Line Control

A production-supervisor prototype focused on dynamic incident prioritization for the Tesla **Built for the Job** hackathon track.

The home page models eight connected stations, finite buffers, and general maintenance that is always available. Safety comes first; the remaining order uses time left to act after subtracting the displayed total repair estimate from predicted impact time. A 20-minute buffer and a 6.5-minute repair estimate leave 13.5 minutes to act (shown conservatively as “Start within 13 min”).

The main screen keeps the original factory view on the left and a **Repair order** queue on the right. Waiting incidents are numbered and have one brief reason; active repairs appear separately without priority numbers. Click an incident in the right list to open its report drawer. Factory markers highlight the corresponding queue entry; they do not open reports. The original operations view remains available at `/operations`.

Below 768px, the home page switches to a supervisor phone view with **Incidents**, **Line**, and **Updates** in bottom navigation. Waiting incidents appear in priority order, followed by active repairs and a collapsed resolved list. A compact header shows line status; an unread dot marks new in-app updates. Tap an incident or update to review its diagnosis and recommended response, confirm containment when applicable, dispatch maintenance, or mark it resolved. All playback controls, **Next event**, speed, stepping, reset and auto-dispatch live in **Demo controls**. The same simulation state survives viewport changes, and the phone view does not load the 3D scene or models. Updates use the current local simulation.

## Run locally

Requirements:

- Node.js 20.9 or newer (Node.js 22 LTS recommended)
- npm (included with Node.js)

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The prepared simulation and planner run locally without a key. Live natural-language incident interpretation uses OpenAI on the server. Create `.env.local` in the project root and set `OPENAI_API_KEY` there; see `.env.example` for the optional model setting. Never prefix a secret with `NEXT_PUBLIC_`. Restart the dev server after configuration.

Without a key, the intake identifies its offline catalog-matching mode. It must not be presented as live AI. All equipment mappings, rates, intervention durations, and scenario data are synthetic rather than Tesla operational records.

## Priority demo

1. Use **Play** or **Next event** below the factory. Ten distinct incidents arrive over forty simulated minutes.
2. Watch repair windows shrink as time passes. Vehicle motion and machine animations follow local flow while playback runs. Scene markers identify station and rank; a single event strip explains arrivals, dispatch, completion and priority changes.
3. Click a waiting incident on the right to inspect its reason, evidence, diagnosis and assumptions, then dispatch maintenance. **Repair #1** offers a direct dispatch action without opening a report. Maintenance can start any number of repairs concurrently; none waits for another to finish.
4. Use **Auto-dispatch** in the maintenance footer to assign every reviewed waiting incident automatically. Existing repairs remain in progress until completed or manually verified.
5. Add two natural-language reports from the judges. Intake pauses simulated time while the assessment runs. The report enters the queue without opening a drawer; click it to inspect the interpretation.
6. Open **Demo controls** for speed, a one-minute step, reset, buffers. Export individual reports from their drawers.

Use [DEMO_GUIDE.md](./DEMO_GUIDE.md) for the five-minute pitch and [INCIDENT_PRIORITIZATION_PLAN.md](./INCIDENT_PRIORITIZATION_PLAN.md) for the model and ranking policy.

## Validation

```bash
npm test
npm run lint
npm run build
npm run benchmark
```

Historical benchmark totals are not a claim about the current policy. The current demo uses case evidence and ordered consequence rules; see DEMO_GUIDE.md. Run npm run benchmark to regenerate synthetic comparisons after policy changes. No real factory savings or optimality are claimed.

## Production build

```bash
npm run build
npm start
```

The project is a standard Next.js application and can be deployed directly to Vercel.

## Original operations walkthrough (`/operations`)

1. Begin at 06:00 with a healthy line. Open **Live data** to show the five cells reporting normal readings.
2. Click **Start shift**. At tick 25, the torque tool reports a fault, the simulation pauses, and the supervisor gets a visible and audible alert.
3. Click **Switch to backup tool**, request the **Tool crib**, wait for its reply, verify the delivered tool, and close the issue.
4. Click **Next event** to reach the glass-robot drive fault. Output falls to 0 JPH until the supervisor clicks **Reroute vehicles to Line 2**.
5. Request **Maintenance**, track the request until it is ready to verify, then confirm the repair and safely return the cars to Line 1.
6. To show a critical multi-incident state, reset the demo and click **Next event** twice without resolving the first issue.
7. Click **Report issue**, ask a judge for a recurring production problem, and create a new classified incident in their own words.

## Data model

In the original operations view, sensor readings, historical repair cases, support requests, and team replies remain deterministic mock data. One tick represents five production minutes across an accelerated 06:00–14:00 shift. Its local keyword classifier is separate from the home page's server-side AI intake and consequence planner.

The line-equipment assets are CC0 and the vehicle model is CC BY 4.0. The focused layout is a representative prototype, not Tesla factory CAD. See [ATTRIBUTION.md](./ATTRIBUTION.md) for source and license details.

## Evidence-based incident decisions

Comparable synthetic cases, current protection, consequence of delay and production repair windows now determine the queue. Personnel concerns cannot be offset by production scores. Reports expose the applied rule, case outcomes, differences and unknowns. Explicit supervisor containment holds equipment without resolving its repair. See DEMO_GUIDE.md for the five-minute walkthrough.
