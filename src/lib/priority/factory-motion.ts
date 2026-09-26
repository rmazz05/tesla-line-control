import { getStationEffect } from "./station-effect";
import type { StationId, StationReading } from "./types";

export const FACTORY_STATION_X: Record<StationId, number> = {
  "GA-12": -9.5, "GA-18": -4.8, "GA-24": 0, "GA-28": 2.5,
  "GA-32": 5, "GA-36": 7.7, "EOL-41": 10.5, "EOL-45": 11.5,
};
export const VEHICLE_ENTRY_X = -12.5;
export const VEHICLE_EXIT_X = 14.5;
// The existing GLB is 5.16 scene units long at its current scale.
export const VEHICLE_SPACING = 5.6;
const VISIBLE_LENGTH = VEHICLE_EXIT_X - VEHICLE_ENTRY_X;
export const VEHICLE_SLOT_COUNT = Math.ceil(VISIBLE_LENGTH / VEHICLE_SPACING) + 1;
export type FactoryVehicleSlot = number | null;

/** Initial occupancy follows lane length and physical spacing, not a fixed
 * three-car illustration. Extra reusable slots allow entry/exit without jumps. */
export function createFactoryVehicleSlots(): FactoryVehicleSlot[] {
  const count = Math.floor(VISIBLE_LENGTH / VEHICLE_SPACING);
  return Array.from({ length: VEHICLE_SLOT_COUNT }, (_, index) => index < count
    ? VEHICLE_ENTRY_X + (index + 0.5) * VISIBLE_LENGTH / count : null);
}

export function advanceFactoryVehicleSlots(slots: readonly FactoryVehicleSlot[], readings: StationReading[], seconds: number, moving: boolean): FactoryVehicleSlot[] {
  if (!moving || seconds <= 0 || !readings.length) return [...slots];
  const occupied = slots.filter((x): x is number => x !== null);
  const advanced = advanceFactoryVehicles(occupied, readings, seconds, true, false);
  let index = 0;
  const next = slots.map(x => {
    if (x === null) return null;
    const position = advanced[index++];
    return position > VEHICLE_EXIT_X ? null : position;
  });
  const entry = readings.find(reading => reading.id === "GA-12");
  const space = next.every(x => x === null || x >= VEHICLE_ENTRY_X + VEHICLE_SPACING);
  const free = next.indexOf(null);
  if (free >= 0 && space && entry && getStationEffect(entry).speedFactor > 0) next[free] = VEHICLE_ENTRY_X;
  return next;
}

/** Representative motion, not a discrete reconstruction of fractional buffers.
 * Every station, including final inspection, is crossed before a car exits. */
export function advanceFactoryVehicles(positions: readonly number[], readings: StationReading[], seconds: number, moving: boolean, recycle = true): number[] {
  if (!moving || !readings.length) return [...positions];
  return positions.map(x => {
    const station = readings.reduce((best, reading) => Math.abs(FACTORY_STATION_X[reading.id] - x) < Math.abs(FACTORY_STATION_X[best.id] - x) ? reading : best);
    const ahead = Math.min(...positions.filter(position => position > x));
    const target = Math.min(x + Math.max(0, Math.min(seconds, .05)) * .8 * getStationEffect(station).speedFactor, ahead - VEHICLE_SPACING);
    if (recycle && target > VEHICLE_EXIT_X && positions.every(position => position === x || position > VEHICLE_ENTRY_X + VEHICLE_SPACING)) return VEHICLE_ENTRY_X;
    return Math.max(x, recycle ? Math.min(target, VEHICLE_EXIT_X) : target);
  });
}
