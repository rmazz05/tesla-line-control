import { addIncident, advanceSimulation, confirmContainment, createSimulation, getRankedIncidents, getStationReadings, resolveIncident, startRepair } from "../priority/engine";
import { randomInt } from "node:crypto";
import { scenarioEvents } from "../priority/scenarios";
import { STATION_IDS } from "../priority/types";
import { AUDIENCE_FAULTS, DEMO_SPEED, MAX_PARTICIPANTS } from "./catalog";
import type { AudienceRoom, HostAction, Participant, RoomSnapshot } from "./types";

export class DemoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function freshSimulation() {
  // The product's prepared timeline never runs in an audience session.
  // The shift constructor already injects its minute-zero event, so clear that
  // event too and use a fresh object to avoid its cached ranking.
  return { ...createSimulation("shift"), incidents: [], previousOrder: [], rankChanges: [], injectedEventIds: scenarioEvents("shift").map(event => event.id) };
}
export function createRoom(code: string, hostToken: string, now: number): AudienceRoom {
  return { code, hostToken, createdAt: now, updatedAt: now, revision: 0, phase: "lobby", round: 1, lastTick: now,
    message: "Waiting for the audience to join.", participants: [], simulation: freshSimulation(), eventNumber: 0, faultIncidents: {}, commands: [] };
}
export function joinRoom(room: AudienceRoom, token: string, name: string, now: number, chooseIndex: (size: number) => number = randomInt): Participant {
  const existing = room.participants.find(person => person.token === token);
  if (existing) { existing.lastSeen = now; return existing; }
  if (room.phase === "ended") throw new DemoError("This demo has ended. Ask the presenter to start a new round.", 409);
  if (room.participants.length >= MAX_PARTICIPANTS) throw new DemoError("All 120 machines are assigned. Follow the demo on the main screen.", 409);
  const normalized = name.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  const cleaned = Array.from(normalized).slice(0, 24).join("");
  if (!cleaned) throw new DemoError("Enter a name to claim your machine.");
  const index = room.participants.length;
  const counts = STATION_IDS.map(id => room.participants.filter(person => person.stationId === id).length);
  const minimum = Math.min(...counts);
  const available = STATION_IDS.filter((_, position) => counts[position] === minimum);
  // Random among the least occupied stations: fill the line before reusing a role.
  // The room's write lock makes simultaneous joins claim different machine slots.
  const stationId = available[chooseIndex(available.length)];
  const person: Participant = { id: `M${String(index + 1).padStart(3, "0")}`, machine: `${stationId} · ${String(minimum + 1).padStart(2, "0")}`, stationId, name: cleaned, token, faults: [], sequence: 0, faultVersion: 0, faultCommands: [], lastSeen: now };
  room.participants.push(person);
  room.message = `${cleaned} joined as machine ${person.id} at ${stationId}.`;
  return person;
}
function reconcile(room: AudienceRoom) {
  for (const fault of AUDIENCE_FAULTS) {
    const reporters = room.participants.filter(person => person.faults.includes(fault.id));
    const incidentId = room.faultIncidents[fault.id];
    const incident = room.simulation.incidents.find(item => item.id === incidentId);
    if (reporters.length && (!incident || incident.status === "resolved")) {
      const id = `AUD-${room.round}-${++room.eventNumber}`;
      room.faultIncidents[fault.id] = id;
      room.simulation = addIncident(room.simulation, fault.assessment, `Audience simulation: ${fault.label} at ${fault.stationId}. Repeated reports represent one station fault.`, id);
    } else if (!reporters.length && incident && incident.status !== "resolved") {
      room.simulation = resolveIncident(room.simulation, incident.id);
      const resolved = room.simulation.incidents.find(item => item.id === incident.id)!;
      resolved.history[resolved.history.length - 1].text = "All participants cleared this synthetic fault. This is a demo withdrawal, not a verified real repair.";
    }
  }
  // A long rehearsal must not grow every poll response and ranking indefinitely.
  room.simulation.incidents = room.simulation.incidents.filter(item => item.status !== "resolved").concat(room.simulation.incidents.filter(item => item.status === "resolved").slice(-24));
  room.simulation.rankChanges = room.simulation.rankChanges.slice(-100);
  room.simulation.teams = room.simulation.teams.filter(team => team.assignedIncidentId !== null);
}
export function selectFaults(room: AudienceRoom, token: string, faults: string[], sequence: number, round: number, now: number) {
  const person = room.participants.find(item => item.token === token);
  if (!person) throw new DemoError("Your machine could not be found. Rejoin the demo.", 401);
  if (round !== room.round) throw new DemoError("A new round has started. Your switches have been reset.", 409);
  if (sequence <= person.sequence) return; // A retry cannot undo newer input.
  if (room.phase !== "live") throw new DemoError("Wait for the presenter to start or resume the demo.", 409);
  const allowed = AUDIENCE_FAULTS.filter(fault => fault.stationId === person.stationId).map(fault => fault.id);
  if (faults.length > 3 || faults.some(id => !allowed.includes(id))) throw new DemoError("Choose only faults belonging to your machine.");
  person.faults = [...new Set(faults)];
  person.sequence = sequence;
  person.faultVersion = (person.faultVersion ?? 0) + 1;
  person.lastSeen = now;
  reconcile(room);
  room.message = `${person.name} updated ${person.id}: ${person.faults.length ? person.faults.map(id => AUDIENCE_FAULTS.find(fault => fault.id === id)!.label).join("; ") : "all faults cleared"}.`;
}
export function toggleFault(room: AudienceRoom, token: string, faultId: string, active: boolean, requestId: string, round: number, version: number, now: number) {
  const person = room.participants.find(item => item.token === token);
  if (!person) throw new DemoError("Your machine could not be found. Rejoin the demo.", 401);
  if (round !== room.round) throw new DemoError("A new round has started. Your switches have been reset.", 409);
  // A lost response can be retried even after a repair or pause, without replaying it.
  if (person.faultCommands?.includes(requestId)) return;
  if (room.phase !== "live") throw new DemoError("The presenter paused or ended the round. Unsent changes were cleared.", 409);
  if (!AUDIENCE_FAULTS.some(fault => fault.id === faultId && fault.stationId === person.stationId)) throw new DemoError("Choose only faults belonging to your machine.");
  if (version !== (person.faultVersion ?? 0)) throw new DemoError("Your machine was updated. Check its current faults before choosing again.", 409);
  person.faults = active ? [...new Set([...person.faults, faultId])] : person.faults.filter(id => id !== faultId);
  person.faultVersion = (person.faultVersion ?? 0) + 1;
  person.faultCommands = [...(person.faultCommands ?? []).slice(-99), requestId];
  person.lastSeen = now;
  reconcile(room);
  room.message = `${person.name} ${active ? "reported" : "cleared"} ${AUDIENCE_FAULTS.find(fault => fault.id === faultId)!.label} on ${person.id}.`;
}
function clearCompletedFaults(room: AudienceRoom) {
  for (const [faultId, incidentId] of Object.entries(room.faultIncidents)) {
    if (room.simulation.incidents.find(item => item.id === incidentId)?.status !== "resolved") continue;
    for (const person of room.participants) {
      if (!person.faults.includes(faultId)) continue;
      person.faults = person.faults.filter(id => id !== faultId);
      person.faultVersion = (person.faultVersion ?? 0) + 1;
    }
  }
}
export function tickRoom(room: AudienceRoom, now: number) {
  const elapsed = Math.max(0, now - room.lastTick);
  if (room.phase === "live" && elapsed > 15_000) {
    room.phase = "paused";
    room.message = "Presenter connection interrupted. The round is paused; resume when ready.";
  } else if (room.phase === "live" && elapsed >= 500) {
    room.simulation = advanceSimulation(room.simulation, elapsed / 60_000 * DEMO_SPEED);
    clearCompletedFaults(room);
  }
  if (elapsed >= 500 || room.phase !== "live") room.lastTick = now;
}
export function hostAction(room: AudienceRoom, action: HostAction, incidentId: string | undefined, requestId: string, now: number) {
  if (room.commands.includes(requestId)) return;
  if (action === "start") {
    if (room.phase !== "lobby" && room.phase !== "paused") throw new DemoError("This round cannot be started. Reset it first.", 409);
    room.phase = "live";
    room.lastTick = now;
    room.message = "The audience is in control. Select faults on your phone.";
  } else if (action === "pause") {
    if (room.phase === "live") room.phase = "paused";
    room.message = "Inputs and simulation paused for discussion.";
  } else if (action === "reset") {
    room.phase = "lobby";
    room.round += 1;
    room.lastTick = now;
    room.simulation = freshSimulation();
    room.faultIncidents = {};
    room.participants = [];
    room.message = "New round ready. Audience machines cleared.";
  } else if (action === "end") {
    room.phase = "ended";
    room.message = "Demo ended. Thanks for running the factory.";
  } else {
    if (room.phase !== "live" && room.phase !== "paused") throw new DemoError("Start the round before responding to incidents.", 409);
    const incident = room.simulation.incidents.find(item => item.id === incidentId && item.status !== "resolved");
    if (!incident) throw new DemoError("This incident is already cleared. The queue has been refreshed.", 409);
    if (action === "repair") room.simulation = startRepair(room.simulation, incident.id);
    else if (action === "contain") room.simulation = confirmContainment(room.simulation, incident.id);
    else if (action === "finish") { room.simulation = resolveIncident(room.simulation, incident.id); clearCompletedFaults(room); }
    else throw new DemoError("Unknown presenter action.");
    room.message = action === "repair" ? `Maintenance dispatched to ${incident.assessment.stationId}.` : action === "contain" ? `Containment confirmed at ${incident.assessment.stationId}.` : `Repair completed at ${incident.assessment.stationId}.`;
  }
  room.commands = [...room.commands.slice(-99), requestId];
}
export function roomSnapshot(room: AudienceRoom, token: string, now: number): RoomSnapshot {
  const host = token === room.hostToken;
  const publicPeople = room.participants.map(person => ({ id: person.id, name: person.name, machine: person.machine, stationId: person.stationId, faults: person.faults, sequence: person.sequence, faultVersion: person.faultVersion ?? 0, lastSeen: person.lastSeen }));
  const me = room.participants.find(person => person.token === token);
  return { code: room.code, revision: room.revision, phase: room.phase, round: room.round, now, message: room.message,
    participants: host ? publicPeople : [], me: me ? publicPeople.find(person => person.id === me.id)! : null,
    minute: room.simulation.minute, ranking: host ? getRankedIncidents(room.simulation).filter(item => item.incident.status !== "resolved") : [],
    readings: host ? getStationReadings(room.simulation) : [] };
}
