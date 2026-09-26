import type { RandomSettings } from "../priority/random-simulation";
import type { SimulationState, StationId } from "../priority/types";

export type SupervisorCommand =
  | { type: "location"; incidentId: string; stationId: string; note: string }
  | { type: "request" | "contain" | "start-repair"; incidentId: string }
  | { type: "product-containment"; incidentId: string; confirmed: boolean }
  | { type: "acknowledge"; incidentId: string; owner: string }
  | { type: "verify"; incidentId: string; confirmed: boolean; note: string }
  | { type: "update"; incidentId: string; note: string; minutes: number }
  | { type: "investigation"; incidentId: string; note: string }
  | { type: "restart"; confirmed: boolean }
  | { type: "focus"; actionId: string }
  | { type: "note"; note: string };
export type ManagerCommand = SupervisorCommand
  | { type: "play"; playing: boolean }
  | { type: "speed"; speed: number }
  | { type: "step"; minutes: number }
  | { type: "next" }
  | { type: "reset"; mode: "random" | "shift" | "demo" | "manual"; settings: RandomSettings; playing?: boolean }
  | { type: "inspect"; incidentId: string }
  | { type: "report"; report: string; stationId: StationId | null };

export interface ManagerWorkspace {
  revision: number;
  run: number;
  simulation: SimulationState;
  settings: RandomSettings;
  playing: boolean;
  speed: number;
  lastTick: number;
  desktopSeenAt: number;
  inspection: { sequence: number; incidentId: string } | null;
  notice: string | null;
  commands: string[];
}
export type ManagerSnapshot = Omit<ManagerWorkspace, "commands" | "lastTick" | "desktopSeenAt"> & { desktopConnected: boolean; nextEventAt: number | null };
