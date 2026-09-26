import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIENCE_FAULTS, MAX_PARTICIPANTS } from "../src/lib/audience/catalog";
import { createRoom, hostAction, joinRoom, roomSnapshot, selectFaults, tickRoom, toggleFault } from "../src/lib/audience/session";
import { getRankedIncidents } from "../src/lib/priority/engine";

const now = 100_000;
function setup(count = 1) {
  const room = createRoom("ABCDEF", "host", now);
  for (let i = 0; i < count; i++) joinRoom(room, `token-${i}`, `Person ${i}`, now, () => 0);
  return room;
}
function start(room: ReturnType<typeof setup>) { hostAction(room, "start", undefined, "start", now); }

test("every participant has a distinct machine, with balanced station assignments", () => {
  const room = setup(MAX_PARTICIPANTS);
  assert.equal(new Set(room.participants.map(person => person.machine)).size, MAX_PARTICIPANTS);
  assert.equal(new Set(room.participants.map(person => person.id)).size, MAX_PARTICIPANTS);
  for (const station of new Set(room.participants.map(person => person.stationId))) assert.equal(room.participants.filter(person => person.stationId === station).length, 15);
  assert.throws(() => joinRoom(room, "overflow", "More", now), /120/);
});
test("joining again recovers the same machine, even when the room is full", () => {
  const room = setup(MAX_PARTICIPANTS);
  assert.equal(joinRoom(room, "token-0", "Changed name", now + 100).id, "M001");
  assert.equal(room.participants.length, MAX_PARTICIPANTS);
});
test("participant names preserve complete Unicode characters", () => {
  const room = createRoom("ABCDEF", "host", now);
  const name = `${"A".repeat(23)}🚗`;
  const person = joinRoom(room, "unicode-token", name, now, () => 0);
  assert.equal(person.name, name);
  assert.equal(Array.from(person.name).length, 24);
  assert.ok(!person.name.includes("�"));
});
test("lobby and paused inputs are locked", () => {
  const room = setup();
  assert.throws(() => selectFaults(room, "token-0", ["body-supply"], 1, 1, now), /start or resume/);
  start(room);
  hostAction(room, "pause", undefined, "pause", now);
  assert.throws(() => selectFaults(room, "token-0", ["body-supply"], 1, 1, now), /start or resume/);
});
test("the selected faults use existing policy and never inject prepared incidents", () => {
  const room = setup(8); start(room);
  selectFaults(room, "token-0", ["body-supply"], 1, 1, now);
  selectFaults(room, "token-3", ["battery-guard"], 1, 1, now);
  assert.equal(getRankedIncidents(room.simulation)[0].incident.assessment.stationId, "GA-28");
  for (let i = 1; i <= 240; i++) tickRoom(room, now + i * 1000);
  assert.equal(room.simulation.incidents.length, 2);
  assert.ok(room.simulation.minute > 39);
});
test("repeated reports aggregate; one person clearing does not erase another fault", () => {
  const room = setup(9); start(room);
  selectFaults(room, "token-0", ["body-supply", "body-drive"], 1, 1, now);
  selectFaults(room, "token-8", ["body-supply"], 1, 1, now);
  assert.equal(room.simulation.incidents.length, 2);
  selectFaults(room, "token-0", [], 2, 1, now);
  assert.equal(room.simulation.incidents.filter(item => item.status === "open").length, 1);
  selectFaults(room, "token-8", [], 2, 1, now);
  assert.equal(room.simulation.incidents.filter(item => item.status !== "resolved").length, 0);
});
test("late or duplicated input cannot overwrite a newer selection", () => {
  const room = setup(); start(room);
  selectFaults(room, "token-0", ["body-drive"], 2, 1, now);
  selectFaults(room, "token-0", ["body-supply"], 1, 1, now);
  selectFaults(room, "token-0", ["body-drive"], 2, 1, now);
  assert.deepEqual(room.participants[0].faults, ["body-drive"]);
  assert.equal(room.simulation.incidents.length, 1);
});
test("participants cannot submit faults for another station or impersonate another token", () => {
  const room = setup(); start(room);
  assert.throws(() => selectFaults(room, "token-0", ["battery-guard"], 1, 1, now), /belonging/);
  assert.throws(() => selectFaults(room, "unknown", ["body-drive"], 1, 1, now), /Rejoin/);
});
test("reset removes assignments and requires participants to rejoin", () => {
  const room = setup(); start(room);
  selectFaults(room, "token-0", ["body-drive"], 1, 1, now);
  hostAction(room, "reset", undefined, "reset1", now);
  hostAction(room, "reset", undefined, "reset1", now);
  assert.equal(room.round, 2);
  assert.equal(room.participants.length, 0);
  assert.equal(roomSnapshot(room, "token-0", now).me, null);
  assert.equal(room.simulation.incidents.length, 0);
  assert.throws(() => selectFaults(room, "token-0", ["body-drive"], 2, 1, now), /could not be found/);
  assert.equal(joinRoom(room, "token-0", "Ada", now).id, "M001");
});
test("maintenance completion clears matching switches on every reporting phone", () => {
  const room = setup(9); start(room);
  for (const token of ["token-0", "token-8"]) selectFaults(room, token, ["body-drive"], 1, 1, now);
  const incidentId = room.faultIncidents["body-drive"];
  hostAction(room, "repair", incidentId, "repair1", now);
  assert.equal(room.simulation.incidents[0].status, "repairing");
  for (let i = 1; i <= 40; i++) tickRoom(room, now + i * 1000);
  assert.equal(room.simulation.incidents[0].status, "resolved");
  assert.ok(room.participants.every(person => !person.faults.length));
});
test("a presenter outage pauses the round without advancing unobserved time", () => {
  const room = setup(); start(room);
  tickRoom(room, now + 60_000);
  assert.equal(room.phase, "paused");
  assert.equal(room.simulation.minute, 0);
});
test("public snapshots never expose access tokens or the other participants to a phone", () => {
  const room = setup(2);
  const phone = roomSnapshot(room, "token-0", now);
  assert.equal(phone.me?.id, "M001");
  assert.deepEqual(phone.participants, []);
  assert.ok(!JSON.stringify(roomSnapshot(room, "host", now)).includes("token-"));
  assert.ok(!JSON.stringify(phone).includes("hostToken"));
});
test("all 24 fault options can run together without creating duplicate incidents", () => {
  const room = setup(8); start(room);
  room.participants.forEach(person => selectFaults(room, person.token, AUDIENCE_FAULTS.filter(fault => fault.stationId === person.stationId).map(fault => fault.id), 1, 1, now));
  assert.equal(room.simulation.incidents.length, 24);
  assert.equal(getRankedIncidents(room.simulation).length, 24);
  assert.ok(getRankedIncidents(room.simulation).every(item => Number.isFinite(item.rank)));
});

