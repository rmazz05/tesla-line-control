import assert from "node:assert/strict";
import test from "node:test";
import { advanceSimulation, createSimulation, getRankedIncidents, getStationReadings, startRepair } from "../src/lib/priority/engine";
import { schematicIncidentTitle, schematicStations } from "../src/lib/priority/schematic";

test("the schematic preserves physical station order while badges use the live priority order", () => {
  const state = advanceSimulation(createSimulation("demo"), 2);
  const ranked = getRankedIncidents(state), readings = getStationReadings(state);
  const stations = schematicStations(readings, ranked, null);
  assert.deepEqual(stations.map(s => s.id), readings.map(r => r.id));
  assert.equal(stations.length, 8);
  assert.equal(stations.find(s => s.id === "GA-18")!.primary.rank, 1);
  assert.equal(stations.find(s => s.id === "GA-12")!.primary.rank, 2);
  assert.equal(stations.find(s => s.id === "GA-32")!.primary.rank, 3);
  assert.equal(stations.filter(s => s.primary).length, 3);
});

test("a downstream flow restriction is shown without fabricating an incident badge", () => {
  const state = advanceSimulation(createSimulation("demo"), 2);
  const readings = getStationReadings(state).map(r => r.id === "EOL-45" ? { ...r, state: "starved" as const, ratePerHour: 0 } : r);
  const last = schematicStations(readings, getRankedIncidents(state), null).at(-1)!;
  assert.equal(last.reading?.state, "starved");
  assert.equal(last.primary, undefined);
  assert.equal(last.incidents.length, 0);
});

test("multiple incidents remain reachable, open work comes first, and explicit selection is preserved", () => {
  const state = startRepair(advanceSimulation(createSimulation("demo"), 2), "DEMO-BACKUP");
  const ranked = getRankedIncidents(state);
  const backup = ranked.find(r => r.incident.id === "DEMO-BACKUP")!;
  const second = { ...backup, rank: 4, incident: { ...backup.incident, id: "SECOND-WHEEL", status: "open" as const } };
  const all = [...ranked, second];
  const station = schematicStations(getStationReadings(state), all, null).find(s => s.id === "GA-32")!;
  assert.equal(station.primary.incident.id, "SECOND-WHEEL");
  assert.equal(station.incidents.length, 2);
  const selected = schematicStations(getStationReadings(state), all, "DEMO-BACKUP").find(s => s.id === "GA-32")!;
  assert.equal(selected.primary.incident.id, "SECOND-WHEEL", "selected repairs cannot hide waiting work at the same station");
  assert.equal(selected.selected, true);
});

test("unknown reports keep their reported title and are never assigned an invented machine location", () => {
  const state = advanceSimulation(createSimulation("demo"), 2);
  const ranked = getRankedIncidents(state);
  const first = ranked[0];
  const assessment = { ...first.incident.assessment, needsReview: true, stationId: null, title: "Unidentified equipment noise" };
  assert.equal(schematicIncidentTitle(assessment), "Unidentified equipment noise");
  const unknown = { ...first, incident: { ...first.incident, assessment } };
  assert.equal(schematicStations(getStationReadings(state), [unknown], null).filter(s => s.primary).length, 0);
});
