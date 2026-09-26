import { audienceConnectionServer } from "@/lib/audience/connection-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public reachability proof. This contains no room, credential or participant data.
export function GET() {
  return Response.json({ instance: audienceConnectionServer().instance }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
