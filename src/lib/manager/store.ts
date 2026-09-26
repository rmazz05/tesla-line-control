import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WorkspaceError } from "./session";
import type { ManagerWorkspace } from "./types";
import { hasSharedDatabase, withSharedState } from "../shared-state";

export const validWorkspaceKey = (key: string) => /^[a-f0-9]{64}$/.test(key);
const globalStore = globalThis as typeof globalThis & { managerQueues?: Map<string, Promise<void>> };
const queues = globalStore.managerQueues ??= new Map<string, Promise<void>>();

/** Postgres on Vercel; persistent files for the local single-server demo. */
export async function withWorkspace<T>(key: string, update: (value: ManagerWorkspace | null) => { workspace: ManagerWorkspace; result: T }): Promise<T> {
  if (!validWorkspaceKey(key)) throw new WorkspaceError("Connect this device to a manager workspace first.", 401);
  if (hasSharedDatabase()) return withSharedState<ManagerWorkspace, T>("manager", key, workspace => {
    const next = update(workspace);
    next.workspace.revision++;
    if (next.result && typeof next.result === "object" && "revision" in next.result) (next.result as { revision: number }).revision = next.workspace.revision;
    return { state: next.workspace, result: next.result };
  });
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) throw new WorkspaceError("Shared storage is not configured. Set DATABASE_URL before deploying.", 503);
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(key, current);
  await previous;
  const directory = process.env.MANAGER_DATA_DIR || path.join(process.cwd(), ".manager-workspaces");
  const filename = path.join(directory, `${key}.json`);
  const lock = filename + ".lock";
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let locked = false;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + 6_000;
    while (!locked) {
      try { await mkdir(lock); locked = true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (Date.now() > deadline) throw new WorkspaceError("Workspace busy. Try again.", 503);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    let workspace: ManagerWorkspace | null = null;
    try { workspace = JSON.parse(await readFile(filename, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const next = update(workspace);
    next.workspace.revision++;
    if (next.result && typeof next.result === "object" && "revision" in next.result) (next.result as { revision: number }).revision = next.workspace.revision;
    await writeFile(temporary, JSON.stringify(next.workspace), { mode: 0o600 });
    await rename(temporary, filename);
    return next.result;
  } finally {
    if (locked) { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}
