import assert from "node:assert/strict";
import { test } from "node:test";
import { displayedFaults, enqueueFault, parsePhoneSession, readPhoneSession, savePhoneSession, type FaultChange, type PhoneSession, type StorageLike } from "../src/lib/audience/phone-session";

const token = "a".repeat(64);
const change = (id: string, faultId: string, active: boolean): FaultChange => ({ requestId: id.repeat(64), faultId, active, round: 1, version: 0 });
const memory = (): StorageLike => {
  const entries = new Map<string, string>();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } };
};
const blocked: StorageLike = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } };

test("a refreshed phone restores the same identity and exact unsent requests", () => {
  const storage = memory();
  const session: PhoneSession = { token, name: "Alex", joined: true, queue: [change("b", "body-drive", true)] };
  assert.equal(savePhoneSession("room", session, [storage]), true);
  assert.deepEqual(readPhoneSession("room", [storage]), session);
});
test("blocked or corrupt storage falls back without preventing participation", () => {
  const storage = memory();
  const session: PhoneSession = { token, name: "Alex", joined: true, queue: [] };
  assert.equal(savePhoneSession("room", session, [blocked, storage]), true);
  assert.deepEqual(readPhoneSession("room", [blocked, storage]), session);
  assert.equal(savePhoneSession("room", session, [blocked]), false);
  assert.equal(parsePhoneSession("broken json"), null);
  assert.equal(parsePhoneSession(JSON.stringify({ token: "bad" })), null);
  assert.deepEqual(parsePhoneSession(JSON.stringify({ token, joined: true })), { token, joined: true, name: "", queue: [] });
});
test("rapid taps preserve the in-flight request and compact only unsent intents", () => {
  const first = change("b", "body-drive", true);
  let queue = enqueueFault([], first);
  queue = enqueueFault(queue, change("c", "body-supply", true));
  queue = enqueueFault(queue, change("d", "body-supply", false));
  queue = enqueueFault(queue, change("e", "body-slow", true));
  queue = enqueueFault(queue, change("f", "body-drive", false));
  assert.equal(queue[0], first);
  assert.equal(queue.length, 4);
  assert.deepEqual(queue.map(item => item.version), [0, 1, 2, 3]);
  assert.deepEqual(displayedFaults([], queue, 1), ["body-slow"]);
  assert.deepEqual(displayedFaults([], queue, 2), []);
  const restored = parsePhoneSession(JSON.stringify({ token, joined: true, queue }))!;
  assert.deepEqual(restored.queue, queue);
});
