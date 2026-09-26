import assert from "node:assert/strict";
import { test } from "node:test";
import { addIncident, advanceSimulation, createSimulation, getRankedIncidents, getStationReadings } from "../src/lib/priority/engine";
import { CATALOG } from "../src/lib/priority/catalog";
import { createRandomSimulation, randomEvents } from "../src/lib/priority/random-simulation";
import { applyCommand, createWorkspace, parseCommand, snapshot, tickWorkspace } from "../src/lib/manager/session";

const settings = { seed: 2026, duration: 60, meanInterval: 5 };

test("random runs have repeatable seeds, different arrivals, bounded catalog faults, and no opening script", () => {
  const first = randomEvents(settings);
  assert.deepEqual(first, randomEvents(settings));
  assert.notDeepEqual(first, randomEvents({ ...settings, seed: 2027 }));
  assert.ok(first.length > 2);
  assert.ok(first.every(event => event.assessment.stationId !== null && !event.reportText.startsWith("null:")));
  assert.ok(new Set(first.map(e => e.assessment.catalogId)).size > 2);
  assert.ok(first.every((event, index) => event.minute > (first[index - 1]?.minute ?? 0) && event.minute <= settings.duration));
  assert.ok(first.every(event => CATALOG.some(entry => entry.id === event.assessment.catalogId && entry.assessment.stationId === event.assessment.stationId)));
  const initial = createRandomSimulation(settings);
  assert.equal(initial.incidents.length, 0);
  assert.equal(advanceSimulation(initial, first[0].minute - .01).incidents.length, 0);
  const arrived = advanceSimulation(initial, first[0].minute);
  assert.equal(arrived.incidents.length, 1);
  assert.equal(arrived.incidents[0].reportedAtMinute, first[0].minute);
  assert.deepEqual(getRankedIncidents(arrived), getRankedIncidents({ ...arrived, scheduledEvents: [] }), "future faults must not affect current decisions");
  const busy = advanceSimulation(createRandomSimulation({ ...settings, meanInterval: 1 }), 60);
  assert.equal(new Set(busy.incidents.map(i => i.assessment.catalogId)).size, busy.incidents.length, "outstanding faults are not duplicated");
  assert.ok(busy.injectedEventIds.length > busy.incidents.length);
});

test("one server clock advances once across devices, pauses explicitly, and does not stop after the first arrival", () => {
  const room = createWorkspace(1000);
  assert.equal(room.simulation.scenario, "manual");
  assert.equal(advanceSimulation(room.simulation, 40).incidents.length, 0);
  applyCommand(room, { type: "reset", mode: "random", settings });
  applyCommand(room, { type: "play", playing: true });
  tickWorkspace(room, 3000);
  const minute = room.simulation.minute;
  assert.equal(minute, 1);
  tickWorkspace(room, 3000); // second device, same wall time
  assert.equal(room.simulation.minute, minute);
  tickWorkspace(room, 11_000);
  assert.equal(room.playing, true);
  assert.equal(room.simulation.minute, 5);
  applyCommand(room, { type: "play", playing: false });
  tickWorkspace(room, 20_000);
  assert.equal(room.simulation.minute, 5);
  applyCommand(room, { type: "play", playing: true });
  tickWorkspace(room, 90_001);
  assert.equal(room.playing, false);
  assert.equal(room.simulation.minute, 5);
  assert.match(room.notice!, /Resume simulation/);
});

test("inspection preserves the running factory and queues for a reconnecting desktop", () => {
  const room = createWorkspace(1000);
  const a = CATALOG.find(c => c.id === "body-feed-interruption")!.assessment;
  room.simulation = addIncident(room.simulation, a, "Body feed stopped", "body");
  applyCommand(room, { type: "play", playing: true });
  applyCommand(room, { type: "inspect", incidentId: "body" });
  assert.equal(room.playing, true);
  assert.equal(snapshot(room, 2000).desktopConnected, false);
  room.desktopSeenAt = 2000;
  assert.equal(snapshot(room, 3000).desktopConnected, true);
  assert.equal(snapshot(room, 18_000).desktopConnected, false);
  assert.equal(room.inspection?.incidentId, "body");
  const serialized = JSON.parse(JSON.stringify(room));
  assert.equal(snapshot(serialized, 19_000).inspection?.incidentId, "body");
  applyCommand(room, { type: "inspect", incidentId: "body" });
  assert.equal(room.inspection?.sequence, 2);
});

