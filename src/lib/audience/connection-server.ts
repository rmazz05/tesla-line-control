import { spawn, type ChildProcess } from "node:child_process";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { DeviceConnectionServer } from "../manager/connection-server";
import { DemoError } from "./session";
import type { AudienceConnection } from "./connection-types";

function machineAddresses() {
  return ["localhost", "127.0.0.1", "[::1]", "::1", "::ffff:127.0.0.1", ...Object.values(networkInterfaces()).flatMap(entries => (entries ?? []).flatMap(entry => [entry.address, `[${entry.address}]`, `::ffff:${entry.address}`]))];
}
/** Accept this laptop's LAN URL as well as localhost, but never a browser-supplied upstream. */
export function audienceConnectionTarget(request: Request, addresses = machineAddresses()) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  let browser: URL;
  try { browser = new URL(origin ?? ""); } catch { throw new DemoError("Open the audience demo on the computer running it.", 403); }
  const forwarded = request.headers.get("x-forwarded-for");
  if (!["http:", "https:"].includes(browser.protocol) || browser.origin !== origin || browser.host !== host
    || !addresses.includes(browser.hostname) || ![...addresses, "0.0.0.0", "[::]"].includes(url.hostname) || url.port !== browser.port
    || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
    || request.headers.has("cf-ray") || request.headers.has("cf-connecting-ip")
    || (forwarded && !forwarded.split(",").every(value => addresses.includes(value.trim())))
    || (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host)) {
    throw new DemoError("Open the audience demo on the computer running it.", 403);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) throw new DemoError("Open this demo on the prepared laptop.", 503);
  return `http://127.0.0.1:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
}

function launchConnection(target: string): ChildProcess {
  // Desktop launches may not inherit Homebrew's PATH. The helper is already
  // installed on the presentation Mac; no shell command is constructed here.
  const binary = process.env.CLOUDFLARED_BIN || (process.platform === "darwin" ? (process.arch === "arm64" ? "/opt/homebrew/bin/cloudflared" : "/usr/local/bin/cloudflared") : "cloudflared");
  return spawn(/* turbopackIgnore: true */ binary, ["tunnel", "--no-autoupdate", "--url", target], { stdio: ["ignore", "pipe", "pipe"] });
}
export async function probeAudienceConnection(origin: string, instance: string) {
  // Only use a URL produced by cloudflared. Do not follow redirects to another app.
  if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.(com|app)$/.test(origin)) return false;
  try {
    const response = await fetch(`${origin}/api/demo/connection/probe?check=${randomUUID()}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return false;
    return (await response.json()).instance === instance;
  } catch { return false; }
}

type Connector = Pick<DeviceConnectionServer, "start" | "snapshot" | "stop">;
type Probe = (origin: string, instance: string) => Promise<boolean>;
/** One managed connection per app, independent of panel visibility and room resets. */
export class AudienceConnectionServer {
  readonly instance = randomUUID();
  private state: AudienceConnection = { status: "idle" };
  private target: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private checking: Promise<void> | null = null;
  private generation = 0;
  private restarts = 0;
  private failures = 0;
  private stopped = false;

  constructor(private connector: Connector = new DeviceConnectionServer(launchConnection), private probe: Probe = probeAudienceConnection, private interval = 10_000) {}

  snapshot(): AudienceConnection { return { ...this.state }; }
  start(target: string): AudienceConnection {
    if (this.target && this.target !== target) throw new DemoError("Use the original app window to prepare this audience room.", 409);
    this.stopped = false;
    this.target = target;
    if (this.state.status === "ready" || this.state.status === "starting") return this.snapshot();
    this.restarts = 0; this.failures = 0;
    this.state = { status: "starting", message: "Preparing the audience connection…" };
    this.connector.start(target);
    void this.check();
    return this.snapshot();
  }

  /** Deduplicate status checks and retries, including repeated QR openings. */
  check(): Promise<void> {
    if (this.checking) return this.checking;
    const running = this.verify().finally(() => { if (this.checking === running) this.checking = null; });
    this.checking = running;
    return running;
  }
  private async verify() {
    clearTimeout(this.timer);
    if (this.stopped || !this.target) return;
    const generation = this.generation;
    let delay = this.interval;
    try {
      const connection = this.connector.snapshot();
      if (connection.status === "ready") {
        const reachable = await this.probe(connection.origin, this.instance);
        if (this.stopped || generation !== this.generation) return;
        if (reachable) {
          this.state = { status: "ready", origin: connection.origin, checkedAt: Date.now() };
          this.failures = 0; this.restarts = 0;
        } else {
          this.failures++;
          // Keep the running helper and URL: it reconnects after Wi-Fi interruptions.
          this.state = this.failures < 5
            ? { status: "starting", message: "Checking the public connection to this laptop…" }
            : { status: "error", message: "The audience link is not reachable yet. Check this laptop’s internet connection. We’ll keep trying." };
          delay = 3000;
        }
      } else if (connection.status === "error" || connection.status === "idle") {
        if (this.restarts < 3) {
          this.restarts++;
          this.connector.start(this.target);
          this.state = { status: "starting", message: "Restoring the audience connection…" };
          delay = 3000 * this.restarts;
        } else {
          this.state = { status: "error", message: "The audience connection could not start. Check this laptop’s internet connection, then select Retry connection." };
          return;
        }
      } else {
        this.state = { status: "starting", message: "Preparing the audience connection…" };
        delay = 1000;
      }
    } catch {
      if (!this.stopped && generation === this.generation) this.state = { status: "error", message: "Could not check audience access. Keep this laptop online. We’ll try again." };
    } finally {
      if (!this.stopped && generation === this.generation && !(this.state.status === "error" && this.restarts >= 3)) {
        this.timer = setTimeout(() => { void this.check(); }, delay);
        this.timer.unref?.();
      }
    }
  }
  stop() {
    this.stopped = true; this.generation++;
    clearTimeout(this.timer); this.connector.stop();
    this.checking = null;
    this.target = null; this.state = { status: "idle" };
  }
}

const shared = globalThis as typeof globalThis & { audienceConnection?: AudienceConnectionServer };
export function audienceConnectionServer() {
  if (!shared.audienceConnection) {
    shared.audienceConnection = new AudienceConnectionServer();
    process.once("exit", () => shared.audienceConnection?.stop());
  }
  return shared.audienceConnection;
}
