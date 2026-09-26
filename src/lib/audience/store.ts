import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DemoError } from "./session";
import type { AudienceRoom } from "./types";
import { hasSharedDatabase, withSharedState } from "../shared-state";

const ROOM_TTL = 12 * 60 * 60 * 1000;
export const validCode = (code: string) => /^[A-F0-9]{6}$/.test(code);
export const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
const shared = globalThis as typeof globalThis & { audienceRoomQueues?: Map<string, Promise<void>> };
const queues = shared.audienceRoomQueues ??= new Map<string, Promise<void>>();

/** Postgres on Vercel; atomic per-room files for the local single-server demo. */
export async function withRoom<T>(code: string, update: (room: AudienceRoom | null) => { room: AudienceRoom; result: T }): Promise<T> {
  if (!validCode(code)) throw new DemoError("That room code is not valid.");
  if (hasSharedDatabase()) return withSharedState<AudienceRoom, T>("audience", code, room => {
    if (room && Date.now() - room.updatedAt > ROOM_TTL) room = null;
    const next = update(room);
    next.room.updatedAt = Date.now();
    next.room.revision++;
    if (typeof next.result === "object" && next.result !== null && "revision" in next.result) (next.result as { revision: number }).revision = next.room.revision;
    return { state: next.room, result: next.result };
  });
  // Queue same-process bursts instead of making 120 join requests spin on disk.
  const previous = queues.get(code) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(code, current);
  await previous;
  try { return await withLockedRoom(code, update); }
  finally { release(); if (queues.get(code) === current) queues.delete(code); }
}

async function withLockedRoom<T>(code: string, update: (room: AudienceRoom | null) => { room: AudienceRoom; result: T }): Promise<T> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) throw new DemoError("Shared storage is not configured. Set DATABASE_URL before deploying.", 503);
  const directory = process.env.DEMO_DATA_DIR || path.join(process.cwd(), ".audience-demo");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, `${code}.json`);
  const lock = filename + ".lock";
  const deadline = Date.now() + 6_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Recover locks left by a terminated server. Normal requests take milliseconds.
      try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (Date.now() > deadline) throw new DemoError("The demo server is busy. Retrying will preserve your machine.", 503);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    let room: AudienceRoom | null = null;
    try { room = JSON.parse(await readFile(filename, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (room && Date.now() - room.updatedAt > ROOM_TTL) room = null;
    const next = update(room);
    next.room.updatedAt = Date.now();
    next.room.revision += 1;
    // Snapshot revision describes the committed write.
    if (typeof next.result === "object" && next.result !== null && "revision" in next.result) (next.result as { revision: number }).revision = next.room.revision;
    await writeFile(temporary, JSON.stringify(next.room), { mode: 0o600 });
    await rename(temporary, filename);
    return next.result;
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
