import { CATALOG } from "@/lib/priority/catalog";
import { STATIONS } from "@/lib/priority/config";
import {
  MAX_REQUEST_BYTES,
  assessOffline,
  assessmentInstructions,
  assessmentSchema,
  groundModelAssessment,
  parseAssessmentRequest,
  parseModelAssessment,
} from "@/lib/priority/assessment";
import type { AssessmentResponse } from "@/lib/priority/types";


const DEFAULT_MODEL = "gpt-6-astra";
const TIMEOUT_MS = 25_000;
const stations = STATIONS.map((station) => ({ ...station, ratePerHour: station.ratePerMinute * 60 }));

function modelName(): string {
  const configured = process.env.OPENAI_MODEL?.trim();
  return configured && /^[a-zA-Z0-9_.:-]{1,100}$/.test(configured) ? configured : DEFAULT_MODEL;
}

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function unavailableWarning(status: number): string {
  const reason = status === 401 ? "OpenAI authentication failed; check the server OPENAI_API_KEY."
    : status === 403 ? "The OpenAI project does not have access to this request."
    : status === 404 ? "The configured OpenAI model is unavailable; check OPENAI_MODEL and project access."
    : status === 429 ? "OpenAI rate or quota limit reached; check project quota and retry."
    : status >= 500 ? "The OpenAI service is temporarily unavailable."
    : "OpenAI could not accept this assessment request; check the model configuration.";
  return `${reason} An offline catalog review was used; no live AI diagnosis was produced.`;
}

export async function getAssessmentStatus() {
  return reply({ configured: Boolean(process.env.OPENAI_API_KEY?.trim()), model: modelName() });
}

async function readBoundedJSON(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) throw new RangeError("body");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RangeError("body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function outputText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (response.status !== "completed" || !Array.isArray(response.output)) return null;
  const content = response.output.filter((item) => item.type === "message").flatMap((item) => Array.isArray(item.content) ? item.content : []);
  if (content.some((item) => item.type === "refusal")) return null;
  const texts = content.filter((item) => item.type === "output_text" && typeof item.text === "string");
  if (texts.length !== 1 || texts[0].text!.length > 20_000) return null;
  return texts[0].text!;
}

export async function assessIncidentRequest(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return reply({ error: "Send the incident as application/json." }, 415);
  }
  let raw: unknown;
  try {
    raw = await readBoundedJSON(request);
  } catch (error) {
    return reply({ error: error instanceof RangeError ? "Incident request is too large." : "Incident request is not valid JSON." }, error instanceof RangeError ? 413 : 400);
  }
  const input = parseAssessmentRequest(raw, stations);
  if (!input) return reply({ error: "Provide a 5–2400 character report, a valid station, and bounded simulation telemetry." }, 400);

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return reply(assessOffline(input, CATALOG));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const model = modelName();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({
        model,
        store: false,
        // Low reasoning is documented for the default model. Leave overrides to
        // their own defaults rather than sending an unsupported model parameter.
        ...(model === DEFAULT_MODEL ? { reasoning: { effort: "low" } } : {}),
        max_output_tokens: 2400,
        instructions: assessmentInstructions(CATALOG, stations),
        input: [{ role: "user", content: JSON.stringify(input) }],
        text: { format: { type: "json_schema", name: "incident_assessment", strict: true, schema: assessmentSchema(CATALOG) } },
      }),
    });
    if (!response.ok) {
      return reply(assessOffline(input, CATALOG, unavailableWarning(response.status)));
    }
    const output = outputText(await response.json());
    const assessed = output ? parseModelAssessment(JSON.parse(output), CATALOG) : null;
    if (!assessed) {
      return reply(assessOffline(input, CATALOG, "OpenAI returned no usable assessment. An offline catalog review was used; no live AI diagnosis was accepted."));
    }
    const result: AssessmentResponse = { assessment: groundModelAssessment(input, assessed, CATALOG), mode: "openai", warning: null };
    return reply(result);
  } catch {
    return reply(assessOffline(input, CATALOG, controller.signal.aborted
      ? "OpenAI assessment timed out. An offline catalog review was used; no live AI diagnosis was produced."
      : "Live OpenAI assessment could not be completed. An offline catalog review was used; no live AI diagnosis was accepted."));
  } finally {
    clearTimeout(timeout);
  }
}
