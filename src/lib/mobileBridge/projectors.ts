// Project desktop-internal state (WorktreeSession + WorkState + queue) into
// the wire types defined in @tempest/core. The mobile side sees only these
// projections — never the raw stores.

import type {
  SessionSummary, ProjectSummary, BranchSummary, SessionStatus, QueueItem,
} from "@tempest/core";
import { getAllSessions, getSession } from "../../store/sessions";
import { dbLoad } from "../db";
import { getWorkState, getAttention } from "../../store/workState";
import { getQueue } from "../../store/messageQueue";

function statusOf(sessionId: string): SessionStatus {
  const w = getWorkState(sessionId);
  if (w === "working") return getAttention(sessionId) ? "waiting" : "working";
  if (w === "done") return "done";
  return "idle";
}

export function projectSession(id: string): SessionSummary | null {
  const s = getSession(id);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    agent: s.agent,
    projectId: s.projectId,
    branchId: s.branchId,
    parentSessionId: s.parentSessionId,
    closed: !!s.closed,
    placement: s.placement ?? "tab",
    createdAt: s.createdAt,
    status: statusOf(s.id),
    queueLength: getQueue(s.id).length,
    needsPermission: statusOf(s.id) === "waiting",
  };
}

export async function projectListSnapshot(): Promise<{
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  branches: BranchSummary[];
}> {
  const sessions: SessionSummary[] = [];
  for (const s of getAllSessions()) {
    const sum = projectSession(s.id);
    if (sum) sessions.push(sum);
  }

  // Project + branch metadata comes from the SQLite snapshot the sessions
  // store already loaded. Cheap enough to re-read at list time; can memoize
  // if it ever shows up on a profile.
  const snap = await dbLoad();
  const projects: ProjectSummary[] = snap.projects.map((p) => ({
    id: p.id, name: p.name, path: p.path,
  }));
  const branches: BranchSummary[] = snap.branches.map((b) => ({
    id: b.id, projectId: b.projectId, path: b.path, name: b.name,
  }));

  return { sessions, projects, branches };
}

export function projectQueue(sessionId: string): QueueItem[] {
  return getQueue(sessionId).map((i) => ({ id: i.id, text: i.text }));
}
