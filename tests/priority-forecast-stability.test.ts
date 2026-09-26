import assert from "node:assert/strict";
import test from "node:test";
import { advanceSimulation, createSimulation, getRankedIncidents, resolveIncident, startRepair } from "../src/lib/priority/engine";

/** One sample per real UI second at 10x playback. The schedules reproduce
 * deadline/colour oscillations caused by skipping repair and buffer boundaries. */
function replay(schedule: { tick: number; id: string; action: "repair" | "resolve" }[], ticks: number) {
  let state = createSimulation();
  const samples = [];
  for (let tick = 1; tick <= ticks; tick++) {
    state = advanceSimulation(state, 1 / 6);
    for (const action of schedule.filter(action => action.tick === tick)) {
      state = action.action === "repair" ? startRepair(state, action.id) : resolveIncident(state, action.id);
    }
    samples.push({
      minute: state.minute,
      context: state.incidents.map(incident => `${incident.id}:${incident.status}`).join(),
      rows: getRankedIncidents(state).filter(row => ["SIM-01", "SIM-04"].includes(row.incident.id)),
    });
  }
  return samples;
}

function assertNoRapidReversal(samples: ReturnType<typeof replay>) {
  for (let i = 2; i < samples.length; i++) {
    const [a, b, c] = samples.slice(i - 2, i + 1);
    // New incidents, dispatch, resolution and completed repairs are legitimate
    // reasons to reassess immediately, even in successive UI frames.
    if (a.context !== b.context || b.context !== c.context || a.rows.length < 2) continue;
    const order = (sample: typeof a) => sample.rows.map(row => row.incident.id).join();
    assert.ok(order(a) !== order(c) || order(a) === order(b), `queue reversed twice around minute ${b.minute}`);
    for (const row of c.rows) {
      const first = a.rows.find(item => item.incident.id === row.incident.id)!.decision.urgency;
      const middle = b.rows.find(item => item.incident.id === row.incident.id)!.decision.urgency;
      assert.ok(row.decision.urgency !== first || middle === first, `${row.incident.id} colour flickered around minute ${b.minute}`);
    }
  }
}

test("a pending inspection repair does not make body supply and wheel priorities swap on every UI tick", () => {
  const samples = replay([{ tick: 36, id: "SIM-02", action: "repair" }], 66);
  assertNoRapidReversal(samples);
  const windows = samples.slice(48, 60).map(sample => sample.rows.find(row => row.incident.id === "SIM-04")!.slackMinutes);
  assert.ok(windows.every(value => value !== null));
  assert.ok(windows.at(-1)! < windows[0]!, "a real approaching deadline still counts down");
});

test("short buffer restrictions do not alternate between warning and no extra impact", () => {
  const samples = replay([
    { tick: 31, id: "SIM-02", action: "resolve" },
    { tick: 67, id: "SIM-05", action: "resolve" },
    { tick: 67, id: "SIM-03", action: "resolve" },
    { tick: 109, id: "SIM-06", action: "resolve" },
    { tick: 115, id: "SIM-07", action: "resolve" },
  ], 132);
  assertNoRapidReversal(samples);
});

test("forecast and inventories do not depend on how the same elapsed time is split into ticks", () => {
  const initial = startRepair(advanceSimulation(createSimulation(), 6), "SIM-02");
  const coarse = advanceSimulation(initial, 4);
  let fine = initial;
  for (let tick = 0; tick < 24; tick++) fine = advanceSimulation(fine, 1 / 6);
  for (let i = 0; i < coarse.buffers.length; i++) assert.ok(Math.abs(coarse.buffers[i] - fine.buffers[i]) < 1e-6);
  const result = (state: typeof coarse) => getRankedIncidents(state).map(row => ({ id: row.incident.id, impact: row.criticalInMinutes, slack: row.slackMinutes, event: row.impactEvent, urgency: row.decision.urgency }));
  assert.deepEqual(result(fine), result(coarse));
});

test("new personnel risk interrupts the order immediately, without a smoothing delay", () => {
  const before = advanceSimulation(createSimulation(), 7.9);
  const after = advanceSimulation(before, 0.1);
  assert.notEqual(getRankedIncidents(before)[0].incident.id, "SIM-05");
  assert.equal(getRankedIncidents(after)[0].incident.id, "SIM-05");
  assert.equal(getRankedIncidents(after)[0].decision.urgency, "critical");
});
