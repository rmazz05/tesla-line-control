import { assessIncidentRequest } from "@/lib/priority/assessment-service";
import { addIncident, getStationReadings } from "@/lib/priority/engine";
import type { AssessmentResponse } from "@/lib/priority/types";
import { applyCommand, createWorkspace, parseCommand, snapshot, tickWorkspace, WorkspaceError } from "@/lib/manager/session";
import { validWorkspaceKey, withWorkspace } from "@/lib/manager/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
const keyFor = (request: Request) => request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
function failure(error: unknown) {
  const status = error instanceof WorkspaceError ? error.status : error instanceof SyntaxError ? 400 : 503;
  return Response.json({ error: error instanceof WorkspaceError ? error.message : status === 400 ? "Invalid JSON request." : "Workspace could not be saved. Reconnect and try again." }, { status, headers });
}

export async function GET(request: Request) {
  try {
    const result = await withWorkspace(keyFor(request), workspace => {
      if (!workspace) throw new WorkspaceError("Workspace not found. Reconnect using the link from your other device.", 404);
      const now = Date.now();
      tickWorkspace(workspace, now);
      if (new URL(request.url).searchParams.get("desktop") === "1") workspace.desktopSeenAt = now;
      return { workspace, result: snapshot(workspace, now) };
    });
    return Response.json(result, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) throw new WorkspaceError("Send changes as JSON.", 415);
    const raw = await request.text();
    if (raw.length > 8192) throw new WorkspaceError("Request too large.", 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") throw new WorkspaceError("Invalid command.");
    const key = keyFor(request);
    if (body.create === true) {
      return Response.json(await withWorkspace(key, existing => {
        const workspace = existing ?? createWorkspace(Date.now());
        return { workspace, result: snapshot(workspace, Date.now()) };
      }), { headers });
    }
    if (!validWorkspaceKey(body.requestId ?? "") || !Number.isSafeInteger(body.run)) throw new WorkspaceError("Missing command identity or run.");
    const command = parseCommand(body.command);
    let assessment: AssessmentResponse | undefined;
    if (command.type === "report") {
      // Capture authoritative telemetry, then release the lock during the model
      // request. Other devices and the factory clock keep working.
      const context = await withWorkspace(key, workspace => {
        if (!workspace) throw new WorkspaceError("Workspace not found.", 404);
        if (workspace.run !== body.run) throw new WorkspaceError("The simulation was reset. Submit your report to the current run.", 409);
        tickWorkspace(workspace, Date.now());
        return { workspace, result: { duplicate: workspace.commands.includes(body.requestId), input: {
          report: command.report, stationId: command.stationId, minute: workspace.simulation.minute,
          telemetry: getStationReadings(workspace.simulation),
          activeIncidents: workspace.simulation.incidents.filter(i => i.status !== "resolved").slice(-40).map(i => ({ id: i.id, stationId: i.assessment.stationId, title: i.assessment.title })),
        } } };
      });
      if (!context.duplicate) {
        const result = await assessIncidentRequest(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context.input) }));
        if (!result.ok) throw new WorkspaceError("The report could not be assessed. Please retry.");
        assessment = await result.json() as AssessmentResponse;
      }
    }
    const result = await withWorkspace(key, workspace => {
      if (!workspace) throw new WorkspaceError("Workspace not found.", 404);
      // Check retry IDs before the epoch: retrying a successful reset is harmless.
      if (workspace.commands.includes(body.requestId)) return { workspace, result: snapshot(workspace, Date.now()) };
      if (workspace.run !== body.run) throw new WorkspaceError("The simulation was reset on another device. Review the current run and retry.", 409);
      tickWorkspace(workspace, Date.now());
      if (command.type === "report") {
        if (!assessment) throw new WorkspaceError("Assessment unavailable. Retry.", 503);
        workspace.simulation = addIncident(workspace.simulation, assessment.assessment, command.report, `REPORT-${body.requestId}`);
        workspace.notice = assessment.warning ?? "Incident assessed and added to the shared queue.";
      } else applyCommand(workspace, command);
      workspace.commands = [...workspace.commands.slice(-511), body.requestId];
      return { workspace, result: snapshot(workspace, Date.now()) };
    });
    return Response.json(result, { headers });
  } catch (error) { return failure(error); }
}
