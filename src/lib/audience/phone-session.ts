/** Small durable outbox: one in-flight switch and the latest intent per other switch. */
export type FaultChange = { requestId: string; faultId: string; active: boolean; round: number; version: number };
export type PhoneSession = { token: string; joined: boolean; name: string; queue: FaultChange[] };
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function parsePhoneSession(raw: string | null): PhoneSession | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value.token !== "string" || !/^[a-f0-9]{64}$/.test(value.token)) return null;
    const queue: FaultChange[] = Array.isArray(value.queue) ? value.queue.filter((item: FaultChange) => item && /^[a-f0-9]{64}$/.test(item.requestId) && typeof item.faultId === "string" && typeof item.active === "boolean" && Number.isSafeInteger(item.round) && item.round > 0 && Number.isSafeInteger(item.version) && item.version >= 0).slice(0, 4) : [];
    return { token: value.token, joined: value.joined === true, name: typeof value.name === "string" ? value.name.slice(0, 24) : "", queue };
  } catch { return null; }
}
export function readPhoneSession(key: string, stores: StorageLike[]): PhoneSession | null {
  for (const storage of stores) {
    try { const session = parsePhoneSession(storage.getItem(key)); if (session) return session; } catch { /* Storage can be blocked in a private browser. */ }
  }
  return null;
}
export function savePhoneSession(key: string, session: PhoneSession, stores: StorageLike[]): boolean {
  let saved = false;
  for (const storage of stores) {
    try { storage.setItem(key, JSON.stringify(session)); saved = true; } catch { /* Try the next available store; participation must still work. */ }
  }
  return saved;
}
export function enqueueFault(queue: FaultChange[], change: FaultChange): FaultChange[] {
  if (!queue.length) return [change];
  // Never replace a possibly delivered request. Its ID makes a retry harmless.
  const next = [queue[0], ...queue.slice(1).filter(item => item.faultId !== change.faultId), change];
  return next.map((item, index) => index === 0 ? item : { ...item, version: queue[0].version + index });
}
export function displayedFaults(confirmed: string[], queue: FaultChange[], round: number): string[] {
  const selected = new Set(confirmed);
  for (const change of queue) {
    if (change.round !== round) continue;
    if (change.active) selected.add(change.faultId); else selected.delete(change.faultId);
  }
  return [...selected];
}
