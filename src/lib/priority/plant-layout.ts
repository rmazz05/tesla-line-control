import type { StationId, StationReading } from "./types";
import { getStationEffect } from "./station-effect";

export type PlantScope = "plant" | "line" | "focus";
export type Point3 = [number, number, number];

/** Metres. +X east, +Z south, +Y up. GA northwest corner is the origin.
 * Dimensions/grid: drawing BER-GF-SW-GA-1F-DR-A-TSLA-240-00, 10 May 2023.
 * Campus adjacency/proportions: application p15. Heights and equipment are inferred.
 * This is a dated planning reconstruction, not a surveyed/as-built digital twin. */
export const GA_WIDTH = 310.44;
export const GA_DEPTH = 252;
export const GRID_BAY = 14;
export const GA_OUTLINE: [number, number][] = [[0, 0], [GA_WIDTH, 0], [GA_WIDTH, GA_DEPTH], [64, GA_DEPTH], [0, 196]];
export const PLANT_SOURCE = {
  date: "2023 planning baseline",
  plan: "https://drive.google.com/file/d/1s_3jSLxdN83wCtIuy-NyzuMkezHUcVKm/view",
  site: "https://drive.google.com/file/d/1FrR1dzas3lmkxS5zK18b1JxdlSVyhJcI/view",
  record: "https://www.uvp-verbund.de/trefferanzeige?docuuid=250677b6-a8f4-4850-a126-7d3ff82103ba",
};
export const PLANT_BUILDINGS = [
  { id: "press", name: "Stamping", x: 0, z: -438, width: 186, depth: 90, height: 22 },
  { id: "body", name: "Body in white", x: 0, z: -348, width: 186, depth: 348, height: 19 },
  { id: "paint", name: "Paint", x: 186, z: -438, width: 124.44, depth: 304, height: 25 },
  { id: "casting", name: "Casting", x: 186, z: -134, width: 124.44, depth: 134, height: 22 },
  { id: "cell", name: "Battery cells", x: 470, z: -255, width: 166, depth: 198, height: 17 },
  { id: "drive", name: "Drive unit", x: 470, z: -57, width: 166, depth: 177, height: 16 },
  { id: "utilities", name: "Utilities", x: 374, z: -67, width: 50, depth: 94, height: 13 },
] as const;

// The demo route is deliberately separate from the source-backed architecture.
// Public architectural drawings do not locate these logical station IDs.
export const LINE_CENTER: Point3 = [147, 0, 132];
export const LINE_ENTRY = 73;
export const LINE_EXIT = 223;
export const CAR_LENGTH = 4.75;
export const CAR_PITCH = 9;
export const LINE_STATIONS: { id: StationId; x: number; name: string }[] = [
  { id: "GA-12", x: 84, name: "Body input" },
  { id: "GA-18", x: 102, name: "Cockpit" },
  { id: "GA-24", x: 120, name: "Glass" },
  { id: "GA-28", x: 138, name: "Battery" },
  { id: "GA-32", x: 156, name: "Wheels" },
  { id: "GA-36", x: 174, name: "Fluids" },
  { id: "EOL-41", x: 192, name: "Roller test" },
  { id: "EOL-45", x: 210, name: "Inspection" },
];
export const MANAGER_LINE = { id: "ga-line-1", name: "General assembly · Line 1", stationIds: LINE_STATIONS.map(station => station.id) } as const;

export const PLANT_STATION_ANCHORS = Object.fromEntries(LINE_STATIONS.map(s => [s.id, [s.x, 3.8, LINE_CENTER[2]]])) as Record<StationId, Point3>;
export const PLANT_FRAMES: Record<PlantScope, { target: Point3; width: number; depth: number; direction: Point3 }> = {
  plant: { target: [300, 0, -65], width: 850, depth: 875, direction: [.24, 1.35, 1] },
  focus: { target: [147, 1, 132], width: 174, depth: 34, direction: [.12, .85, 1] },
  line: { target: [147, 1, 132], width: 176, depth: 65, direction: [.1, .9, 1] },
};

export function isInsideGA(x: number, z: number) {
  return x >= 0 && x <= GA_WIDTH && z >= 0 && z <= GA_DEPTH && (z <= 196 || x >= (z - 196) * 64 / 56);
}
export function createPlantVehicleSlots(): (number | null)[] {
  return Array.from({ length: Math.ceil((LINE_EXIT - LINE_ENTRY) / CAR_PITCH) + 1 }, (_, i) => i < 16 ? LINE_ENTRY + 4.5 + i * CAR_PITCH : null);
}
/** Representative moving WIP. Physical metre spacing is independent of synthetic buffer counts. */
export function advancePlantVehicles(slots: readonly (number | null)[], readings: StationReading[], delta: number, moving: boolean) {
  if (!moving || delta <= 0 || !readings.length) return [...slots];
  const occupied = slots.filter((x): x is number => x !== null);
  const next = slots.map(x => {
    if (x === null) return null;
    const nearest = LINE_STATIONS.reduce((a, b) => Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b);
    const reading = readings.find(r => r.id === nearest.id);
    const speed = reading ? getStationEffect(reading).speedFactor : 0;
    const ahead = Math.min(...occupied.filter(other => other > x));
    const target = Math.max(x, Math.min(x + Math.min(delta, .1) * .65 * speed, ahead - CAR_PITCH));
    return target > LINE_EXIT ? null : target;
  });
  const input = readings.find(r => r.id === "GA-12");
  const free = next.indexOf(null);
  if (free >= 0 && input && getStationEffect(input).speedFactor > 0 && next.every(x => x === null || x >= LINE_ENTRY + CAR_PITCH)) next[free] = LINE_ENTRY;
  return next;
}
