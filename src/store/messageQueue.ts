import { useSyncExternalStore } from "react";

export interface QueueItem {
  id: string;
  text: string;
}

const queues = new Map<string, QueueItem[]>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: QueueItem[] = [];

function emit(sessionId: string) {
  const subs = listeners.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

function subscribe(sessionId: string, fn: () => void): () => void {
  let subs = listeners.get(sessionId);
  if (!subs) { subs = new Set(); listeners.set(sessionId, subs); }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) listeners.delete(sessionId);
  };
}

// All mutations replace the array reference — useSyncExternalStore uses
// Object.is on the snapshot, so in-place splice/push would go undetected.
export function enqueue(sessionId: string, text: string): void {
  const prev = queues.get(sessionId) ?? [];
  queues.set(sessionId, [...prev, { id: crypto.randomUUID(), text }]);
  emit(sessionId);
}

export function dequeue(sessionId: string): QueueItem | undefined {
  const q = queues.get(sessionId);
  if (!q?.length) return undefined;
  const [item, ...rest] = q;
  if (rest.length === 0) queues.delete(sessionId);
  else queues.set(sessionId, rest);
  emit(sessionId);
  return item;
}

export function removeFromQueue(sessionId: string, itemId: string): void {
  const q = queues.get(sessionId);
  if (!q) return;
  const next = q.filter((i) => i.id !== itemId);
  if (next.length === q.length) return;
  if (next.length === 0) queues.delete(sessionId);
  else queues.set(sessionId, next);
  emit(sessionId);
}

export function clearQueue(sessionId: string): void {
  if (queues.delete(sessionId)) emit(sessionId);
}

export function getQueue(sessionId: string): QueueItem[] {
  return queues.get(sessionId) ?? EMPTY;
}

export function useQueue(sessionId: string): QueueItem[] {
  return useSyncExternalStore(
    (fn) => subscribe(sessionId, fn),
    () => getQueue(sessionId),
    () => getQueue(sessionId),
  );
}
