"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ManagerCommand, ManagerSnapshot } from "./types";
import { getLineActivity, type LineActivity } from "../priority/activity";

const STORAGE_KEY = "line-priority-manager-workspace";
export function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

export function useManagerWorkspace(desktop: boolean) {
  const [state, setState] = useState<ManagerSnapshot | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<LineActivity | null>(null);
  const latest = useRef<ManagerSnapshot | null>(null);
  const desktopRef = useRef(desktop);
  const inFlight = useRef(false);
  useEffect(() => { desktopRef.current = desktop; }, [desktop]);
  const accept = useCallback((value: ManagerSnapshot) => {
    if (latest.current && value.revision < latest.current.revision) return;
    if (latest.current?.run === value.run) {
      const activity = getLineActivity(latest.current.simulation, value.simulation);
      if (activity) setActivity(activity);
    } else setActivity(null);
    latest.current = value;
    setState(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const shared = hash.get("workspace");
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* link works without storage */ }
    const valid = (value: string | null) => !!value && /^[a-f0-9]{64}$/.test(value);
    const workspaceKey = valid(shared) ? shared! : valid(saved) ? saved! : randomKey();
    // Creating with a saved owner capability is idempotent, including React's
    // development remount before the first creation request has completed.
    const create = !valid(shared) || shared === saved;
    try { localStorage.setItem(STORAGE_KEY, workspaceKey); } catch { /* keep this session */ }
    // Keep the capability in the fragment (never sent in navigation/referrers).
    window.history.replaceState(null, "", `${window.location.pathname}#workspace=${workspaceKey}`);
    async function poll(first = false) {
      try {
        const response = await fetch(`/api/manager?desktop=${desktopRef.current ? "1" : "0"}`, {
          method: first && create ? "POST" : "GET", cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${workspaceKey}`, "Content-Type": "application/json" },
          ...(first && create ? { body: JSON.stringify({ create: true }) } : {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Connection lost.");
        if (!cancelled) { setKey(workspaceKey); accept(data); setError(null); }
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Connection lost.");
      } finally { if (!cancelled) timer = setTimeout(() => void poll(first && create && !latest.current), 1000); }
    }
    void poll(true);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [accept]);

  const send = useCallback(async (command: ManagerCommand) => {
    if (!latest.current || !key) throw new Error("Workspace is still connecting. Try again in a moment.");
    if (inFlight.current) throw new Error("A workspace change is still being saved. Try again when it finishes.");
    inFlight.current = true;
    setBusy(true);
    try {
      const body = JSON.stringify({ command, run: latest.current.run, requestId: randomKey() });
      let response: Response;
      try { response = await fetch("/api/manager", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body }); }
      catch { response = await fetch("/api/manager", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body }); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save change.");
      accept(data);
      return data as ManagerSnapshot;
    } finally { inFlight.current = false; setBusy(false); }
  }, [accept, key]);
  return { state, key, error, busy, send, activity };
}
