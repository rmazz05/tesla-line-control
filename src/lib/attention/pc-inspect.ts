export const INSPECT_CHANNEL = "tesla-line-control-inspect";

export interface InspectMessage {
  type: "inspect";
  incidentId: string;
}

export function isInspectMessage(value: unknown): value is InspectMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<InspectMessage>;
  return message.type === "inspect" && typeof message.incidentId === "string" && message.incidentId.length > 0;
}

/** Ask another window on this computer to open the incident. Returns false when the browser has no channel. */
export function requestPcInspect(incidentId: string): boolean {
  if (typeof BroadcastChannel === "undefined") return false;
  const channel = new BroadcastChannel(INSPECT_CHANNEL);
  const message: InspectMessage = { type: "inspect", incidentId };
  channel.postMessage(message);
  channel.close();
  return true;
}
