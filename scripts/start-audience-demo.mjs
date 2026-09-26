import { networkInterfaces, tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const publiclyShared = process.argv.includes("--public");
const port = process.env.PORT || (publiclyShared ? "3101" : "3001");
const cloudflared = process.env.CLOUDFLARED_BIN || "cloudflared";
if (!existsSync(".next/standalone/server.js")) {
  console.error("Run npm run build first. Use the production build for the audience presentation.");
  process.exit(1);
}
if (publiclyShared && spawnSync(cloudflared, ["--version"], { stdio: "ignore" }).status !== 0) {
  console.error("Install cloudflared first (on macOS: brew install cloudflared), then run npm run share again.");
  process.exit(1);
}
console.log(`\nManager workspace: http://localhost:${port}/`);
console.log(`Audience demo presenter: http://localhost:${port}/demo`);
if (!publiclyShared) {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) console.log(`Wi-Fi / network address: http://${entry.address}:${port}/demo`);
    }
  }
  console.log("\nOpen the audience QR panel. The app prepares phone access automatically.");
} else {
  console.log("\nStarting a public HTTPS link. Keep this process and laptop running.");
}
// Serve a complete snapshot. A later next build replaces .next and must not
// remove JavaScript, fonts or models from a presentation that is already running.
const runtime = await mkdtemp(path.join(tmpdir(), "line-priority-runtime-"));
try {
  const buildId = await readFile(".next/BUILD_ID", "utf8");
  if (existsSync(".next/lock")) throw new Error("A build is still running. Wait for it to finish before starting the demo.");
  await cp(".next/standalone", runtime, { recursive: true });
  await cp("public", path.join(runtime, "public"), { recursive: true });
  await cp(".next/static", path.join(runtime, ".next/static"), { recursive: true });
  if (existsSync(".next/lock") || buildId !== await readFile(".next/BUILD_ID", "utf8")) throw new Error("The build changed while preparing the demo. Start it again after the build finishes.");
} catch (error) {
  await rm(runtime, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : "Could not prepare the demo files.");
  process.exit(1);
}
const child = spawn(process.execPath, [path.join(runtime, "server.js")], { stdio: ["inherit", "pipe", "pipe"], env: {
  ...process.env, PORT: port, HOSTNAME: publiclyShared ? "127.0.0.1" : "0.0.0.0",
  DEMO_DATA_DIR: path.resolve(process.env.DEMO_DATA_DIR || ".audience-demo"),
  // Standalone changes cwd; keep both stores stable across builds and launch modes.
  MANAGER_DATA_DIR: path.resolve(process.env.MANAGER_DATA_DIR || ".manager-workspaces"),
} });
let tunnel;
let stopping = false;
let startupOutput = "";
function stop(code) {
  if (stopping) return;
  stopping = true;
  tunnel?.kill("SIGTERM");
  child.kill("SIGTERM");
  process.exitCode = code;
}
function startTunnel() {
  tunnel = spawn(cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let announced = false;
  function log(chunk) {
    process.stdout.write(chunk);
    output = (output + chunk.toString()).slice(-8192);
    const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.(?:com|app)/)?.[0];
    if (url && !announced) {
      announced = true;
      console.log(`\nPublic manager workspace: ${url}/\nPublic audience demo: ${url}/demo\n\nOpen the public manager address on your PC, then Connect devices and scan the QR with any internet-connected phone.\nFor an existing local workspace, paste this public address into Connect devices to keep the same workspace.\nThe URL changes when this command restarts. Press Ctrl+C to stop sharing.\n`);
    }
  }
  tunnel.stdout.on("data", log);
  tunnel.stderr.on("data", log);
  tunnel.on("error", error => { console.error(`Could not start the public tunnel: ${error.message}`); stop(1); });
  tunnel.on("exit", code => { if (!stopping) { console.error("Public tunnel stopped."); stop(code || 1); } });
}
function serverLog(chunk, stream) {
  stream.write(chunk);
  startupOutput = (startupOutput + chunk.toString()).slice(-1024);
  // Start sharing only after this child has successfully bound its port. A
  // conflicting port must never cause us to expose another local application.
  if (publiclyShared && !tunnel && !stopping && startupOutput.includes("Ready in")) startTunnel();
}
child.stdout.on("data", chunk => serverLog(chunk, process.stdout));
child.stderr.on("data", chunk => serverLog(chunk, process.stderr));
child.on("error", error => { console.error(error.message); stop(1); void rm(runtime, { recursive: true, force: true }); });
child.on("exit", code => { if (!stopping) stop(code ?? 0); void rm(runtime, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
