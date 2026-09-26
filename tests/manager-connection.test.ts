import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DeviceConnectionServer, localConnectionTarget } from "../src/lib/manager/connection-server";
import { GET, POST } from "../src/app/api/manager/connection/route";
import { withWorkspace } from "../src/lib/manager/store";
import { createWorkspace } from "../src/lib/manager/session";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kills: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals) {
    this.kills.push(signal);
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
  asProcess() { return this as unknown as ChildProcess; }
}

function request(method = "POST", extra: Record<string, string> = {}, url = "http://localhost:3000/api/manager/connection") {
  return new Request(url, { method, headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...extra } });
}

test("connection only targets its own local app and rejects remote or cross-origin initiation", () => {
  assert.equal(localConnectionTarget(request()), "http://127.0.0.1:3000");
  assert.equal(localConnectionTarget(request("POST", { "x-forwarded-for": "::1" })), "http://127.0.0.1:3000");
  const rejectedHeaders: Record<string, string>[] = [
    { origin: "https://other.example" }, { host: "localhost:9000" }, { "sec-fetch-site": "cross-site" },
    { "x-forwarded-for": "203.0.113.42" }, { "x-forwarded-for": "::1, 203.0.113.42" },
    { "cf-connecting-ip": "127.0.0.1" }, { "cf-ray": "example" }, { "x-forwarded-host": "remote.example" },
  ];
  for (const extra of rejectedHeaders) assert.throws(() => localConnectionTarget(request("POST", extra)), /from the app on this computer/);
  assert.throws(() => localConnectionTarget(request("POST", { host: "remote.example", origin: "https://remote.example" }, "https://remote.example/api/manager/connection")));
  assert.throws(() => localConnectionTarget(new Request("http://localhost:3000/api/manager/connection", { method: "POST", headers: { host: "localhost:3000" } })));
  assert.equal(localConnectionTarget(new Request("http://localhost:3000/api/manager/connection", { headers: { host: "localhost:3000", "x-connection-origin": "http://localhost:3000" } })), "http://127.0.0.1:3000");
});

test("repeated starts reuse one child and readiness requires both an address and registration", () => {
  const child = new FakeChild();
  let launches = 0;
  const server = new DeviceConnectionServer(target => { assert.equal(target, "http://127.0.0.1:3000"); launches++; return child.asProcess(); });
  try {
    assert.deepEqual(server.start("http://127.0.0.1:3000"), { status: "starting" });
    server.start("http://127.0.0.1:3000");
    child.stderr.write("Your URL: https://example-test.trycloud");
    child.stderr.write("flare.com\n");
    assert.equal(server.snapshot().status, "starting");
    child.stderr.write("Registered tunnel connection connIndex=0\n");
    assert.deepEqual(server.snapshot(), { status: "ready", origin: "https://example-test.trycloudflare.com" });
    server.start("http://127.0.0.1:3000");
    assert.equal(launches, 1);
    assert.throws(() => server.start("http://127.0.0.1:9000"), /original local address/);
  } finally { server.stop(); }
  assert.deepEqual(child.kills, ["SIGTERM"]);
  assert.equal(server.snapshot().status, "idle");
});

test("a failed connection clears its URL, allows retry, and ignores events from the old process", () => {
  const children: FakeChild[] = [];
  const server = new DeviceConnectionServer(() => { const child = new FakeChild(); children.push(child); return child.asProcess(); });
  try {
    server.start("http://127.0.0.1:3000");
    children[0].stderr.write("https://old-link.trycloudflare.com\nRegistered tunnel connection\n");
    children[0].kill("SIGTERM");
    assert.equal(server.snapshot().status, "error");
    assert.ok(!("origin" in server.snapshot()));
    server.start("http://127.0.0.1:3000");
    children[0].emit("error", new Error("late error"));
    children[0].stderr.write("Registered tunnel connection\n");
    assert.equal(server.snapshot().status, "starting");
    children[1].stderr.write("Registered tunnel connection\nhttps://new-link.trycloudflare.com\n");
    assert.deepEqual(server.snapshot(), { status: "ready", origin: "https://new-link.trycloudflare.com" });
  } finally { server.stop(); }
});

test("startup timeout terminates the process; a missing executable produces a retryable error", async () => {
  const child = new FakeChild();
  const server = new DeviceConnectionServer(() => child.asProcess(), 10);
  server.start("http://127.0.0.1:3000");
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(server.snapshot().status, "error");
  assert.deepEqual(child.kills, ["SIGTERM"]);
  const unavailable = new DeviceConnectionServer(() => { throw new Error("ENOENT cloudflared"); });
  assert.equal(unavailable.start("http://127.0.0.1:3000").status, "error");
  server.stop(); unavailable.stop();
});

test("connection API requires an existing workspace and local origin before it can spawn", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "manager-connection-"));
  const originalDirectory = process.env.MANAGER_DATA_DIR;
  const globals = globalThis as typeof globalThis & { managerConnection?: DeviceConnectionServer };
  const originalServer = globals.managerConnection;
  const child = new FakeChild();
  let starts = 0;
  const server = new DeviceConnectionServer(() => { starts++; return child.asProcess(); });
  globals.managerConnection = server;
  process.env.MANAGER_DATA_DIR = directory;
  const key = "c".repeat(64);
  const authorization = `Bearer ${key}`;
  try {
    assert.equal((await POST(request())).status, 401);
    assert.equal((await POST(request("POST", { authorization }))).status, 404);
    await withWorkspace(key, () => ({ workspace: createWorkspace(Date.now()), result: null }));
    assert.equal((await POST(request("POST", { authorization, "cf-ray": "external" }))).status, 403);
    assert.equal(starts, 0);
    // A caller cannot select an upstream through a body.
    const crafted = new Request(request("POST", { authorization }), { body: JSON.stringify({ target: "http://localhost:9000" }) });
    assert.deepEqual(await (await POST(crafted)).json(), { status: "starting" });
    assert.deepEqual(await (await POST(request("POST", { authorization }))).json(), { status: "starting" });
    assert.equal(starts, 1);
    child.stderr.write("https://test-app.trycloudflare.com\nRegistered tunnel connection\n");
    const response = await GET(request("GET", { authorization }));
    assert.deepEqual(await response.json(), { status: "ready", origin: "https://test-app.trycloudflare.com" });
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  } finally {
    server.stop(); globals.managerConnection = originalServer;
    if (originalDirectory === undefined) delete process.env.MANAGER_DATA_DIR; else process.env.MANAGER_DATA_DIR = originalDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
