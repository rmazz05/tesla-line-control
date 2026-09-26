import { acknowledgeResponse, addHandoverNote, advanceSimulation, confirmContainment, confirmIncidentLocation, confirmProductContainment, createSimulation, focusSupervisorAction, recordInvestigationReturn, recordResponseUpdate, requestResponse, restartArea, startRepair, verifyResponse } from "../priority/engine";
import { createRandomSimulation, randomEvents } from "../priority/random-simulation";
import { DEMO_DECISION_MINUTE, simulationEvents } from "../priority/scenarios";
import { STATION_IDS } from "../priority/types";
import type { ManagerCommand, ManagerSnapshot, ManagerWorkspace } from "./types";

export class WorkspaceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function createWorkspace(now: number): ManagerWorkspace {
  return { revision: 0, run: 1, simulation: createSimulation("manual", true), settings: { seed: 1, duration: 60, meanInterval: 5 }, playing: false, speed: 30, lastTick: now, desktopSeenAt: 0, inspection: null, notice: null, commands: [] };
}

/** One wall clock, advanced by elapsed time, never once per connected device. */
export function tickWorkspace(workspace: ManagerWorkspace, now: number) {
  const elapsed = Math.max(0, now - workspace.lastTick);
  workspace.lastTick = now;
  if (!workspace.playing) return;
  if (elapsed > 60_000) {
    workspace.playing = false;
    workspace.notice = "Connection interrupted. Press Resume simulation to continue.";
    return;
  }
  let minutes = elapsed / 60_000 * workspace.speed;
  const state = workspace.simulation;
  // Only the explicitly selected rehearsal script has a presentation pause.
  if (state.scenario === "demo" && state.minute < DEMO_DECISION_MINUTE && state.minute + minutes >= DEMO_DECISION_MINUTE) {
    minutes = DEMO_DECISION_MINUTE - state.minute;
    workspace.playing = false;
  }
  workspace.simulation = advanceSimulation(state, minutes);
  const duration = state.scenario === "random" ? workspace.settings.duration : state.scenario === "shift" ? 40 : state.scenario === "demo" ? 24 : Infinity;
  if (workspace.simulation.minute >= duration && workspace.simulation.incidents.every(i => i.status === "resolved")) workspace.playing = false;
}

export function snapshot(workspace: ManagerWorkspace, now: number): ManagerSnapshot {
  return { revision: workspace.revision, run: workspace.run,
    // Future faults stay on the server, out of forecasts and phone payloads.
    simulation: { ...workspace.simulation, scheduledEvents: undefined },
    nextEventAt: simulationEvents(workspace.simulation).find(e => !workspace.simulation.injectedEventIds.includes(e.id))?.minute ?? null,
    settings: workspace.settings, playing: workspace.playing, speed: workspace.speed, inspection: workspace.inspection, notice: workspace.notice, desktopConnected: workspace.desktopSeenAt > 0 && now - workspace.desktopSeenAt < 15_000 };
}

