import { useSyncExternalStore } from "react";

export interface ReviewComment {
  id: string;
  file: string;
  startLineKey: string;
  endLineKey: string;
  startLine: number;
  endLine: number;
  quote: string;
  body: string;
}

const store = new Map<string, ReviewComment[]>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: ReviewComment[] = [];

function emit(cwd: string) {
  const subs = listeners.get(cwd);
  if (subs) for (const fn of subs) fn();
}

function subscribe(cwd: string, fn: () => void): () => void {
  let subs = listeners.get(cwd);
  if (!subs) { subs = new Set(); listeners.set(cwd, subs); }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) listeners.delete(cwd);
  };
}

export function addComment(cwd: string, comment: Omit<ReviewComment, "id">): void {
  const existing = store.get(cwd) ?? [];
  store.set(cwd, [...existing, { ...comment, id: crypto.randomUUID() }]);
  emit(cwd);
}

export function removeComment(cwd: string, id: string): void {
  const existing = store.get(cwd);
  if (!existing) return;
  const next = existing.filter(c => c.id !== id);
  if (next.length === existing.length) return;
  if (next.length === 0) store.delete(cwd); else store.set(cwd, next);
  emit(cwd);
}

export function clearComments(cwd: string): void {
  if (store.delete(cwd)) emit(cwd);
}

export function getComments(cwd: string): ReviewComment[] {
  return store.get(cwd) ?? EMPTY;
}

export function useComments(cwd: string): ReviewComment[] {
  return useSyncExternalStore(
    (fn) => subscribe(cwd, fn),
    () => getComments(cwd),
    () => getComments(cwd),
  );
}

export function composeMessage(comments: ReviewComment[]): string {
  if (comments.length === 0) return "";
  const lines: string[] = [
    `I reviewed the diff and left ${comments.length} inline comment${comments.length !== 1 ? "s" : ""}:`,
    "",
  ];
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const list = byFile.get(c.file) ?? [];
    list.push(c);
    byFile.set(c.file, list);
  }
  for (const [file, fc] of byFile) {
    for (const c of fc) {
      const lineLabel = c.startLine === c.endLine
        ? `line ${c.startLine}`
        : `lines ${c.startLine}–${c.endLine}`;
      lines.push(`${file} · ${lineLabel}`);
      if (c.quote.trim()) {
        for (const ql of c.quote.trimEnd().split("\n")) lines.push(`> ${ql}`);
      }
      lines.push(c.body);
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
