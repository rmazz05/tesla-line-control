# Audience-controlled factory demo

The manager workspace at `/` uses a separate shared simulation. The legacy `/operations` walkthrough is also independent. Select **Audience demo** in the header or Demo controls to open `/demo`. A room has its own simulation, participants, clock and incidents.

## Run the presentation

Open **Audience demo** in the running local app, create or restore a room, then show its QR panel. The app prepares the public connection automatically. No Terminal commands or pasted addresses are needed during the presentation.

1. Keep the laptop connected to the internet. Audience phones can use any Wi-Fi network or mobile provider.
2. Wait for **Ready for the audience**. The QR appears only after the app has checked that the public link reaches this exact local app. Opening and closing the panel reuses the running connection. Temporary outages hide the QR while the app checks and reconnects; persistent errors offer **Retry connection** inside the panel.
3. Show the QR code. People enter a first name and receive a random machine immediately. Assignments are balanced across the line, with a unique machine ID for every person. Their names appear on the shared screen. No account or installation is required.
4. Joined machines appear green. **Start round** enables each phone's three fault switches. The QR panel folds away to expose the factory and repair queue. Late arrivals can still join through the same link.
5. Ask everyone to select any combination. Red dots mean selected faults. Queue colors still mean urgency under the product's policy, so a red machine can legitimately have a blue, buffered repair window.
6. **Pause round** freezes both inputs and simulated time for discussion. Open an incident to inspect its reason and confirm containment. **Repair #1** dispatches the first response. Automatic repair completion clears the corresponding switches on every reporting phone. **Complete repair** permits a fast presenter walkthrough.
7. **Reset round** clears all faults and returns to the lobby while preserving machine assignments and the QR link. **End demo** locks inputs until the room is reset.

For a five-minute pitch: allow 30–45 seconds to join, start the round, give the audience 15–20 seconds to create faults, pause to explain the top priorities, dispatch a repair, then resume. The clock runs at 10× wall time. No API key is needed for audience mode.

The simulation, prioritization and room files remain on the laptop. Cloudflare is the HTTPS relay that lets phones on other networks reach it. Keep the laptop awake and online. An app/helper restart may produce a new temporary public address; display the updated QR and have disconnected participants rejoin. Ordinary refreshes and temporary network interruptions reuse the running helper and address.

## Developer startup

The prepared presentation Mac already has `cloudflared` installed. The app locates its Homebrew binary without depending on an interactive shell. `CLOUDFLARED_BIN` can override the executable on another prepared machine. Build and start the application once before presenting:

```bash
npm run build
npm run demo
```

The launcher serves the production app on port **3001**, packages its standalone static assets and binds local network interfaces. Each running presentation uses a complete temporary runtime snapshot, so a later build cannot remove its JavaScript, fonts or models. The launcher removes that snapshot after shutdown; room data remains in the original persistent directory. Open `/demo` on that laptop using localhost or one of its own LAN addresses. The QR panel launches and supervises its own relay. `npm run share` remains an optional developer shortcut; it is unnecessary for the audience QR flow.

## Simple technical choices