test("supervisor decisions change simulated flow and returned repairs require verification", () => {
  const room = createWorkspace(1000);
  const a = CATALOG.find(c => c.id === "body-feed-interruption")!.assessment;
  room.simulation = addIncident(createSimulation("manual", true), a, "Body feed stopped", "body");
  const ignored = advanceSimulation(room.simulation, 60);
  applyCommand(room, { type: "request", incidentId: "body" });
  applyCommand(room, { type: "step", minutes: 1 });
  assert.equal(room.simulation.incidents[0].status, "open");
  applyCommand(room, { type: "acknowledge", incidentId: "body", owner: "Sam" });
  applyCommand(room, { type: "step", minutes: 10 });
  assert.equal(room.simulation.incidents[0].status, "repairing");
  assert.notEqual(room.simulation.incidents[0].response?.readyAt, null);
  assert.throws(() => applyCommand(room, { type: "verify", incidentId: "body", confirmed: false, note: "Inspected feed" }));
  applyCommand(room, { type: "verify", incidentId: "body", confirmed: true, note: "Feed restored; transfer checks passed." });
  room.simulation = advanceSimulation(room.simulation, 60 - room.simulation.minute);
  assert.equal(room.simulation.incidents[0].status, "resolved");
  assert.ok(room.simulation.producedUnits > ignored.producedUnits);
  assert.equal(getStationReadings(room.simulation).at(-1)?.state, "running");
});

test("network commands reject fabricated types and unbounded settings", () => {
  for (const command of [{ type: "unknown" }, { type: "step", minutes: Infinity }, { type: "reset", mode: "random", settings: { ...settings, meanInterval: 0 } }, { type: "acknowledge", incidentId: "body", owner: 4 }, { type: "verify", incidentId: "body", note: "looks fixed", confirmed: false }]) assert.throws(() => parseCommand(command));
});

test("Next event skips outstanding duplicates and replay starts a clean, paused shared run", () => {
  const room = createWorkspace(1000);
  const events = randomEvents({ ...settings, meanInterval: 1 });
  room.simulation = { ...createSimulation("random", true), scheduledEvents: [
    { ...events[0], id: "first", minute: 1 },
    { ...events[0], id: "duplicate", minute: 2 },
    { ...events.find(e => e.assessment.catalogId !== events[0].assessment.catalogId)!, id: "different", minute: 3 },
  ] };
  applyCommand(room, { type: "next" });
  assert.equal(room.simulation.incidents.length, 1);
  applyCommand(room, { type: "next" });
  assert.equal(room.simulation.incidents.length, 2);
  assert.equal(room.simulation.minute, 3);
  assert.deepEqual(room.simulation.injectedEventIds, ["first", "duplicate", "different"]);
  applyCommand(room, { type: "play", playing: true });
  applyCommand(room, { type: "inspect", incidentId: "first" });
  applyCommand(room, { type: "reset", mode: "random", settings });
  assert.equal(room.playing, false);
  assert.equal(room.inspection, null);
  assert.equal(room.simulation.minute, 0);
  assert.equal(room.simulation.incidents.length, 0);
  assert.deepEqual(room.simulation.scheduledEvents, randomEvents(settings));
});

test("one-click simulation starts the shift atomically and pause/resume preserves its incidents", () => {
  const room = createWorkspace(1000);
  const start = parseCommand({ type: "reset", mode: "shift", settings, playing: true });
  assert.equal(start.type, "reset");
  applyCommand(room, start as Extract<typeof start, { type: "reset" }>);
  assert.equal(room.playing, true);
  assert.equal(room.simulation.scenario, "shift");
  assert.equal(room.run, 2);
  tickWorkspace(room, 5000);
  assert.ok(room.simulation.incidents.length >= 2);
  const incidents = room.simulation.incidents.map(i => i.id);
  const minute = room.simulation.minute;
  applyCommand(room, { type: "play", playing: false });
  tickWorkspace(room, 9000);
  assert.equal(room.simulation.minute, minute);
  applyCommand(room, { type: "play", playing: true });
  tickWorkspace(room, 11_000);
  assert.ok(room.simulation.minute > minute);
  assert.deepEqual(room.simulation.incidents.slice(0, incidents.length).map(i => i.id), incidents);
  assert.equal(room.run, 2);
  applyCommand(room, { type: "reset", mode: "shift", settings, playing: true });
  assert.equal(room.run, 3);
  assert.equal(room.simulation.minute, 0);
  assert.equal(room.playing, true);
});

test("reset autoplay accepts only booleans and preserves paused resets by default", () => {
  for (const playing of ["true", 1, null, {}]) {
    assert.throws(() => parseCommand({ type: "reset", mode: "shift", settings, playing }));
  }
  const room = createWorkspace(1000);
  applyCommand(room, { type: "reset", mode: "shift", settings });
  assert.equal(room.playing, false);
});
