import { createRoom, DemoError, hostAction, joinRoom, roomSnapshot, selectFaults, tickRoom, toggleFault } from "@/lib/audience/session";
import { validToken, withRoom } from "@/lib/audience/store";
import type { HostAction } from "@/lib/audience/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
function tokenFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!validToken(token)) throw new DemoError("Your demo access is missing. Reopen this page to reconnect.", 401);
  return token;
}
function failure(error: unknown) {
  if (error instanceof DemoError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof SyntaxError) return Response.json({ error: "The request could not be read." }, { status: 400, headers });
  console.error("Audience demo storage/request failure:", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "The demo server could not save this change. Please retry." }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
    const token = tokenFor(request);
    const result = await withRoom(code, room => {
      if (!room) throw new DemoError("This room has expired or does not exist. Check the code with the presenter.", 404);
      const now = Date.now();
      const me = room.participants.find(person => person.token === token);
      if (token !== room.hostToken && !me) throw new DemoError("Join this room to claim your machine.", 401);
      if (token === room.hostToken || (room.phase === "live" && now - room.lastTick > 15_000)) tickRoom(room, now);
      if (me) me.lastSeen = now;
      return { room, result: roomSnapshot(room, token, now) };
    });
    return Response.json(result, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // JSON + bearer credentials are required; a cross-origin form cannot control a room.
    if (!request.headers.get("content-type")?.includes("application/json")) throw new DemoError("Send changes as JSON.", 415);
    const raw = await request.text();
    if (raw.length > 4096) throw new DemoError("This request is too large.", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || typeof body.code !== "string") throw new DemoError("Enter a room code.");
    const token = tokenFor(request);
    const code = body.code.toUpperCase();
    const result = await withRoom(code, existing => {
      const now = Date.now();
      let room = existing;
      if (body.action === "create") {
        if (room && room.hostToken !== token) throw new DemoError("This room code is taken. Create another room.", 409);
        room ??= createRoom(code, token, now);
      }
      if (!room) throw new DemoError("This room has expired or does not exist. Check the code with the presenter.", 404);
      if (body.action === "join") {
        if (typeof body.name !== "string") throw new DemoError("Enter your name.");
        joinRoom(room, token, body.name, now);
      } else if (body.action === "toggle") {
        if (typeof body.faultId !== "string" || typeof body.active !== "boolean" || typeof body.requestId !== "string" || !validToken(body.requestId) || !Number.isSafeInteger(body.round) || Number(body.round) < 1 || !Number.isSafeInteger(body.version) || Number(body.version) < 0) throw new DemoError("This fault selection is not valid.");
        if (room.phase === "live" && now - room.lastTick > 15_000) tickRoom(room, now);
        toggleFault(room, token, body.faultId, body.active, body.requestId, body.round as number, body.version as number, now);
      } else if (body.action === "select") {
        if (!Array.isArray(body.faults) || body.faults.some(value => typeof value !== "string") || !Number.isSafeInteger(body.sequence) || !Number.isSafeInteger(body.round) || Number(body.sequence) < 1) throw new DemoError("These fault selections are not valid.");
        if (room.phase === "live" && now - room.lastTick > 15_000) tickRoom(room, now);
        selectFaults(room, token, body.faults as string[], body.sequence as number, body.round as number, now);
      } else if (body.action !== "create") {
        if (room.hostToken !== token) throw new DemoError("Only the presenter can control this round.", 403);
        if (!["start", "pause", "reset", "end", "repair", "contain", "finish"].includes(String(body.action))) throw new DemoError("Unknown presenter action.");
        if (typeof body.requestId !== "string" || !validToken(body.requestId)) throw new DemoError("Missing action identifier.");
        tickRoom(room, now);
        hostAction(room, body.action as HostAction, typeof body.incidentId === "string" ? body.incidentId : undefined, body.requestId, now);
      }
      return { room, result: roomSnapshot(room, token, now) };
    });
    return Response.json(result, { headers });
  } catch (error) { return failure(error); }
}