- **Ordinary HTTP, no WebSocket infrastructure.** The presenter polls once a second and phones every two seconds, with a new poll only after the previous one finishes. Fault submissions are immediate POST requests. Mobile controls respond optimistically, show sending state, and retry temporary failures. In normal conditions the presenter updates within about one poll interval plus request time.
- **One authoritative server.** Assignments and all mutations are serialized per room. Files are written using a temporary file plus atomic rename. A filesystem lock also covers separate Next workers. Same-process requests queue without spinning on the filesystem.
- **Automatic audience access.** Only an authenticated presenter on the local app can start the relay, and its target is derived from the request's validated local address. Phone tokens cannot start it or supply an upstream URL. The QR is withheld until a public request returns this app instance's non-secret identifier. Background checks continue when the panel is hidden, with bounded helper restarts and a UI retry. The app does not store old relay URLs as future defaults.
- **Persistence.** Room files are stored in `.audience-demo/`, excluded from Git, or in the absolute `DEMO_DATA_DIR` directory. Room access expires after 12 hours without requests; expired files remain on disk until removed. Browser storage remembers the presenter credential and each participant's machine. Use the same browser and origin to recover access after refreshing. Losing browser storage means losing that credential.
- **Separate access.** Random room codes are safe to display; presenter and participant tokens stay in browser storage and authenticated requests. Participants can change only their assigned station's faults. Snapshots do not include tokens. Keep the presenter browser private.
- **Retry correctness.** Each phone saves an outbox of switch changes before sending, so a refresh can resume an interrupted submission. Requests have unique IDs and an expected machine version: a lost response can be retried without undoing a repair, and concurrent changes cannot overwrite newer state. The server rejects previous-round inputs. Phones discard stale queued changes with an explanation and fetch the current state. Temporary network errors and rate limits retry automatically; returning to the tab or regaining connectivity triggers an immediate retry. Presenter command identifiers prevent a retried reset or repair from executing twice. Older clients retain sequence-based input support until refreshed.
- **Bounded crowd model.** Up to 120 participants receive unique machine IDs, randomly chosen among the least occupied of eight modeled stations. Refreshing, reconnecting and resetting a round preserve the assignment. These are virtual audience machines within a station, not additional independent production lines. Each station has three independently compatible faults affecting separate components or previously completed work. A restricted filter can remain faulty while a broken pump motor stops the station; descriptions do not claim both stopped and running states at once. Repeated selections of one option combine into one incident; the incident remains active until all reporters clear it or maintenance resolves it. Different faults compose using the existing engine. At most 24 fault types are active simultaneously.
- **Same priorities.** Audience selections map to synthetic catalog assessments and call the existing `addIncident`, `getRankedIncidents`, `advanceSimulation`, containment and repair functions. There are no AI requests or random server-injected faults. The normal shift's minute-zero incident and later scripted events are excluded.
- **Connection recovery.** A missing participant is marked reconnecting after 30 seconds; faults and assignments remain intact. If presenter heartbeats stop for more than 15 seconds, the next request pauses the room instead of fast-forwarding the simulation. Phones resynchronize when resumed. A laptop sleep or server restart does not imply that repairs happened off-screen.
- **Light phones.** The participant page does not import the 3D factory or download its model files. The presenter can switch to **Machine map** for an overview without WebGL.
- **Mobile recovery.** The phone uses local and tab storage, with in-memory participation still possible when both are blocked. A storage error never prevents joining or turns a successful join into an error. With storage unavailable, keep the tab open. The UI distinguishes unsaved choices from confirmed faults and locks controls while waiting, paused or ended.

## Deployment boundary

This mode is intentionally built for **one persistent Node server with writable local storage**, matching the selected laptop setup. It is not a serverless or horizontally replicated backend. The API fails with an explanatory message on detected Vercel/AWS Lambda deployments rather than relying on an ephemeral filesystem. To move it to hosted serverless infrastructure later, replace the room store with a shared transactional database; the phone flow, room model and priority engine can stay.

The prepared product demo remains usable if venue networking fails. The only additional frontend package is `qrcode.react`, which generates QR codes locally without a QR service.

The temporary relay uses [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/). Cloudflare limits these to 200 simultaneous in-flight requests and does not provide an uptime guarantee. The app caps rooms at 120 participants and uses short polling with retries, not persistent SSE requests. For a larger or guaranteed-availability event, prepare a named tunnel separately and rehearse with the venue's actual connection; no application code can guarantee venue or mobile-provider connectivity.

## Verification

`npm test` includes session and API tests for 120 participants, concurrent assignments, token permissions, station validation, full fault combinations, aggregation, retry ordering, round reset, repair completion and presenter interruption. `npm run build` checks the production routes and TypeScript. Venue Wi-Fi capacity and camera scanning distance still need rehearsal with real phones.

The automatic connection path also has tests for local-origin validation, presenter-only startup, idempotent setup, public reachability proofs, outages, helper restarts and preserving a running presentation during a rebuild. A public-relay check on the presentation Mac on September 26, 2026 completed 120 simultaneous joins, 120 simultaneous fault submissions and 120 simultaneous phone polls with all HTTP 200 responses. The slowest join took 486 ms in that run. These were simulated HTTP clients; this does not establish venue Wi-Fi capacity or guarantee a provider's uptime.
