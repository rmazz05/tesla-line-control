import assert from "node:assert/strict";
import test from "node:test";
import { advanceSimulation, createSimulation, getRankedIncidents, startRepair, resolveIncident, setAutoDispatch } from "../src/lib/priority/engine";
import { getIncidentPresentation } from "../src/lib/priority/presentation";
import type { SimulationState } from "../src/lib/priority/types";

function checkWhatTheUserSees(state: SimulationState) {
  const rows = getRankedIncidents(state).filter(({ incident }) => incident.status === "open");
  let previousGroup = -1;
  let previousCountdown = -1;
  for (const [index, item] of rows.entries()) {
    const view = getIncidentPresentation(item, state.minute);
    const group = item.decision.group;
    assert.ok(group >= previousGroup, `#${item.rank} contradicts the preceding consequence gate`);
    assert.equal(view.urgency, item.decision.urgency);
    assert.equal(view.timingLabel, item.decision.action);
    assert.equal(item.rank, index + 1);
    if(group===0) assert.equal(view.timingLabel,"Safety review now");
    if(group===1) assert.equal(view.timingLabel,"Contain now");
    if(group===2) assert.equal(view.timingLabel,"Verify impact now");
    const match = view.timingLabel.match(/^Start within (\d+) min$/);
    const countdown = view.timingLabel === "Start now" ? 0 : match ? Number(match[1]) : Infinity;
    if (group === previousGroup && group === 3) assert.ok(countdown >= previousCountdown, "comparable production risks show earliest countdown first");
    previousGroup = group;
    previousCountdown = countdown;
  }
}

test("an urgent interruption stays above a warning with time to respond", () => {
  let state = advanceSimulation(createSimulation(), 6.5);
  state = startRepair(state, "SIM-03");
  state = advanceSimulation(state, 3);
  const rows = getRankedIncidents(state).filter(({ incident }) => incident.status === "open");
  assert.equal(rows[0].incident.assessment.stationId,"GA-18");
  assert.equal(getIncidentPresentation(rows[0],state.minute).timingLabel,"Safety review now");
  assert.match(getIncidentPresentation(rows[0],state.minute).calculation!,/2 comparable injury cases/);
  assert.equal(rows[1].incident.assessment.stationId,"EOL-45");
  checkWhatTheUserSees(state);
});

test("visible colors and clocks stay ordered throughout arrivals, time, repairs, and resolution", () => {
  for (const auto of [false, true]) {
    let state = setAutoDispatch(createSimulation(), auto);
    for (let minute = 0; minute <= 40; minute++) {
      checkWhatTheUserSees(state);
      if (minute === 10 && !auto) state = startRepair(state, getRankedIncidents(state)[0].incident.id);
      if (minute === 16 && !auto) state = resolveIncident(state, "SIM-03");
      state = advanceSimulation(state, 1);
    }
  }
});

test("optional production-loss forecasts cannot override the visible repair window", () => {
  const state = advanceSimulation(createSimulation(), 9);
  const row = getRankedIncidents(state).find(({ incident }) => incident.id === "SIM-05")!;
  const plain = getIncidentPresentation(row, state.minute);
  const extreme = getIncidentPresentation({ ...row, delayLossUnits: 1000, immediateLossUnits: 10000, deferredLossUnits: 11000 }, state.minute);
  assert.deepEqual(extreme, plain);
});
