import { STATIONS } from "./config";
import type { StationReading } from "./types";

/** Explain a flow restriction separately from a fault at this station. The
 * neighbour is the immediate handoff, not an inferred root-cause incident. */
export function getStationStatus(reading: StationReading) {
  const effect = getStationEffect(reading);
  const index = STATIONS.findIndex(station => station.id === reading.id);
  if (reading.state === "starved") {
    const upstream = STATIONS[index - 1]?.id;
    return {
      tone: "waiting" as const,
      label: effect.kind === "stopped"
        ? upstream ? `Waiting for ${upstream}` : "Waiting for supply"
        : upstream ? `Input limited by ${upstream}` : "Supply limited",
      description: upstream
        ? `${reading.id} has insufficient input from ${upstream}. ${effect.description}.`
        : `${reading.id} has insufficient incoming supply. ${effect.description}.`,
    };
  }
  if (reading.state === "blocked") {
    const downstream = STATIONS[index + 1]?.id;
    return {
      tone: "waiting" as const,
      label: downstream ? `Output held at ${downstream}` : "Output blocked",
      description: `${reading.id} cannot pass output forward because the next buffer is full. ${effect.description}.`,
    };
  }
  return { tone: effect.kind, label: effect.label, description: effect.description };
}

/** Shared production truth for queue copy, 3D status and motion. Rates describe
 * this station, not an independently attributable percentage loss for each fault. */
export function getStationEffect(reading: StationReading) {
  const nominal = STATIONS.find(station => station.id === reading.id)!.ratePerMinute * 60;
  const speedFactor = Math.max(0, Math.min(1, reading.ratePerHour / nominal));
  const reduction = Number(((1 - speedFactor) * 100).toFixed(1));
  if (speedFactor === 0) return {
    kind: "stopped" as const, speedFactor, reduction,
    label: "Stopped",
    description: "Production stopped",
  };
  if (speedFactor < 1) return {
    kind: "slowed" as const, speedFactor, reduction,
    label: `${reduction}% slower`, description: `Production running ${reduction}% slower`,
  };
  return { kind: "running" as const, speedFactor, reduction, label: "Running", description: "Production running" };
}
