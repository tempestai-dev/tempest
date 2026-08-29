// @tempest/core — wire types + protocol envelope shared between desktop
// (loopback dial) and mobile (over the cloudflared tunnel).
//
// This is the ONE definition of what a mobile companion sees. The desktop's
// internal stores (WorktreeSession, DbProject, agent hooks 3-state) project
// into these summaries at the RPC boundary — never the other way around.

// ── Domain summaries (sent over the wire) ─────────────────────────────────

export type SessionStatus = "idle" | "working" | "waiting" | "done";

export interface SessionSummary {
  id: string;
  name: string;
  /** CLI command e.g. "claude"; undefined = plain terminal. */
  agent?: string;
  projectId: string;
  branchId?: string;
  parentSessionId?: string;
  closed: boolean;
  placement: "tab" | "canvas";
  createdAt: string;
  /** Derived from agent-hooks / PTY heuristics on desktop. */
  status: SessionStatus;
  /** Count of items currently in the session's queue. */
  queueLength: number;
  /** True if a tool call is pending approval on this session. */
  needsPermission: boolean;
}

export interface WorktreeSummary {
  path: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  /** Disk-scanned worktrees (.tempest/*), in the desktop sidebar's order. */
  worktrees: WorktreeSummary[];
  /** True if the project path is a git repo (drives the "main" root row). */
  isGit: boolean;
}

export interface BranchSummary {
  id: string;
  projectId: string;
  path: string;
  name: string;
}

export interface QueueItem {
  id: string;
  text: string;
}

export interface RecentSummary {
  /** Filesystem path — stable identity across sessions. */
  path: string;
  name: string;
  /** ISO timestamp of the last open. */
  lastOpened: string;
}

export interface PermissionRequest {
  sessionId: string;
  agent: string;
  tool: string;
  detail: string;
  createdAt: string;
}

// ── RPC envelope ──────────────────────────────────────────────────────────
//
// Every frame on the wire (after E2EE decrypt) is one of:
//   { id, method, params }        — request
//   { id, result }                — response OK
//   { id, error: { code, msg } }  — response error
//   { event, payload }            — server-push (no id, fire-and-forget)

export interface RpcRequest<M extends RpcMethod = RpcMethod> {
  id: string;
  method: M;
  params: RpcParams[M];
}

export interface RpcResponseOk<M extends RpcMethod = RpcMethod> {
  id: string;
  result: RpcResult[M];
}

export interface RpcResponseErr {
  id: string;
  error: { code: string; msg: string };
}

export type RpcResponse<M extends RpcMethod = RpcMethod> =
  | RpcResponseOk<M>
  | RpcResponseErr;

export interface RpcEvent<E extends ServerEvent = ServerEvent> {
  event: E;
  payload: ServerEventPayload[E];
}

export type WireFrame = RpcRequest | RpcResponse | RpcEvent;

// ── Method registry ───────────────────────────────────────────────────────

export interface RpcParams {
  "session.list":       Record<string, never>;
  "session.get":        { id: string };
  "session.open":       { projectId: string; branchId?: string; agent?: string; name?: string };
  "session.close":      { id: string };
  "session.hop":        { id: string };

  "queue.list":         { sessionId: string };
  "queue.enqueue":      { sessionId: string; text: string };
  "queue.remove":       { sessionId: string; itemId: string };
  "queue.clear":        { sessionId: string };
  "queue.reorder":      { sessionId: string; itemId: string; toIndex: number };

  "agent.send":         { sessionId: string; text: string };
  "agent.interrupt":    { sessionId: string };
  "agent.stop":         { sessionId: string };
  /** Start receiving `agent.output` for this session; reply carries the
   *  replay buffer so the client (xterm on the phone) can catch up. */
  "agent.subscribe":    { sessionId: string };
  "agent.unsubscribe":  { sessionId: string };

  "permission.list":    Record<string, never>;
  "permission.decide":  { sessionId: string; decision: "approve" | "deny" };
}

export interface RpcResult {
  "session.list": {
    sessions: SessionSummary[];
    projects: ProjectSummary[];
    branches: BranchSummary[];
    recents: RecentSummary[];
  };
  "session.get":        SessionSummary;
  "session.open":       { id: string };
  "session.close":      void;
  "session.hop":        void;

  "queue.list":         QueueItem[];
  "queue.enqueue":      void;
  "queue.remove":       void;
  "queue.clear":        void;
  "queue.reorder":      void;

  "agent.send":         void;
  "agent.interrupt":    void;
  "agent.stop":         void;
  "agent.subscribe":    { replay: string[] };
  "agent.unsubscribe":  void;

  "permission.list":    PermissionRequest[];
  "permission.decide":  void;
}

export type RpcMethod = keyof RpcParams & keyof RpcResult;

// ── Server-push events ────────────────────────────────────────────────────

export interface ServerEventPayload {
  "session.updated":    SessionSummary;
  "session.removed":    { id: string };
  "queue.changed":      { sessionId: string; queue: QueueItem[] };
  "permission.pending": PermissionRequest;
  "permission.resolved": { sessionId: string };
  /** Full ordered project list — fired on any sidebar reorder / add / remove. */
  "projects.changed":   { projects: ProjectSummary[] };
  /** Phase 3+: terminal stream chunk. */
  "agent.output":       { sessionId: string; chunk: string };
}

export type ServerEvent = keyof ServerEventPayload;

// ── Type guards ───────────────────────────────────────────────────────────

export function isRequest(f: WireFrame): f is RpcRequest {
  return "method" in f && "id" in f;
}
export function isResponse(f: WireFrame): f is RpcResponse {
  // Void-result replies serialize as { id } — JSON.stringify drops `result: undefined`.
  // So the guard has to accept "id present, method absent" (event has no id).
  return "id" in f && !("method" in f);
}
export function isEvent(f: WireFrame): f is RpcEvent {
  return "event" in f && !("id" in (f as object));
}
