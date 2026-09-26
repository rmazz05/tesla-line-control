import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AudienceConnectionServer, audienceConnectionTarget, probeAudienceConnection } from "../src/lib/audience/connection-server";
import type { DeviceConnection } from "../src/lib/manager/connection-types";
import { GET, POST } from "../src/app/api/demo/connection/route";
import { GET as proof } from "../src/app/api/demo/connection/probe/route";
import { createRoom, joinRoom } from "../src/lib/audience/session";
import { withRoom } from "../src/lib/audience/store";

class FakeConnector {
  state: DeviceConnection = { status: "idle" };
  starts = 0;
  stops = 0;
  start() { this.starts++; this.state = { status: "starting" }; return this.snapshot(); }
  snapshot(): DeviceConnection { return this.state; }
  stop() { this.stops++; this.state = { status: "idle" }; }
  ready() { this.state = { status: "ready", origin: "https://audience-test.trycloudflare.com" }; }
}
const localAddresses = ["localhost", "127.0.0.1", "10.32.104.159"];
function request(host = "localhost:3001", extra: Record<string, string> = {}) {
  return new Request(`http://${host}/api/demo/connection?code=ABCDEF`, { method: "POST", headers: { host, origin: `http://${host}`, "sec-fetch-site": "same-origin", ...extra } });
}

