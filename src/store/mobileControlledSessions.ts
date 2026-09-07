import { useSyncExternalStore } from "react";

// Which sessions are currently being driven by at least one mobile peer.
// Ref-counted so multiple phones on the same session don't lose the lock
// when one of them unsubscribes.
//
// The desktop's terminal pane gates its fit/resize + keyboard input on this,
// so a phone-set PTY size isn't clobbered by a click on the desktop pane and
// two people don't type into the same PTY at once.

const counts = new Map<string, number>();
const sessionListeners = new Map<string, Set<() => void>>();
const takeBackListeners = new Set<(sessionId: string) => void>();

function emit(sessionId: string) {
  const subs = sessionListeners.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function addController(sessionId: string) {
  const prev = counts.get(sessionId) ?? 0;
  counts.set(sessionId, prev + 1);
  if (prev === 0) emit(sessionId);
}

export function removeController(sessionId: string) {
  const prev = counts.get(sessionId) ?? 0;
  if (prev <= 1) {
    counts.delete(sessionId);
    if (prev === 1) emit(sessionId);
    return;
  }
  counts.set(sessionId, prev - 1);
}

export function isControlled(sessionId: string): boolean {
  return (counts.get(sessionId) ?? 0) > 0;
}

// Desktop reclaim. Force-clears every mobile controller for this session and
// fans out to the bridge so it can notify the phone peers and stop their
// stream. Fit-back to desktop dims is the pane's job.
export function takeBack(sessionId: string) {
  const had = (counts.get(sessionId) ?? 0) > 0;
  counts.delete(sessionId);
  if (had) emit(sessionId);
  for (const fn of takeBackListeners) fn(sessionId);
}

export function onTakeBack(fn: (sessionId: string) => void): () => void {
  takeBackListeners.add(fn);
  return () => { takeBackListeners.delete(fn); };
}

export function useIsMobileControlled(sessionId: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      let subs = sessionListeners.get(sessionId);
      if (!subs) { subs = new Set(); sessionListeners.set(sessionId, subs); }
      subs.add(fn);
      return () => {
        subs!.delete(fn);
        if (subs!.size === 0) sessionListeners.delete(sessionId);
      };
    },
    () => isControlled(sessionId),
  );
}
