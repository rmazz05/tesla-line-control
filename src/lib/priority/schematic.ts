import { STATIONS } from "./config";
import { needsSupervisorAction } from "./attention";
import { getIncidentTitle } from "./presentation";
import type { FaultAssessment, RankedIncident, StationId, StationReading } from "./types";

export const SCHEMATIC_NAMES: Record<StationId, string> = {
  "GA-12": "Body supply", "GA-18": "Cockpit", "GA-24": "Glass fitting", "GA-28": "Battery",
  "GA-32": "Wheels", "GA-36": "Fluid fill", "EOL-41": "Vehicle test", "EOL-45": "Inspection",
};

const shortTitles: Record<string, string> = {
  "body-feed-interruption": "Supply interrupted", "final-gate-camera": "Camera fault",
  "torque-backup": "Slower backup tool", "glass-servo": "Robot keeps stopping",
  "cockpit-locator": "Equipment vibration", "fluid-meter-drift": "Readings do not match",
  "battery-guard": "Safety guard concern", "roller-calibration": "Test accuracy concern",
  "fluid-pump": "Low pump pressure", "body-transfer": "Transfer stopped",
};

export function schematicIncidentTitle(assessment: FaultAssessment) {
  return !assessment.needsReview && assessment.kind !== "unknown" && assessment.stationId && assessment.catalogId && Object.hasOwn(shortTitles, assessment.catalogId)
    ? shortTitles[assessment.catalogId] : getIncidentTitle(assessment);
}

/** Use the real queue order and readings; a flow restriction alone is not a new incident. */
export function schematicStations(readings: StationReading[], ranking: RankedIncident[], selectedId: string | null) {
  return STATIONS.map(station => {
    const incidents = ranking.filter(item => item.incident.status !== "resolved" && item.incident.assessment.stationId === station.id)
      .sort((a, b) => Number(!needsSupervisorAction(a)) - Number(!needsSupervisorAction(b)) || a.rank - b.rank);
    const selected = incidents.find(item => item.incident.id === selectedId);
    // A selected repair must not hide another incident that still needs a response.
    const primary = selected && needsSupervisorAction(selected) ? selected : incidents.find(needsSupervisorAction) ?? selected ?? incidents[0];
    return { id: station.id, name: SCHEMATIC_NAMES[station.id], reading: readings.find(reading => reading.id === station.id), incidents, primary, selected: Boolean(selected) };
  });
}