export function applyCommand(workspace: ManagerWorkspace, command: Exclude<ManagerCommand, { type: "report" }>) {
  const s = workspace.simulation;
  switch (command.type) {
    case "play": workspace.playing = command.playing; workspace.notice = null; break;
    case "speed": workspace.speed = command.speed; break;
    case "step": workspace.playing = false; workspace.simulation = advanceSimulation(s, command.minutes); break;
    case "next": {
      workspace.playing = false;
      const count = s.incidents.length;
      while (workspace.simulation.incidents.length === count) {
        const current = workspace.simulation;
        const event = simulationEvents(current).find(e => !current.injectedEventIds.includes(e.id));
        if (!event) break;
        workspace.simulation = advanceSimulation(current, Math.max(.000001, event.minute - current.minute));
      }
      break;
    }
    case "reset":
      workspace.simulation = command.mode === "random" ? createRandomSimulation(command.settings) : createSimulation(command.mode, true);
      workspace.settings = command.settings;
      workspace.run++;
      workspace.playing = command.playing ?? false;
      workspace.inspection = null;
      workspace.notice = null;
      break;
    case "inspect":
      if (!s.incidents.some(i => i.id === command.incidentId)) throw new WorkspaceError("This incident is no longer in the current run.", 409);
      workspace.inspection = { sequence: (workspace.inspection?.sequence ?? 0) + 1, incidentId: command.incidentId };
      break;
    case "location": workspace.simulation = confirmIncidentLocation(s, command.incidentId, command.stationId, command.note); break;
    case "request": workspace.simulation = requestResponse(s, command.incidentId); break;
    case "contain": workspace.simulation = confirmContainment(s, command.incidentId); break;
    case "product-containment": workspace.simulation = confirmProductContainment(s, command.incidentId, command.confirmed); break;
    case "acknowledge": workspace.simulation = acknowledgeResponse(s, command.incidentId, command.owner); break;
    case "verify": workspace.simulation = verifyResponse(s, command.incidentId, command.confirmed, command.note); break;
    case "start-repair": workspace.simulation = startRepair(s, command.incidentId); break;
    case "update": workspace.simulation = recordResponseUpdate(s, command.incidentId, command.note, command.minutes); break;
    case "investigation": workspace.simulation = recordInvestigationReturn(s, command.incidentId, command.note); break;
    case "restart": workspace.simulation = restartArea(s, command.confirmed); break;
    case "focus": workspace.simulation = focusSupervisorAction(s, command.actionId); break;
    case "note": workspace.simulation = addHandoverNote(s, command.note); break;
  }
  if (["location", "request", "contain", "product-containment", "acknowledge", "verify", "start-repair", "update", "investigation", "restart", "focus", "note"].includes(command.type) && workspace.simulation === s) throw new WorkspaceError("This action is no longer available. Review the latest incident state and required checks.", 409);
}

/** Validate network inputs before they reach physical state or workflow functions. */
export function parseCommand(raw: unknown): ManagerCommand {
  if (!raw || typeof raw !== "object") throw new WorkspaceError("Missing workspace command.");
  const c = raw as Record<string, unknown>;
  const text = (key: string, min: number, max: number) => typeof c[key] === "string" && c[key].trim().length >= min && c[key].length <= max;
  const number = (key: string, min: number, max: number) => typeof c[key] === "number" && Number.isFinite(c[key]) && c[key] >= min && c[key] <= max;
  const incident = () => text("incidentId", 1, 120);
  let valid = false;
  switch (c.type) {
    case "request": case "contain": case "start-repair": case "inspect": valid = incident(); break;
    case "location": valid = incident() && STATION_IDS.includes(c.stationId as typeof STATION_IDS[number]) && text("note", 5, 600); break;
    case "product-containment": valid = incident() && c.confirmed === true; break;
    case "acknowledge": valid = incident() && text("owner", 2, 80); break;
    case "verify": valid = incident() && c.confirmed === true && text("note", 5, 600); break;
    case "update": valid = incident() && text("note", 5, 600) && number("minutes", 1, 30); break;
    case "investigation": valid = incident() && text("note", 5, 600); break;
    case "restart": valid = c.confirmed === true; break;
    case "focus": valid = text("actionId", 1, 160); break;
    case "note": valid = text("note", 5, 1200); break;
    case "play": valid = typeof c.playing === "boolean"; break;
    case "speed": valid = [1, 10, 30, 60].includes(Number(c.speed)) && typeof c.speed === "number"; break;
    case "step": valid = number("minutes", .01, 120); break;
    case "next": valid = true; break;
    case "report": valid = text("report", 5, 2400) && (c.stationId === null || STATION_IDS.includes(c.stationId as typeof STATION_IDS[number])); break;
    case "reset":
      if (["random", "shift", "demo", "manual"].includes(String(c.mode)) && c.settings && typeof c.settings === "object" && (c.playing === undefined || typeof c.playing === "boolean")) {
        try { randomEvents(c.settings as ManagerWorkspace["settings"]); valid = true; } catch { /* invalid bounds */ }
      }
      break;
  }
  if (!valid) throw new WorkspaceError("Invalid workspace command or settings.");
  return c as unknown as ManagerCommand;
}
