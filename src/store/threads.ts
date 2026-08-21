import {
  dbListThreads, dbUpsertThread, dbDeleteThread,
  dbListThreadNodes, dbUpsertThreadNode, dbDeleteThreadNode,
  dbListThreadEdges, dbUpsertThreadEdge, dbDeleteThreadEdge,
  dbUpsertBranch,
  type DbThread, type DbThreadNode, type DbThreadEdge,
} from "../lib/db";
import { getBranch } from "./sessions";

// In-memory mirror of the threads / thread_nodes tables (canvas chat — see
// claude-docs/threads-plan.md). Unlike sessions.ts, threads are project-scoped
// and loaded lazily: loadProjectThreads(projectId) on project open,
// loadThreadNodes(threadId) on canvas open. Reads are synchronous against the
// maps; writes update the mirror synchronously and flush to SQLite async.
const _threads = new Map<string, DbThread>();     // threadId  -> thread
const _nodes = new Map<string, DbThreadNode>();   // nodeId    -> node
const _edges = new Map<string, DbThreadEdge>();   // edgeId    -> edge

const logErr = (op: string) => (e: unknown) => console.error(`[threads] ${op} failed:`, e);

// ── Hydration ────────────────────────────────────────────────────────────────
export async function loadProjectThreads(projectId: string): Promise<DbThread[]> {
  const rows = await dbListThreads(projectId);
  for (const t of rows) _threads.set(t.id, t);
  return rows;
}

export async function loadThreadNodes(threadId: string): Promise<DbThreadNode[]> {
  const rows = await dbListThreadNodes(threadId);
  for (const n of rows) _nodes.set(n.id, n);
  return rows;
}

export async function loadThreadEdges(threadId: string): Promise<DbThreadEdge[]> {
  const rows = await dbListThreadEdges(threadId);
  for (const e of rows) _edges.set(e.id, e);
  return rows;
}

// ── Reads (synchronous, against the mirror) ──────────────────────────────────
// Ties (equal sort_order) fall back to id so the order stays total.
function bySortOrder(a: DbThread, b: DbThread): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

export function getProjectThreads(projectId: string): DbThread[] {
  return [..._threads.values()].filter((t) => t.projectId === projectId).sort(bySortOrder);
}

export function getThread(id: string): DbThread | null {
  return _threads.get(id) ?? null;
}

export function getThreadNodes(threadId: string): DbThreadNode[] {
  return [..._nodes.values()].filter((n) => n.threadId === threadId);
}

export function getThreadNode(id: string): DbThreadNode | null {
  return _nodes.get(id) ?? null;
}

export function getThreadEdges(threadId: string): DbThreadEdge[] {
  return [..._edges.values()].filter((e) => e.threadId === threadId);
}

// Node-kind-specific payload lives in the `data` column as JSON. These two
// keep the parse/merge in one place so node components never touch the raw
// string (text body, chat backend/model/title, …).
export function getNodeData<T extends object = Record<string, unknown>>(id: string): T {
  const raw = _nodes.get(id)?.data;
  if (!raw) return {} as T;
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

export function patchNodeData(id: string, patch: object): void {
  const n = _nodes.get(id);
  if (!n) return;
  saveThreadNode({ ...n, data: JSON.stringify({ ...getNodeData(id), ...patch }) });
}

// Mirror-only patch — updates the in-memory node data without flushing to SQLite.
// For high-frequency live edits (e.g. a text node's body while typing) so a
// connected chat node reads the current text; the owner still persists on blur.
export function patchNodeDataLocal(id: string, patch: object): void {
  const n = _nodes.get(id);
  if (!n) return;
  _nodes.set(id, { ...n, data: JSON.stringify({ ...getNodeData(id), ...patch }) });
}

// ── Writes (sync mirror + async SQLite) ──────────────────────────────────────
export function saveThread(thread: DbThread): void {
  _threads.set(thread.id, thread);
  dbUpsertThread(thread).catch(logErr("save thread"));
}

export function deleteThread(id: string): void {
  _threads.delete(id);
  for (const [nid, n] of _nodes) if (n.threadId === id) _nodes.delete(nid);
  for (const [eid, e] of _edges) if (e.threadId === id) _edges.delete(eid);
  dbDeleteThread(id).catch(logErr("delete thread")); // DB cascade drops nodes + messages + edges
}

// Persist a node, chaining its parent thread first so the FK always holds — the
// two commands otherwise acquire the Rust connection mutex in unspecified order
// and the node's thread_id FK could be rejected (mirrors persistSession).
export function saveThreadNode(node: DbThreadNode): void {
  _nodes.set(node.id, node);
  const thread = _threads.get(node.threadId);
  let chain: Promise<unknown> = thread ? dbUpsertThread(thread) : Promise.resolve();
  // branch_id FK (foreign_keys=ON): the branch row a canvas session minted may
  // still be in-flight when the node persists — chain it first, like the thread.
  const branch = node.branchId ? getBranch(node.branchId) : undefined;
  if (branch) chain = chain.then(() => dbUpsertBranch(branch));
  chain.then(() => dbUpsertThreadNode(node)).catch(logErr("save thread node"));
}

export function deleteThreadNode(id: string): void {
  if (!_nodes.delete(id)) return;
  // DB cascades edges touching this node; drop them from the mirror too.
  for (const [eid, e] of _edges) if (e.source === id || e.target === id) _edges.delete(eid);
  dbDeleteThreadNode(id).catch(logErr("delete thread node"));
}

export function saveThreadEdge(edge: DbThreadEdge): void {
  _edges.set(edge.id, edge);
  const thread = _threads.get(edge.threadId);
  const chain = thread ? dbUpsertThread(thread) : Promise.resolve();
  chain.then(() => dbUpsertThreadEdge(edge)).catch(logErr("save thread edge"));
}

export function deleteThreadEdge(id: string): void {
  if (!_edges.delete(id)) return;
  dbDeleteThreadEdge(id).catch(logErr("delete thread edge"));
}
