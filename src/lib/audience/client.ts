"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSnapshot } from "./types";

export type Credentials = { code: string; token: string };
export function randomToken() {
  // getRandomValues also works on an ordinary HTTP LAN address; randomUUID does not.
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function demoRequest(credentials: Credentials, body?: Record<string, unknown>, signal?: AbortSignal): Promise<RoomSnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  try {
    const response = await fetch(`/api/demo?code=${credentials.code}`, {
      method: body ? "POST" : "GET", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${credentials.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify({ ...body, code: credentials.code }) } : {}),
    });
    // A tunnel can return an HTML error page. Keep that out of the phone UI.
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new RequestError(typeof result?.error === "string" ? result.error : "The connection is temporarily unavailable. Retrying…", response.status);
    if (!result || typeof result.code !== "string" || typeof result.revision !== "number") throw new RequestError("The connection is temporarily unavailable. Retrying…", 503);
    return result;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}
export function useRoom(credentials: Credentials | null, interval = 1500) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const accept = useCallback((next: RoomSnapshot) => {
    setSnapshot(previous => !previous || previous.code !== next.code || next.revision >= previous.revision ? next : previous);
    setConnected(true); setError(""); setErrorStatus(null);
  }, []);
  useEffect(() => {
    if (!credentials) return;
    let stopped = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      let terminal = false;
      try { const next = await demoRequest(credentials!, undefined, controller.signal); if (!stopped) { accept(next); failures = 0; } }
      catch (error) {
        if (!stopped) {
          failures++;
          const status = error instanceof RequestError ? error.status : null;
          terminal = status === 401 || status === 404;
          setConnected(false); setErrorStatus(status);
          setError(error instanceof RequestError ? error.message : "Connection interrupted. Reconnecting automatically…");
        }
      }
      inFlight = false;
      if (!stopped && !terminal) timer = setTimeout(poll, Math.min(8000, interval * Math.max(1, failures)) + Math.random() * 250);
    }
    const wake = () => { if (document.visibilityState !== "hidden") void poll(); };
    const offline = () => { setConnected(false); setError("You’re offline. Your changes will wait for a connection."); };
    refreshRef.current = () => { void poll(); };
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    void poll();
    return () => {
      stopped = true; controller.abort(); clearTimeout(timer); refreshRef.current = () => {};
      window.removeEventListener("online", wake); window.removeEventListener("offline", offline); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake);
    };
  }, [credentials, interval, accept]);
  return { snapshot, accept, error, errorStatus, connected, refresh };
}
