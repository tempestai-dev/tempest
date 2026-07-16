export type SplitDir = "h" | "v";
export interface SplitLeaf   { type: "leaf";  sessionId: string; }
export interface SplitBranch { type: "split"; id: string; dir: SplitDir; ratio: number; first: PaneNode; second: PaneNode; }
export type PaneNode = SplitLeaf | SplitBranch;
export interface PaneRect    { top: number; left: number; width: number; height: number; }

export function paneSessionIds(n: PaneNode): string[] {
  if (n.type === "leaf") return [n.sessionId];
  return [...paneSessionIds(n.first), ...paneSessionIds(n.second)];
}

export function replaceLeaf(n: PaneNode, id: string, repl: PaneNode): PaneNode | null {
  if (n.type === "leaf") return n.sessionId === id ? repl : null;
  const a = replaceLeaf(n.first, id, repl); if (a) return { ...n, first: a } as SplitBranch;
  const b = replaceLeaf(n.second, id, repl); if (b) return { ...n, second: b } as SplitBranch;
  return null;
}

export function removeLeaf(n: PaneNode, id: string): PaneNode | null {
  if (n.type === "leaf") return null;
  if (n.first.type  === "leaf" && n.first.sessionId  === id) return n.second;
  if (n.second.type === "leaf" && n.second.sessionId === id) return n.first;
  const a = removeLeaf(n.first, id);  if (a !== null) return { ...n, first: a }  as SplitBranch;
  const b = removeLeaf(n.second, id); if (b !== null) return { ...n, second: b } as SplitBranch;
  return null;
}

export function patchRatio(n: PaneNode, splitId: string, ratio: number): PaneNode {
  if (n.type === "leaf") return n;
  const b = n as SplitBranch;
  if (b.id === splitId) return { ...b, ratio };
  return { ...b, first: patchRatio(b.first, splitId, ratio), second: patchRatio(b.second, splitId, ratio) };
}

export function computeRects(n: PaneNode, r: PaneRect = { top: 0, left: 0, width: 1, height: 1 }): Map<string, PaneRect> {
  if (n.type === "leaf") return new Map([[n.sessionId, r]]);
  const { dir, ratio } = n as SplitBranch;
  const a: PaneRect = dir === "v" ? { ...r, width: r.width * ratio }                              : { ...r, height: r.height * ratio };
  const b: PaneRect = dir === "v" ? { ...r, left: r.left + r.width * ratio, width: r.width * (1 - ratio) } : { ...r, top: r.top + r.height * ratio, height: r.height * (1 - ratio) };
  return new Map([...computeRects(n.first, a), ...computeRects(n.second, b)]);
}

export interface HandleInfo { id: string; dir: SplitDir; ratio: number; parentRect: PaneRect; }
export function collectHandles(n: PaneNode, r: PaneRect = { top: 0, left: 0, width: 1, height: 1 }): HandleInfo[] {
  if (n.type === "leaf") return [];
  const { id, dir, ratio } = n as SplitBranch;
  const a: PaneRect = dir === "v" ? { ...r, width: r.width * ratio }                              : { ...r, height: r.height * ratio };
  const b: PaneRect = dir === "v" ? { ...r, left: r.left + r.width * ratio, width: r.width * (1 - ratio) } : { ...r, top: r.top + r.height * ratio, height: r.height * (1 - ratio) };
  return [{ id, dir, ratio, parentRect: r }, ...collectHandles(n.first, a), ...collectHandles(n.second, b)];
}
