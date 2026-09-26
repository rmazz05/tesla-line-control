import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("the running presentation retains its assets when a new build replaces .next", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "audience-launcher-test-"));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await mkdir(path.join(fixture, ".next/standalone"), { recursive: true });
    await mkdir(path.join(fixture, ".next/static"), { recursive: true });
    await mkdir(path.join(fixture, "public"));
    await writeFile(path.join(fixture, ".next/BUILD_ID"), "test-build");
    await writeFile(path.join(fixture, ".next/static/asset.txt"), "working presentation asset");
    await writeFile(path.join(fixture, ".next/standalone/package.json"), '{"type":"module"}');
    await writeFile(path.join(fixture, ".next/standalone/server.js"), `
      import http from 'node:http';
      import { readFileSync } from 'node:fs';
      const server = http.createServer((request, response) => response.end(readFileSync(new URL('./.next/static/asset.txt', import.meta.url))));
      server.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('TEST_PORT=' + server.address().port));
      process.on('SIGTERM', () => server.close(() => process.exit(0)));
    `);
    child = spawn(process.execPath, [path.resolve("scripts/start-audience-demo.mjs")], { cwd: fixture, env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    const exit = once(child, "exit");
    const port = await new Promise<number>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Launcher did not become ready")), 10000);
      child!.stdout!.on("data", chunk => {
        output += chunk.toString(); const match = output.match(/TEST_PORT=(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child!.once("exit", code => { clearTimeout(timer); reject(new Error(`Launcher stopped: ${code}`)); });
    });
    const endpoint = `http://127.0.0.1:${port}/`;
    assert.equal(await (await fetch(endpoint)).text(), "working presentation asset");
    await rm(path.join(fixture, ".next"), { recursive: true, force: true });
    assert.equal(await (await fetch(endpoint)).text(), "working presentation asset");
    child.kill("SIGTERM"); await exit;
  } finally {
    child?.kill("SIGTERM");
    await rm(fixture, { recursive: true, force: true });
  }
});
