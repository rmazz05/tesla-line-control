import type { StationId } from "./types";

/** All physical quantities below are authored demo assumptions, not factory data. */
export const STATIONS: { id: StationId; name: string; bufferCapacity: number; initialBuffer: number; ratePerMinute: number }[] = [
  { id: "GA-12", name: "Painted body load", bufferCapacity: 24, initialBuffer: 20, ratePerMinute: 1 },
  { id: "GA-18", name: "Cockpit install", bufferCapacity: 6, initialBuffer: 4, ratePerMinute: 1 },
  { id: "GA-24", name: "Glass fitting robot", bufferCapacity: 6, initialBuffer: 3, ratePerMinute: 1 },
  { id: "GA-28", name: "Battery marriage", bufferCapacity: 5, initialBuffer: 3, ratePerMinute: 1 },
  { id: "GA-32", name: "Wheel and torque", bufferCapacity: 6, initialBuffer: 4, ratePerMinute: 1 },
  { id: "GA-36", name: "Fluid fill", bufferCapacity: 5, initialBuffer: 3, ratePerMinute: 1 },
  { id: "EOL-41", name: "Roller test", bufferCapacity: 4, initialBuffer: 2, ratePerMinute: 1 },
  { id: "EOL-45", name: "Final quality gate", bufferCapacity: 3, initialBuffer: 1, ratePerMinute: 1 },
];

export const SIMULATION_MINUTES = 40;
export const LOOKAHEAD_MINUTES = 30;
export const FLOW_STEP_MINUTES = 0.25;
