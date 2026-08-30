// Vendored from packages/core (detached from workspace so mobile stays a
// standalone Expo app). If the desktop protocol changes, re-copy this file.

export type SessionStatus = "idle" | "working" | "waiting" | "done";

export interface SessionSummary {
  id: string;
  name: string;
  agent?: string;
  projectId: string;
  branchId?: string;
  parentSessionId?: string;
  closed: boolean;
  placement: "tab" | "canvas";
  createdAt: string;
  status: SessionStatus;
  queueLength: number;
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
  worktrees: WorktreeSummary[];
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
  path: string;
  name: string;
  lastOpened: string;
}

export interface PermissionRequest {
  sessionId: string;
  agent: string;
  tool: string;
  detail: string;
  createdAt: string;
}

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
  "agent.subscribe":    { sessionId: string };
  "agent.unsubscribe":  { sessionId: string };

  "permission.list":    Record<string, never>;
  "permission.decide":  { sessionId: string; decision: "approve" | "deny" };

  "protocol.hello":     { mobile: number; minCompatibleDesktop: number };
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

  "protocol.hello":     { desktop: number; minCompatibleMobile: number };
}

export type RpcMethod = keyof RpcParams & keyof RpcResult;

export interface ServerEventPayload {
  "session.updated":    SessionSummary;
  "session.removed":    { id: string };
  "queue.changed":      { sessionId: string; queue: QueueItem[] };
  "permission.pending": PermissionRequest;
  "permission.resolved": { sessionId: string };
  "projects.changed":   { projects: ProjectSummary[] };
  "agent.output":       { sessionId: string; chunk: string };
}

export type ServerEvent = keyof ServerEventPayload;

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
