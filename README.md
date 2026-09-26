# PROJECT CONTEXT — Tesla Hackathon Production Supervisor

The main manager workspace now uses a supervisor attention workflow: next action,
named acknowledgment, monitored commitments, verified handback and explicit area
restart. See [SUPERVISOR_ATTENTION.md](./SUPERVISOR_ATTENTION.md). Earlier repair-only
walkthroughs below apply to the legacy simulation; do not use their benchmark or
automatic completion behavior as evidence for the supervisor workflow.

A production-supervisor prototype focused on dynamic incident prioritization for the Tesla **Built for the Job** hackathon track.

## 1. Context

We are developing a prototype for a Tesla hackathon.

The operating environment is a Tesla Gigafactory / moving automotive production line, comparable to Gigafactory Berlin-Brandenburg.

Our ONLY target user is the:

The app has three separate uses:

- **Manager workspace (`/`)**: the supervisor’s phone queue and desktop inspection view share persistent server state. On a phone, open an incident and choose **Inspect on PC**. Its report opens beside the 3D factory and schematic in the connected PC browser. Use **Connect devices** to pair them with a private link/QR code. The PC page must be open; a pending inspection is retained if it is disconnected.
- **Demo controls**: the factory simulation console inside the manager workspace. Choose **New random run**, then **Run simulation**. Arrival times and fault types vary, while **Replay seed** repeats a run with the same seed, duration and frequency. Playback, speed, stepping and reset are confined to this console. Opening an incident or working on the phone does not pause the clock.
- **Audience demo (`/demo`)**: the separate QR-code presentation. Audience members toggle faults on assigned machines; it has its own rooms, controls and clock.

A new manager workspace starts empty in **Manual reports only** mode. Real factory telemetry is not connected. Manual/AI-assessed reports and synthetic simulations use the same prioritization and supervisor workflow. Requests require a named acknowledgment; simulated team returns require explicit verification. Protection and restart confirmations remain supervisor actions.

The original, deterministic operations walkthrough remains at `/operations` as a legacy prototype, not the manager workspace. See [docs/MANAGER_WORKSPACE.md](./docs/MANAGER_WORKSPACE.md) for setup, limits and verification.

**Production Supervisor**

Do not expand the product into Production Engineering, root-cause analysis, process optimization, machine redesign, or long-term manufacturing improvement.

For the separate QR-code audience presentation, open `/demo`, create or restore a room, and show the QR panel. It automatically prepares and verifies access for phones on any Wi-Fi network or mobile data. Wait for **Ready for the audience**; no Terminal commands or address entry are needed in the presentation flow. See [AUDIENCE_DEMO.md](./AUDIENCE_DEMO.md) for participation, recovery and developer startup details.

To connect phones on any internet-connected Wi-Fi network or mobile data, open **Connect devices** in the local manager workspace. The server automatically prepares a temporary public connection and displays the workspace QR; the PC stays on its local page. Keep the computer awake, online, and the app running. The host needs `cloudflared` installed (`brew install cloudflared` on macOS, or set `CLOUDFLARED_BIN` to the executable path). No provider configuration or address entry appears in the app. Reopening the panel reuses the active connection; restarting the server requires a new QR.

For an optional terminal-based production launcher, run `npm run build` then `npm run share`. It starts the app and a temporary public connection on port 3101 and prints manager and audience URLs. Both launch modes use the same persistent manager store.

Requirements:

Do not expand the product into Production Engineering, root-cause analysis, process optimization, machine redesign, or long-term manufacturing improvement.

For now, our product is specifically focused on:

> REAL-TIME INCIDENT PRIORITIZATION FOR THE PRODUCTION SUPERVISOR.

---

## 2. Who is the Production Supervisor?

A Production Supervisor is responsible for one section of a moving vehicle production line during one shift.

The supervisor is responsible for:

