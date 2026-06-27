import { useSyncExternalStore } from "react";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

export const COAUTHOR_LINE =
  "Co-authored-by: Tempest <tempestai.dev@gmail.com>";

const listeners = new Set<() => void>();
function notify() { for (const fn of listeners) fn(); }

export function getAttribution(): boolean {
  return getRuntimeState().attribution;
}

export function setAttribution(value: boolean): void {
  setRuntimeState({ attribution: value });
  notify();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAttribution(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getRuntimeState().attribution,
    () => getRuntimeState().attribution,
  );
}
