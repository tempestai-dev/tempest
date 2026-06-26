import { useSyncExternalStore } from "react";

// Ephemeral per-session "work done" detection state.
// Not persisted — it only reflects live agent activity and resets on app restart.
export type WorkState = "idle" | "working" | "done";

const states = new Map<string, WorkState>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getWorkState(sessionId: string): WorkState {
  return states.get(sessionId) ?? "idle";
}

export function setWorkState(sessionId: string, state: WorkState): void {
  if (getWorkState(sessionId) === state) return;
  if (state === "idle") {
    states.delete(sessionId);
  } else {
    states.set(sessionId, state);
  }
  emit();
}

export function clearWorkState(sessionId: string): void {
  if (states.delete(sessionId)) emit();
}

// Subscribe a component to a single session's work state.
export function useWorkState(sessionId: string): WorkState {
  return useSyncExternalStore(
    subscribe,
    () => getWorkState(sessionId),
    () => getWorkState(sessionId)
  );
}

// Subscribe to any work state change and return an ever-incrementing version.
// Use in components that need to re-sort or re-count across all sessions.
export function useWorkStateVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