- safety in their area;
- people working in the area;
- assigning qualified workers to stations;
- handling absences;
- keeping production running;
- maintaining required quality;
- reacting to operational incidents;
- coordinating with Maintenance, Quality, Planning and Engineering;
- deciding which problem to handle first;
- deciding whether production continues, slows, reroutes or stops;
- returning the area to schedule after problems are resolved;
- communicating relevant open issues to the next supervisor.

The supervisor manages CURRENT OPERATIONS.

They do NOT:

- redesign production processes;
- redesign machines;
- perform long-term root-cause analysis;
- define future production schedules;
- change official manufacturing methods.

Those activities belong to other roles.

---

## 3. How the Supervisor Actually Works

The supervisor is physically present on the production floor for most of the shift.

After the initial staffing/setup phase, their job becomes similar to being a "firefighter".

Problems continuously appear across the line.

Examples:

- machine stopped;
- quality problem;
- safety issue;
- missing material;
- operator absent;
- Maintenance required;
- Planning change;
- Engineering request;
- minor production interruption.

Information is fragmented.

It can arrive through:

- direct observation;
- operators;
- team leads;
- phone;
- radio;
- messages;
- machine systems;
- existing production software.

Sometimes the supervisor literally sees or hears a problem happening.

Several problems can occur simultaneously.

---

## 4. Core Problem

The supervisor cannot be everywhere at the same time.

When multiple incidents happen simultaneously, they need to quickly understand:

> "What requires my attention right now?"

The problem is NOT a lack of information.

The problem is that information comes from many different sources and the supervisor must continuously reconstruct:

- what is happening;
- what is urgent;
- what requires their presence;
- what can wait;
- what has already been delegated;
- what another team is handling;
- what is waiting for acknowledgement;
- what has been resolved.

The supervisor's attention is therefore a scarce operational resource.

Our product should help allocate that attention.

---

## 5. Current Product Focus

We are building a:

## REAL-TIME INCIDENT PRIORITIZATION SYSTEM

The system collects current incidents from the production area and creates a single operational state.

It then helps the supervisor understand which incidents require attention first.

Conceptually:

```
FACTORY EVENTS
      ↓
EVENT / STATE LAYER
      ↓
PRIORITIZATION ENGINE
      ↓
SUPERVISOR
      ↓
HUMAN DECISION
      ↓
ACTION / DELEGATION / MONITORING
      ↓
UPDATED STATE
```

The system provides DECISION SUPPORT.

The supervisor always retains final decision authority.

---

## 6. Important Operational Rules

Some events should not be treated as ordinary priority scoring.

There are hard operational constraints.

## Test the manager workflow

1. Open `/` in the local app on the PC, choose **Connect devices**, wait for **Ready to connect**, and scan the QR with the phone. Any internet-connected Wi-Fi network or mobile data works.
2. In **Demo controls**, select frequency and duration, choose **New random run**, then **Run simulation**. Record the displayed seed to reproduce arrivals later.
3. Close controls and walk through the phone queue. Reports do not stop the factory. Use **Inspect on PC** to open the same incident on the desktop with the 3D factory and schematic available.
4. Record the response request and a named acknowledgment. Confirm protection where required. Simulated work returns for verification, then explicitly verify and close it. Confirm area restart separately if the area is held.
5. Use the controls to pause, step time, advance to the next event or team returns, and inspect produced/lost units and stopped minutes. Replaying a seed with different response decisions lets you test the impact of the workflow. There is no automatic claim of optimality or real-world savings.
6. The former fixed three-incident and ten-incident sequences remain under **Scripted fixtures and workspace reset** for regression/rehearsal. They are intentionally deterministic.

## 6. Important Operational Rules

Some events should not be treated as ordinary priority scoring.

There are hard operational constraints.

## Safety

A safety risk requires stopping work in the affected area.

Safety rules must never be overridden by an AI-generated priority score.

## Quality

A quality problem that may continue spreading also requires stopping the affected work.

An already-isolated defect can potentially be handled while the rest of the area continues.

## Major Line Stop

If something is properly stopping the production line, this is immediately highly relevant to the supervisor.

## Other Incidents

For competing incidents without deterministic rules, the supervisor must decide what to address first.

