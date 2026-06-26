import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tempest-attribution";

// The co-author line injected into every commit when attribution is enabled.
// Swap this email once the GitHub machine account is created.
export const COAUTHOR_LINE =
  "Co-authored-by: Tempest <tempestai.dev@gmail.com>";

let enabled = localStorage.getItem(STORAGE_KEY) === "true";
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function getAttribution(): boolean {
  return enabled;
}

export function setAttribution(value: boolean): void {
  enabled = value;
  localStorage.setItem(STORAGE_KEY, String(value));
  notify();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAttribution(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => enabled);
}
