import { spawn, type ChildProcess } from "node:child_process";
import type { DeviceConnection } from "./connection-types";
import { WorkspaceError } from "./session";

const connectionError = "Could not prepare the connection. Keep this computer online and try again.";
type Launch = (target: string) => ChildProcess;

/** Only the browser on the serving computer may start an external connection.
 * The upstream is this request's server, never a URL supplied in the body. */
export function localConnectionTarget(request: Request): string {
  const url = new URL(request.url);
  const origin = request.headers.get("origin") ?? (request.method === "GET" ? request.headers.get("x-connection-origin") : null);
  const host = request.headers.get("host");
  const forwarded = request.headers.get("x-forwarded-for");
  const loopback = (value: string) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(value.trim());
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !["http:", "https:"].includes(url.protocol)
    || host !== url.host || origin !== url.origin
    || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
    || request.headers.has("cf-connecting-ip") || request.headers.has("cf-ray")
    || (forwarded && !forwarded.split(",").every(loopback))
    || (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host)) {
    throw new WorkspaceError("Prepare the connection from the app on this computer.", 403);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new WorkspaceError("Open the app on the computer running the simulation.", 503);
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `http://${url.hostname === "[::1]" ? "[::1]" : "127.0.0.1"}:${port}`;
}

/** One connection per persistent Next server. Kept on globalThis across dev reloads. */
export class DeviceConnectionServer {
  private state: DeviceConnection = { status: "idle" };
  private child: ChildProcess | null = null;
  private target: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  // Installed on the host; never trace an environment-selected executable into the bundle.
  constructor(private launch: Launch = target => spawn(/* turbopackIgnore: true */ process.env.CLOUDFLARED_BIN || "cloudflared", [
    "tunnel", "--no-autoupdate", "--url", target,
  ], { stdio: ["ignore", "pipe", "pipe"] }), private timeout = 45_000) {}

  snapshot(): DeviceConnection { return { ...this.state }; }

  start(target: string): DeviceConnection {
    if (this.target && this.target !== target) throw new WorkspaceError("Open the app at its original local address to connect devices.", 409);
    if (this.state.status === "ready" || this.state.status === "starting") return this.snapshot();
    this.target = target;
    this.state = { status: "starting" };
    let child: ChildProcess;
    try { child = this.launch(target); }
    catch (error) { this.fail(error); return this.snapshot(); }
    this.child = child;
    let output = "";
    let origin: string | undefined;
    let registered = false;
    const log = (chunk: Buffer | string) => {
      if (this.child !== child || this.state.status === "error") return;
      output = (output + chunk.toString()).slice(-16_384);
      origin ??= output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.(?:com|app)\b/)?.[0];
      registered ||= output.includes("Registered tunnel connection");
      // The address is printed before the connection is usable. Wait for registration.
      if (origin && registered) {
        clearTimeout(this.timer);
        this.state = { status: "ready", origin };
      }
    };
    child.stdout?.on("data", log);
    child.stderr?.on("data", log);
    child.once("error", error => { if (this.child === child) this.fail(error); });
    child.once("exit", (code, signal) => {
      if (this.child === child) this.fail(new Error(`cloudflared exited (${code ?? signal})`));
    });
    this.timer = setTimeout(() => { if (this.child === child) this.fail(new Error("cloudflared startup timed out")); }, this.timeout);
    this.timer.unref?.();
    return this.snapshot();
  }

  private fail(error: unknown) {
    console.error("[device-connection]", error instanceof Error ? error.message : error);
    clearTimeout(this.timer);
    this.killChild();
    this.state = { status: "error", error: connectionError };
  }

  private killChild() {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const forceStop = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 2_000);
      forceStop.unref?.();
      child.once("exit", () => clearTimeout(forceStop));
    }
  }

  stop() {
    clearTimeout(this.timer);
    this.killChild();
    this.state = { status: "idle" };
    this.target = null;
  }
}

const globals = globalThis as typeof globalThis & { managerConnection?: DeviceConnectionServer };
export function deviceConnectionServer() {
  if (!globals.managerConnection) {
    globals.managerConnection = new DeviceConnectionServer();
    process.once("exit", () => globals.managerConnection?.stop());
  }
  return globals.managerConnection;
}