Our system should help provide the context needed for this decision.

---

## 7. Prioritization Engine

The central software component is the Prioritization / Attention Engine.

Its job is to transform multiple simultaneous incidents into a useful operational view.

Potential incident inputs include:

- category;
- station;
- severity;
- safety impact;
- quality impact;
- production impact;
- whether production is stopped;
- time since detection;
- current status;
- responsible team;
- whether another team has acknowledged it;
- whether supervisor intervention is required.

Possible future variables:

- supervisor location;
- estimated walking time;
- production buffers;
- estimated time-to-impact;
- upstream/downstream impact.

Do not assume all future variables are available in the current prototype.

---

## 8. Priority Is Not Just "High / Medium / Low"

We do NOT want to build a generic notification dashboard.

The useful distinction is closer to:

## NEEDS YOU NOW

The supervisor must personally evaluate or act on the incident.

## WAITING FOR ACKNOWLEDGEMENT

Another team has been contacted but has not yet confirmed that they are acting.

## BEING HANDLED

The issue has been acknowledged and another responsible person/team is currently handling it.

## MONITOR

The issue exists but currently does not require supervisor intervention.

## RESOLVED

No further immediate action is required.

Example:

```
NEEDS YOU NOW

🔴 Station 24
Quality issue
Supervisor decision required


WAITING FOR ACKNOWLEDGEMENT

🟡 Station 31
Maintenance contacted
No response yet


BEING HANDLED

🟠 Station 17
Maintenance acknowledged
Intervention in progress


MONITOR

Station 12
Issue contained
No immediate supervisor action
```

---

## 9. Issue Lifecycle

Each incident should have a persistent state.

Example:

```
DETECTED
    ↓
NEEDS ACTION
    ↓
CONTACTED / DELEGATED
    ↓
ACKNOWLEDGED
    ↓
IN PROGRESS
    ↓
RESOLVED
```

Acknowledgement is important.

Contacting Maintenance, Quality, Engineering or Planning does NOT mean the coordination loop is complete.

The contact is considered complete only when the other person/team confirms that they are acting.

The application should make open coordination loops visible.

---

## 10. Main Interface — Mobile

The supervisor normally moves around the production line.

They have access to both smartphones and laptops.

However, spending time looking at a laptop means spending less time observing the physical production floor.

Therefore:

**The primary interface must be MOBILE-FIRST.**

The phone should answer in seconds:

> "What needs me now?"

Example:

```
┌─────────────────────────────┐
│ PRODUCTION SUPERVISOR       │
│                             │
│ NEEDS YOU                   │
│                             │
│ 🔴 STATION 24              │
│ Quality issue               │
│ Supervisor required         │
│ 1 min ago                   │
│                             │
│ [OPEN]                      │
│                             │
├─────────────────────────────┤
│ Waiting for response     1  │
│ Being handled           3  │
│ Monitor                 2  │
└─────────────────────────────┘
```

The goal is NOT maximum information density.

The goal is minimum cognitive load.

---

## 11. Secondary Interface — Detailed PC View

Some incidents may require more information than is practical to display on a phone.

For these situations, we are considering a second interface:

**Detailed Incident View on a factory PC**

The phone remains the primary interface.

The PC is only used when the supervisor needs to deeply inspect a specific problem.

Example workflow:

1. Supervisor sees Station 24 incident on phone.
2. Supervisor decides they need detailed information.
3. Supervisor presses:

   "OPEN DETAILS ON PC"

4. The backend sends a real-time command to the PC associated with that area/station.
5. The web application is already running on that PC.
6. The PC automatically navigates to:

   /issues/123

7. When the supervisor reaches the PC, the detailed incident page is already open.

Concept:

```
PHONE
  │
  │ "Open details on PC"
  ▼
BACKEND
  │
  │ Real-time event
  ▼
FACTORY PC
  │
  ▼
/issues/123
```

---

## 12. Mobile vs PC Responsibilities

The two interfaces serve the SAME supervisor but different contexts.

## MOBILE

Answers:

> "What should I care about?"

