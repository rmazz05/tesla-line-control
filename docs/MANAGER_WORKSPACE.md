# Manager workspace and factory simulation

## What was broken

The home page previously created a local React simulation in each browser. Its default was the same three reports at minute two; the full shift used a second fixed list. Opening a report stopped playback. Phone and PC layouts shared state only when resizing one browser, not across devices. Thus the presentation could not test changing workloads or a mobile supervisor handing an incident to their desk.

## Phones on other networks

Start the local app as usual (`npm run dev`, or a built production server). Open **Connect devices** on the PC. The server starts a temporary Cloudflare Quick Tunnel to that same app, waits for registration, then presents a QR code and copyable workspace link. There is no manual address field or provider terminology in the interface. The host requires `cloudflared` (`brew install cloudflared` on macOS); `CLOUDFLARED_BIN` may specify an absolute executable path.

Scan with a phone on another Wi-Fi network or mobile data. No app, VPN, or shared Wi-Fi is required on the phone. The PC can stay on localhost; the phone uses HTTPS to reach the same server and workspace. Opening **Connect devices** from an already public HTTPS page reuses that page's origin. Close the panel without interrupting connected phones; reopen it to reuse the active connection. A failed connection clears the QR and offers **Try again**.

Keep the laptop awake, online, and the local server running. Stopping the server also terminates its connection; a new server session generates a new public URL but preserves saved workspaces and audience rooms. For a permanent URL independent of the laptop, deploy the application to an always-on Node host with persistent storage (or replace the stores with a shared database).

`/api/manager/connection` requires an existing workspace capability, a local same-origin request, and a loopback server address before it can start a process. Remote/proxied requests cannot create connections. The upstream comes from the local request's server; request bodies cannot choose a URL, executable, or arguments. One process is shared across workspaces on the server, concurrent starts are idempotent, and startup is bounded to 45 seconds. A process failure clears the advertised URL and terminates the child. Diagnostics stay in server logs.

The Next.js development configuration allows the temporary connection hostnames to load development assets and HMR. This makes `npm run dev` usable from the generated phone link as well as the production server.

Optional CLI: `npm run build` and `npm run share` launch a production server on loopback port 3101 and print public manager/audience URLs. The launcher starts its tunnel only after its server is ready. To choose another port, use `PORT=3102 npm run share`. It explicitly supplies absolute paths for both stores because Next's standalone server changes its working directory.

Reference: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Current flow

1. Open `/` on the PC. A persistent manager workspace starts with no incidents and no factory feed.
2. Choose **Connect devices** and wait for **Ready to connect**. Scan the QR on the phone. A workspace link is a private access capability; anyone with it can operate this prototype workspace.
3. In **Demo controls**, choose a frequency and arrival period, select **New random run**, then **Run simulation**. Both devices now observe the same clock, incidents, buffers, output and supervisor actions. There is no independent phone simulation.
4. The phone provides the lightweight action queue, incident report and line status. **Inspect on PC** records a durable inspection request. A connected PC opens that incident's report alongside the 3D factory/schematic view within its next polling interval. The PC page must be open; the browser cannot launch another computer's browser or bring a background application to the foreground. A disconnected PC receives the pending inspection on reconnect.
5. Record calls, named acknowledgments, containment, follow-ups and verification. The engine simulates repair duration after accepted, eligible work starts. It does not automatically manufacture a supervisor acknowledgment or release returned equipment. Held areas need an explicit restart confirmation.

Opening reports, switching visualization, and changing devices do not pause the simulation. **Pause simulation**, **Next event**, stepping, replay and reset are explicit shared controls. Reset replaces the current run on every connected device. Controls display output, lost units and stopped minutes for comparing different responses to a repeated seed.

## Randomness and model boundaries

- A new run obtains a fresh 32-bit seed. The generator samples exponential arrival intervals with a 15-second minimum and random catalog fault types. Replaying a seed with the same frequency and duration recreates that schedule.
- Each catalog fault retains its station and authored physical/evidence assumptions. Randomization changes arrival time and fault selection, not the priority rule or a purported real injury probability.
- An already-active instance of the same station/catalog fault is not duplicated. After verification closes it, a later occurrence can create a new incident. Skipped duplicates remain consumed schedule events. **Next event** advances past them to the next new incident, or to the end of the remaining schedule.
- Forecasts use current incidents only. Future random events stay on the server and are omitted from phone/desktop snapshots. The arrival period ends new faults; outstanding responses can continue afterward.
- The old three-incident rehearsal and ten-incident shift are retained as explicitly named scripted fixtures. Only the three-incident rehearsal automatically pauses at its authored decision point.
- **Manual reports only** adds no generated faults. This is a usable manager workflow prototype, not a live MES/PLC integration. Source labels remain visible.

## Shared state and hosting

`/api/manager` owns the clock and validates typed commands. One elapsed-wall-time calculation advances the simulation, regardless of how many devices poll. Reads and mutations are serialized with in-process queues and filesystem locks; atomic file replacement persists to `.manager-workspaces/` or `MANAGER_DATA_DIR`. Refreshes and server restarts preserve state. A gap of more than 60 seconds without requests pauses playback on reconnect, with an explanatory notice, instead of silently consuming an unobserved shift.

Command IDs prevent retried mutations from running twice. Run epochs reject stale commands and late AI results after reset. AI assessment happens outside the storage lock using captured server telemetry; the result is added only if the run still matches. Snapshot revisions prevent a delayed response from overwriting a newer client view.

The audience presentation uses its separate `/api/demo` and `.audience-demo/` store. It cannot populate or reset manager workspaces. `/operations` is a separate legacy deterministic walkthrough.

This implementation needs a persistent single Node host and reachable networking. Production deployment still needs a transactional shared database, identity and device authorization, real telemetry ingestion, and operational validation of the synthetic model. No external calls/messages are sent by the supervisor response controls.

## Verification

`tests/manager-simulation.test.ts` checks reproducible seeds, varied arrivals, no scripted leakage or future-event ranking leakage, duplicate suppression, a shared clock, explicit pauses, reconnect behavior, inspection persistence and a complete response/verification flow that changes physical output. `tests/manager-api.test.ts` checks concurrent devices, persistence, access isolation, retry deduplication, stale-run rejection, offline report intake and inspection delivery. The existing audience and priority-engine suites remain applicable.

`tests/manager-connection.test.ts` checks local-only process creation, workspace authorization, shared starts, readiness, process exit, timeout cleanup, retry, and rejection of caller-selected upstreams.
