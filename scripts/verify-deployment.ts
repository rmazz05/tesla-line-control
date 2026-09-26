import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { AUDIENCE_FAULTS } from "../src/lib/audience/catalog";

async function main() {
  const base = process.argv[2];
  if (!base || !process.env.DATABASE_URL) throw new Error("Pass the deployment URL and set DATABASE_URL for cleanup.");
  const key = () => randomBytes(32).toString("hex");
  const manager = key();
  const presenter = key();
  const phones = Array.from({ length: 12 }, key);
  const code = randomBytes(3).toString("hex").toUpperCase();
  async function request(path: string, token?: string, body?: unknown, expected = 200) {
    const response = await fetch(new URL(path, base), {
      method: body ? "POST" : "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(response.status, expected, `${path} returned ${response.status}`);
    return response.json();
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const created = await request("/api/manager", manager, { create: true });
    const command = (command: unknown, requestId = key()) => request("/api/manager", manager, { run: created.run, command, requestId });
    const notes = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => command({ type: "note", note: `Deployment check ${i}` })));
    assert.ok(notes.every(result => result.status === "fulfilled"));
    const workspace = await request("/api/manager?desktop=1", manager);
    assert.equal(workspace.simulation.supervisor.log.length, 8);
    assert.equal(workspace.desktopConnected, true);
    const retry = key();
    await command({ type: "note", note: "Retry safety check" }, retry);
    await command({ type: "note", note: "Retry safety check" }, retry);
    assert.equal((await request("/api/manager", manager)).simulation.supervisor.log.length, 9);
    await request("/api/manager", "invalid", undefined, 401);
    console.log("PASS: shared manager state, concurrent commands, retry deduplication, authorization");

    const demo = (token: string, body: object, status = 200) => request("/api/demo", token, { code, ...body }, status);
    await demo(presenter, { action: "create" });
    const joins = await Promise.allSettled(phones.map((token, i) => demo(token, { action: "join", name: `Deployment test ${i}` })));
    assert.ok(joins.every(result => result.status === "fulfilled"));
    const room = await request(`/api/demo?code=${code}`, presenter);
    assert.equal(room.participants.length, phones.length);
    await demo(phones[0], { action: "start", requestId: key() }, 403);
    await demo(presenter, { action: "start", requestId: key() });
    const assigned = await request(`/api/demo?code=${code}`, phones[0]);
    const fault = AUDIENCE_FAULTS.find(item => item.stationId === assigned.me.stationId)!;
    const toggle = { action: "toggle", faultId: fault.id, active: true, round: assigned.round, version: 0, requestId: key() };
    await demo(phones[0], toggle);
    await demo(phones[0], toggle);
    const participant = await request(`/api/demo?code=${code}`, phones[0]);
    assert.deepEqual(participant.me.faults, [fault.id]);
    assert.equal(participant.me.faultVersion, 1);
    assert.equal(participant.participants.length, 0);
    assert.ok(!JSON.stringify(participant).includes(presenter));
    assert.equal((await request(`/api/demo?code=${code}`, presenter)).ranking.length, 1);
    console.log("PASS: audience creation, simultaneous joins, permissions, fault toggle, presenter synchronization");

    const status = await request("/api/incidents/assess");
    assert.equal(status.configured, true);
    console.log(`PASS: server-side OpenAI key configured (model ${status.model})`);
    const assessment = await request("/api/incidents/assess", undefined, {
      report: "GA-24 glass robot servo keeps resetting.", stationId: "GA-24", minute: 0, telemetry: [], activeIncidents: [],
    });
    console.log(`Assessment mode: ${assessment.mode}${assessment.warning ? `; ${assessment.warning}` : ""}`);
    assert.equal(assessment.mode, "openai", "Live assessment must work with the deployed environment");
  } finally {
    await pool.query("DELETE FROM line_control_state WHERE (namespace = 'manager' AND id = $1) OR (namespace = 'audience' AND id = $2 AND payload->>'hostToken' = $3)", [manager, code, presenter]);
    await pool.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Deployment verification failed"); process.exitCode = 1; });
