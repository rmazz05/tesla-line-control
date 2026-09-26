import type { RankedIncident, SimulationState, StationId, StationReading } from "../priority/types";

export type Phase = "lobby" | "live" | "paused" | "ended";
export type Participant = {
  id: string; token: string; name: string; machine: string; stationId: StationId;
  faults: string[]; sequence: number; lastSeen: number;
  faultVersion: number; faultCommands: string[];
};
export type PublicParticipant = Omit<Participant, "token" | "faultCommands">;
export type AudienceRoom = {
  code: string; hostToken: string; createdAt: number; updatedAt: number; revision: number;
  phase: Phase; round: number; lastTick: number; message: string;
  participants: Participant[]; simulation: SimulationState; eventNumber: number;
  faultIncidents: Record<string, string>; commands: string[];
};
export type RoomSnapshot = {
  code: string; revision: number; phase: Phase; round: number; now: number; message: string;
  participants: PublicParticipant[]; me: PublicParticipant | null;
  minute: number; ranking: RankedIncident[]; readings: StationReading[];
};
export type HostAction = "start" | "pause" | "reset" | "end" | "repair" | "contain" | "finish";
