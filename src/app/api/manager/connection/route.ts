import { deviceConnectionServer, localConnectionTarget } from "@/lib/manager/connection-server";
import { withWorkspace } from "@/lib/manager/store";
import { WorkspaceError } from "@/lib/manager/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

async function connection(request: Request, start: boolean) {
  try {
    const target = localConnectionTarget(request);
    const key = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    await withWorkspace(key, workspace => {
      if (!workspace) throw new WorkspaceError("Connect to a manager workspace first.", 404);
      return { workspace, result: null };
    });
    const server = deviceConnectionServer();
    const result = start ? server.start(target) : server.snapshot();
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof WorkspaceError ? error.message : "Could not prepare the connection. Please try again." }, {
      status: error instanceof WorkspaceError ? error.status : 503, headers,
    });
  }
}

export function POST(request: Request) { return connection(request, true); }
export function GET(request: Request) { return connection(request, false); }
