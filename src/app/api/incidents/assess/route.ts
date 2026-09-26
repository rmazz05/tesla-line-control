import { getAssessmentStatus, assessIncidentRequest } from "@/lib/priority/assessment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getAssessmentStatus;
export const POST = assessIncidentRequest;
