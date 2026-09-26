import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRoom, joinRoom } from "../src/lib/audience/session";
import { withRoom } from "../src/lib/audience/store";

test("concurrent requests preserve every assignment and survive a fresh disk read", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "audience-store-"));
  const previous = process.env.DEMO_DATA_DIR;
  process.env.DEMO_DATA_DIR = directory;
  try {
    await withRoom("ABCDEF", () => ({ room: createRoom("ABCDEF", "host", Date.now()), result: null }));
    await Promise.all(Array.from({ length: 60 }, (_, i) => withRoom("ABCDEF", room => {
      assert.ok(room);
      const person = joinRoom(room, `token-${i}`, `Person ${i}`, Date.now());
      return { room, result: person.id };
    })));
    await withRoom("ABCDEF", room => {
      assert.ok(room);
      assert.equal(room.participants.length, 60);
      assert.equal(new Set(room.participants.map(person => person.machine)).size, 60);
      assert.equal(room.revision, 61);
      return { room, result: null };
    });
  } finally {
    if (previous === undefined) delete process.env.DEMO_DATA_DIR; else process.env.DEMO_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
