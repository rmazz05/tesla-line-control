import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { GET, POST } from "../src/app/api/manager/route";

test("manager API shares persistent state, serializes devices, deduplicates retries and rejects stale runs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "manager-api-"));
  const originalDir = process.env.MANAGER_DATA_DIR;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.MANAGER_DATA_DIR = directory;
  delete process.env.OPENAI_API_KEY;
  const key = randomBytes(32).toString("hex");
  let run = 1;
  const post = (body: object, token = key) => POST(new Request("http://localhost/api/manager", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  const command = (command: object, requestId = randomBytes(32).toString("hex")) => post({ command, run, requestId });
  const get = (desktop = false, token = key) => GET(new Request(`http://localhost/api/manager?desktop=${desktop ? 1 : 0}`, { headers: { Authorization: `Bearer ${token}` } }));
  try {
    assert.equal((await post({ create: true })).status, 200);
    assert.equal((await get(false, "invalid")).status, 401);
    assert.equal((await get(false, randomBytes(32).toString("hex"))).status, 404);
    const simultaneous = await Promise.all(Array.from({ length: 12 }, (_, i) => command({ type: "note", note: `Operator observation number ${i}` })));
    assert.ok(simultaneous.every(r => r.status === 200));
    assert.equal((await (await get()).json()).simulation.supervisor.log.length, 12);
    const requestId = randomBytes(32).toString("hex");
    const reset = { type: "reset", mode: "random", settings: { seed: 42, duration: 60, meanInterval: 5 } };
    assert.equal((await command(reset, requestId)).status, 200);
    assert.equal((await command(reset, requestId)).status, 200);
    assert.equal((await command({ type: "step", minutes: 1 })).status, 409);
    const current = await (await get(true)).json();
    run = current.run;
    assert.equal(run, 2);
    assert.equal(current.desktopConnected, true);
    assert.equal((await command({ type: "next" })).status, 200);
    const phone = await (await get()).json();
    const incident = phone.simulation.incidents[0];
    assert.ok(incident);
    assert.equal((await command({ type: "inspect", incidentId: incident.id })).status, 200);
    const desktop = await (await get(true)).json();
    assert.equal(desktop.inspection.incidentId, incident.id);
    assert.deepEqual(desktop.simulation, phone.simulation);
    const reportId = randomBytes(32).toString("hex");
    const report = { type: "report", stationId: "GA-24", report: "GA-24 glass robot servo keeps resetting." };
    assert.equal((await command(report, reportId)).status, 200);
    assert.equal((await command(report, reportId)).status, 200);
    assert.equal((await (await get()).json()).simulation.incidents.filter((i: { id: string }) => i.id === `REPORT-${reportId}`).length, 1);
    assert.equal((await get()).headers.get("cache-control"), "no-store, max-age=0");
    const otherKey = randomBytes(32).toString("hex");
    await post({ create: true }, otherKey);
    assert.equal((await (await get(false, otherKey)).json()).simulation.incidents.length, 0);

    // A slow model request must not hold the workspace lock or populate a reset run.
    const originalFetch = globalThis.fetch;
    let started!: () => void;
    let finish!: () => void;
    const assessing = new Promise<void>(resolve => { started = resolve; });
    const finishAssessment = new Promise<void>(resolve => { finish = resolve; });
    process.env.OPENAI_API_KEY = "test-key-with-mocked-fetch";
    globalThis.fetch = async () => { started(); await finishAssessment; return new Response("offline test", { status: 503 }); };
    try {
      const pending = command(report);
      await assessing;
      assert.equal((await command({ ...reset, mode: "manual" })).status, 200);
      finish();
      assert.equal((await pending).status, 409);
      assert.equal((await (await get()).json()).simulation.incidents.length, 0);
    } finally { finish(); globalThis.fetch = originalFetch; }
  } finally {
    if (originalDir === undefined) delete process.env.MANAGER_DATA_DIR; else process.env.MANAGER_DATA_DIR = originalDir;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    await rm(directory, { recursive: true, force: true });
  }
});
