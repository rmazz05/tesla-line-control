import { audienceConnectionServer, audienceConnectionTarget } from "@/lib/audience/connection-server";
import { DemoError } from "@/lib/audience/session";
import { validToken, withRoom } from "@/lib/audience/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

async function connection(request: Request, start: boolean) {
  try {
    const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!validToken(token)) throw new DemoError("Reconnect to your presenter room first.", 401);
    await withRoom(code, room => {
      if (!room) throw new DemoError("Create an audience room first.", 404);
      if (room.hostToken !== token) throw new DemoError("Only the presenter can prepare audience access.", 403);
      return { room, result: null };
    });
    // A participant cannot spawn helpers; a remote origin cannot choose an upstream.
    const server = audienceConnectionServer();
    return Response.json(start ? server.start(audienceConnectionTarget(request)) : server.snapshot(), { headers });
  } catch (error) {
    return Response.json({ status: "error", message: error instanceof DemoError ? error.message : "Could not prepare audience access. Select Retry connection." }, { status: error instanceof DemoError ? error.status : 503, headers });
  }
}
export function POST(request: Request) { return connection(request, true); }
export function GET(request: Request) { return connection(request, false); }
