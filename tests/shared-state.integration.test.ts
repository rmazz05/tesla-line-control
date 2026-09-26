import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { withSharedState } from "../src/lib/shared-state";
import { withRoom } from "../src/lib/audience/store";
import { createRoom, joinRoom } from "../src/lib/audience/session";

test("Postgres serializes independent processes, rolls back failures, and preserves room assignments", {
  skip: !process.env.DATABASE_URL,
  timeout: 180_000,
}, async () => {
  const id = randomBytes(32).toString("hex");
  const code = randomBytes(3).toString("hex").toUpperCase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const increment = () => withSharedState<{ count: number }, number>("manager", id, previous => {
    const count = (previous?.count ?? 0) + 1;
    return { state: { count }, result: count };
  });
  const worker = `import storage from './src/lib/shared-state.ts';
    const { withSharedState } = storage;
    for (let i = 0; i < 2; i++) await withSharedState('manager', ${JSON.stringify(id)}, previous => {
      const count = (previous?.count ?? 0) + 1;
      return { state: {count}, result: count };
    });`;
  function runWorker() {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", worker], {
        cwd: process.cwd(), env: process.env, stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", data => { stderr += data; });
      child.on("error", reject);
      child.on("exit", status => status === 0 ? resolve() : reject(new Error(`Concurrent worker failed (${status}): ${stderr}`)));
    });
  }
  try {
    await Promise.all([runWorker(), runWorker(), runWorker()]);
    assert.equal(await increment(), 7);
    await assert.rejects(withSharedState<{ count: number }, null>("manager", id, state => {
      assert.ok(state);
      state.count = -100;
      throw new Error("Deliberate rollback");
    }), /Deliberate rollback/);
    assert.equal(await increment(), 8);
    await withSharedState("audience", id, state => {
      assert.equal(state, null, "Namespaces must not share state");
      return { state: { independent: true }, result: null };
    });
    await withRoom(code, existing => {
      assert.equal(existing, null, "Never overwrite an existing audience room");
      return { room: createRoom(code, id, Date.now()), result: null };
    });
    const assignments = await Promise.all(Array.from({ length: 12 }, (_, i) => withRoom(code, room => {
      assert.ok(room);
      const person = joinRoom(room, `integration-${i}`, `Test ${i}`, Date.now());
      return { room, result: person.machine };
    })));
    assert.equal(new Set(assignments).size, 12);
    await withRoom(code, room => {
      assert.ok(room);
      assert.equal(room.participants.length, 12);
      assert.equal(room.revision, 13);
      return { room, result: null };
    });
    // Expiry is checked against persisted state, independently of any instance.
    await pool.query("UPDATE line_control_state SET payload = jsonb_set(payload, '{updatedAt}', to_jsonb($1::bigint)) WHERE namespace = 'audience' AND id = $2", [Date.now() - 13 * 60 * 60 * 1000, code]);
    await assert.rejects(withRoom(code, room => {
      assert.equal(room, null);
      throw new Error("Expired room confirmed");
    }), /Expired room confirmed/);
  } finally {
    await pool.query("DELETE FROM line_control_state WHERE id = $1 OR (namespace = 'audience' AND id = $2 AND payload->>'hostToken' = $1)", [id, code]);
    await pool.end();
  }
});