test("audience setup accepts this laptop's LAN or localhost origin, never an arbitrary upstream", () => {
  for (const host of ["localhost:3001", "10.32.104.159:3001"]) assert.equal(audienceConnectionTarget(request(host), localAddresses), "http://127.0.0.1:3001");
  // Next can construct request.url from its bind address instead of the Host header.
  assert.equal(audienceConnectionTarget(new Request("http://0.0.0.0:3001/api/demo/connection", { method: "POST", headers: { host: "10.32.104.159:3001", origin: "http://10.32.104.159:3001" } }), localAddresses), "http://127.0.0.1:3001");
  const rejected: Record<string, string>[] = [{ origin: "https://unrelated.example" }, { host: "localhost:9000" }, { "cf-ray": "from-public-tunnel" }, { "x-forwarded-for": "203.0.113.1" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of rejected) assert.throws(() => audienceConnectionTarget(request("localhost:3001", headers), localAddresses));
  assert.throws(() => audienceConnectionTarget(request("192.168.1.99:3001"), localAddresses));
  assert.throws(() => audienceConnectionTarget(new Request("http://localhost:3001/api/demo/connection", { method: "POST" }), localAddresses));
});

test("opening the QR repeatedly shares one helper; the URL is hidden until end-to-end verification", async () => {
  const connector = new FakeConnector();
  let reachable = false;
  const server = new AudienceConnectionServer(connector, async () => reachable);
  try {
    server.start("http://127.0.0.1:3001"); await server.check();
    for (let i = 0; i < 10; i++) server.start("http://127.0.0.1:3001");
    assert.equal(connector.starts, 1);
    connector.ready(); await server.check();
    assert.equal(server.snapshot().status, "starting");
    assert.ok(!("origin" in server.snapshot()));
    reachable = true; await server.check();
    assert.equal(server.snapshot().status, "ready");
    server.start("http://127.0.0.1:3001");
    assert.equal(connector.starts, 1);
    assert.throws(() => server.start("http://127.0.0.1:9999"));
  } finally { server.stop(); }
});

test("a dropped public connection hides the QR and recovers the same address without restarting", async () => {
  const connector = new FakeConnector();
  let reachable = true;
  const server = new AudienceConnectionServer(connector, async () => reachable);
  try {
    server.start("http://127.0.0.1:3001"); await server.check(); connector.ready(); await server.check();
    const original = server.snapshot();
    reachable = false;
    for (let i = 0; i < 5; i++) await server.check();
    assert.equal(server.snapshot().status, "error");
    assert.ok(!("origin" in server.snapshot()));
    reachable = true; await server.check();
    const recovered = server.snapshot();
    assert.ok(original.status === "ready" && recovered.status === "ready");
    assert.equal(recovered.origin, original.origin);
    assert.equal(connector.starts, 1);
  } finally { server.stop(); }
});

test("a crashed helper restarts automatically, then exposes a retry after bounded failures", async () => {
  const connector = new FakeConnector();
  const server = new AudienceConnectionServer(connector, async () => true);
  try {
    server.start("http://127.0.0.1:3001"); await server.check();
    for (let i = 0; i < 4; i++) { connector.state = { status: "error", error: "process stopped" }; await server.check(); }
    assert.equal(server.snapshot().status, "error");
    assert.equal(connector.starts, 4);
    server.start("http://127.0.0.1:3001"); await server.check();
    assert.equal(connector.starts, 5);
    connector.ready(); await server.check();
    assert.equal(server.snapshot().status, "ready");
  } finally { server.stop(); }
});

test("an in-flight probe cannot restore a stopped connection", async () => {
  const connector = new FakeConnector();
  let finish!: (value: boolean) => void;
  const server = new AudienceConnectionServer(connector, () => new Promise(resolve => { finish = resolve; }));
  server.start("http://127.0.0.1:3001"); await server.check(); connector.ready();
  const pending = server.check(); server.stop(); finish(true); await pending;
  assert.equal(server.snapshot().status, "idle");
});

test("verification requires this app instance and never follows a redirect or private URL", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (input, options) => {
      calls++; assert.equal(options?.redirect, "error"); assert.ok(String(input).startsWith("https://audience-test.trycloudflare.com/api/demo/connection/probe?check="));
      return Response.json({ instance: "correct-instance" });
    };
    assert.equal(await probeAudienceConnection("http://127.0.0.1:9000", "correct-instance"), false);
    assert.equal(await probeAudienceConnection("https://unrelated.example", "correct-instance"), false);
    assert.equal(calls, 0);
    assert.equal(await probeAudienceConnection("https://audience-test.trycloudflare.com", "wrong-instance"), false);
    assert.equal(await probeAudienceConnection("https://audience-test.trycloudflare.com", "correct-instance"), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("only an existing room's presenter can start a connection; public proof reveals no credentials", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "audience-connection-"));
  const originalDirectory = process.env.DEMO_DATA_DIR;
  const shared = globalThis as typeof globalThis & { audienceConnection?: AudienceConnectionServer };
  const originalServer = shared.audienceConnection;
  const connector = new FakeConnector();
  const server = new AudienceConnectionServer(connector, async () => true);
  shared.audienceConnection = server; process.env.DEMO_DATA_DIR = directory;
  const token = "a".repeat(64), participant = "b".repeat(64);
  const hostRequest = () => request("localhost:3001", { authorization: `Bearer ${token}` });
  try {
    assert.equal((await POST(request())).status, 401);
    assert.equal((await POST(hostRequest())).status, 404);
    await withRoom("ABCDEF", () => {
      const room = createRoom("ABCDEF", token, Date.now()); joinRoom(room, participant, "Audience", Date.now());
      return { room, result: null };
    });
    assert.equal((await POST(request("localhost:3001", { authorization: `Bearer ${participant}` }))).status, 403);
    assert.equal((await POST(request("localhost:3001", { authorization: `Bearer ${token}`, "cf-ray": "external" }))).status, 403);
    assert.equal(connector.starts, 0);
    // A supplied URL is ignored: the target is always derived from the validated request.
    assert.equal((await POST(new Request(hostRequest(), { body: JSON.stringify({ target: "http://localhost:9000" }) }))).status, 200);
    await server.check(); connector.ready(); await server.check();
    const response = await GET(new Request("http://localhost:3001/api/demo/connection?code=ABCDEF", { headers: { authorization: `Bearer ${token}` } }));
    assert.equal((await response.json()).status, "ready");
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.deepEqual(await proof().json(), { instance: server.instance });
  } finally {
    server.stop(); shared.audienceConnection = originalServer;
    if (originalDirectory === undefined) delete process.env.DEMO_DATA_DIR; else process.env.DEMO_DATA_DIR = originalDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
