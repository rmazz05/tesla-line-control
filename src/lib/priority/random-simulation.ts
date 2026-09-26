import { CATALOG } from "./catalog";
import { createSimulation } from "./engine";
import type { ScenarioEvent } from "./types";

export interface RandomSettings { seed: number; duration: number; meanInterval: number; }
// Generic intake templates have no equipment location or verified behavior.
// Factory-generated events must refer to a modeled machine.
const factoryFaults = CATALOG.filter(entry => entry.assessment.stationId !== null);

/** Seeded PRNG: new seeds vary a run; replaying a seed reproduces every arrival. */
export function randomEvents(settings: RandomSettings): ScenarioEvent[] {
  if (!Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > 0xffffffff || !Number.isFinite(settings.duration) || settings.duration < 10 || settings.duration > 240 || !Number.isFinite(settings.meanInterval) || settings.meanInterval < 1 || settings.meanInterval > 20) throw new Error("Invalid random simulation settings.");
  let value = settings.seed >>> 0;
  const random = () => {
    value = (value + 0x6D2B79F5) | 0;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const events: ScenarioEvent[] = [];
  let minute = 0;
  while (true) {
    // Exponential interarrival times, rounded to seconds, with a 15 s floor.
    minute = Math.round((minute + Math.max(.25, -Math.log(1 - random()) * settings.meanInterval)) * 60) / 60;
    if (minute > settings.duration) break;
    const entry = factoryFaults[Math.floor(random() * factoryFaults.length)];
    const reportText = `${entry.assessment.stationId}: ${entry.assessment.title}. ${entry.assessment.diagnosis}`;
    events.push({ id: `RND-${settings.seed}-${events.length + 1}`, minute, reportText, assessment: {
      ...structuredClone(entry.assessment),
      evidence: [reportText, ...entry.assessment.evidence],
      assumptions: [...entry.assessment.assumptions, `Synthetic random arrival; seed ${settings.seed}. Equipment behavior uses the catalog assumptions.`],
    } });
  }
  return events;
}

export function createRandomSimulation(settings: RandomSettings) {
  return { ...createSimulation("random", true), scheduledEvents: randomEvents(settings) };
}