test("assignment samples every available station and keeps an even crowd distribution", () => {
  const room = createRoom("ABCDEF", "host", now);
  const choices: number[] = [];
  for (let i = 0; i < 120; i++) {
    const person = joinRoom(room, `random-${i}`, `Person ${i}`, now, size => { choices.push(size); return size - 1; });
    assert.equal(joinRoom(room, person.token, person.name, now).stationId, person.stationId);
    const counts = new Map<string, number>();
    for (const participant of room.participants) counts.set(participant.stationId, (counts.get(participant.stationId) ?? 0) + 1);
    assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
  }
  assert.equal(room.participants[0].stationId, "EOL-45");
  assert.deepEqual(choices.slice(0, 8), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(new Set(room.participants.map(person => person.machine)).size, 120);
});
test("all selectable combinations describe separate components and produce independent incidents", () => {
  for (const stationId of new Set(AUDIENCE_FAULTS.map(fault => fault.stationId))) {
    const options = AUDIENCE_FAULTS.filter(fault => fault.stationId === stationId);
    assert.equal(new Set(options.map(fault => fault.component)).size, 3);
    for (let mask = 0; mask < 8; mask++) {
      const room = setup(8); start(room);
      const person = room.participants.find(person => person.stationId === stationId)!;
      const selected = options.filter((_, i) => mask & (1 << i));
      for (const [i, fault] of selected.entries()) toggleFault(room, person.token, fault.id, true, `choose-${i}`, 1, i, now);
      assert.deepEqual(person.faults, selected.map(fault => fault.id));
      assert.equal(room.simulation.incidents.filter(item => item.status !== "resolved").length, selected.length);
    }
  }
});
test("lost switch responses can be retried after repair without resurrecting a fault", () => {
  const room = setup(); start(room);
  toggleFault(room, "token-0", "body-drive", true, "lost-response", 1, 0, now);
  hostAction(room, "finish", room.faultIncidents["body-drive"], "finish", now);
  toggleFault(room, "token-0", "body-drive", true, "lost-response", 1, 0, now);
  assert.deepEqual(room.participants[0].faults, []);
  assert.equal(room.participants[0].faultVersion, 2);
  assert.throws(() => toggleFault(room, "token-0", "body-supply", true, "queued-before-repair", 1, 1, now), /machine was updated/);
  toggleFault(room, "token-0", "body-supply", true, "after-refresh", 1, 2, now);
  assert.deepEqual(room.participants[0].faults, ["body-supply"]);
});
test("rapid switch changes are ordered and reset rejects a previous round outbox", () => {
  const room = setup(); start(room);
  toggleFault(room, "token-0", "body-drive", true, "a", 1, 0, now);
  toggleFault(room, "token-0", "body-supply", true, "b", 1, 1, now);
  toggleFault(room, "token-0", "body-drive", false, "c", 1, 2, now);
  toggleFault(room, "token-0", "body-drive", true, "a", 1, 0, now);
  assert.deepEqual(room.participants[0].faults, ["body-supply"]);
  hostAction(room, "reset", undefined, "reset", now);
  assert.throws(() => toggleFault(room, "token-0", "body-slow", true, "d", 1, 3, now), /could not be found/);
  assert.equal(room.participants.length, 0);
});
test("saved rooms from before fault versions were added remain joinable", () => {
  const room = setup(); start(room);
  Reflect.deleteProperty(room.participants[0], "faultVersion");
  Reflect.deleteProperty(room.participants[0], "faultCommands");
  assert.equal(roomSnapshot(room, "token-0", now).me?.faultVersion, 0);
  toggleFault(room, "token-0", "body-drive", true, "first-new-client-change", 1, 0, now);
  assert.equal(room.participants[0].faultVersion, 1);
});