Used for:

- priorities;
- incident overview;
- quick actions;
- status;
- acknowledgement;
- delegation;
- navigation between incidents.

## PC

Answers:

> "Give me the detailed context for this specific incident."

Potentially shows:

- detailed machine information;
- event timeline;
- technical details;
- station information;
- related system data;
- current intervention status.

Do not duplicate the full desktop experience on mobile.

---

## 13. High-Level Technical Architecture

Use one shared backend and one shared data source.

Conceptually:

```
                    DATABASE
                       ▲
                       │
                 ┌─────┴─────┐
                 │  BACKEND  │
                 │           │
                 │ API       │
                 │ Realtime  │
                 └──┬─────┬──┘
                    │     │
               HTTP │     │ WebSocket /
                    │     │ realtime event
                    ▼     ▼

             MOBILE UI    FACTORY PC
             priorities   detailed view
```

The backend should manage:

- incidents;
- stations;
- incident status;
- ownership;
- acknowledgement;
- priority;
- connected devices.

The realtime layer can use:

- WebSockets;
- Socket.io;
- Supabase Realtime;
- Firebase;
- or an equivalent technology.

Shared manager workspaces and audience rooms use Postgres when `DATABASE_URL` is set. Without it, local demos use persistent files on one Node server. Vercel requires the shared database; phone pairing and audience QR codes use the deployed HTTPS address directly.

For Vercel setup and database initialization, see [docs/VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md).

---

## 14. Suggested Data Model

An incident could look approximately like:

```json
{
  "id": "INC-1024",
  "timestamp": "2026-09-26T08:41:00",
  "station": "S24",
  "category": "quality",
  "description": "Quality issue detected",
  "severity": "high",
  "safetyImpact": false,
  "qualityImpact": true,
  "productionStopped": false,
  "status": "needs_attention",
  "owner": null,
  "acknowledged": false,
  "requiresSupervisor": true
}
```

This is only a starting schema and can evolve.

---

## 15. Prototype Goal

The prototype should demonstrate a realistic sequence with MULTIPLE simultaneous incidents.

For example:

```
INCIDENT A
Station 12
Machine problem
Maintenance already acknowledged

INCIDENT B
Station 24
Quality problem requiring supervisor decision

INCIDENT C
Station 31
Maintenance requested but not acknowledged
```

The application should make it immediately clear that:

Station 24 → NEEDS SUPERVISOR

Station 31 → WAITING FOR ACKNOWLEDGEMENT

Station 12 → ALREADY BEING HANDLED

Then the state should dynamically update as the simulated factory changes.

---

## 16. What We Are NOT Building

Do NOT expand the scope into:

- Production Engineer workflows;
- root-cause analysis;
- long-term pattern detection;
- process redesign;
- machine optimization;
- employee performance tracking;
- worker ranking;
- autonomous line control;
- autonomous safety decisions;
- generic factory analytics;
- another KPI dashboard.

The current scope is deliberately narrow:

> REAL-TIME INCIDENT PRIORITIZATION AND SITUATIONAL AWARENESS FOR THE PRODUCTION SUPERVISOR.

---

## 17. Product Principle

Every product decision should answer:

> "Does this help the supervisor understand what deserves their attention right now?"

If not, it is probably outside the current MVP scope.

The application should REDUCE information overload, not create another source of information.

---

## 18. One-Sentence Product Definition

> We provide Production Supervisors with a real-time attention layer that consolidates fragmented factory incidents and makes it immediately clear what needs their attention, what is waiting for someone else, and what is already being handled.

---

## 19. Current Development Priority

For now, prioritize implementation of:

1. Incident data model
2. Simulated factory incidents
3. Incident state management
4. Prioritization logic
5. Mobile supervisor priority view
6. Dynamic real-time updates
7. Detailed incident page
8. Phone → PC "Open Details" functionality

Do NOT spend development time on features outside this core workflow until the incident-prioritization experience works end-to-end.

---

## Run locally

Requirements: Node.js 20.9 or newer, and npm.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
