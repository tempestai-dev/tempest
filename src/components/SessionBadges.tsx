import { memo } from "react";
import { Loader, Bell } from "lucide-react";
import {
  useWorkState,
  useAttention,
  useWorkStateVersion,
  getWorkState,
  getAttention,
} from "../store/workState";
import { useQueue } from "../store/messageQueue";

// A bell trumps any state — the user has to act. Otherwise render whatever
// the process state says.
export const WorkStateBadge = memo(function WorkStateBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
  const attention = useAttention(sessionId);
  if (attention) return <Bell size={11} className="work-attention-bell" aria-label="Agent waiting for input" />;
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
});

export const QueueBadge = memo(function QueueBadge({
  sessionId,
  onClick,
}: {
  sessionId: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const queue = useQueue(sessionId);
  if (!queue.length) return null;
  return (
    <button
      className="session-tab-queue-badge"
      onClick={onClick}
      title={`${queue.length} message${queue.length !== 1 ? "s" : ""} queued`}
    >
      {queue.length}
    </button>
  );
});

export const SidebarWorkBadge = memo(function SidebarWorkBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
  const attention = useAttention(sessionId);
  if (attention) return <Bell size={11} className="work-attention-bell" aria-label="Agent waiting for input" />;
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
});

// Global toolbar pill — counts sessions with the attention flag set across
// the whole app.
export const AttentionPill = memo(function AttentionPill({
  sessionIds,
  onClick,
}: {
  sessionIds: string[];
  onClick: () => void;
}) {
  useWorkStateVersion();
  const count = sessionIds.reduce((n, id) => n + (getAttention(id) ? 1 : 0), 0);
  if (count === 0) return null;
  return (
    <button
      className="attention-pill"
      onClick={onClick}
      title={`${count} agent${count !== 1 ? "s" : ""} waiting for input — click to jump`}
    >
      <Bell size={11} />
      <span>{count}</span>
    </button>
  );
});

// Aggregates all sessions in a project — shows highest-priority signal on the
// project header. Attention > working > done > idle.
export const ProjectWorkBadge = memo(function ProjectWorkBadge({ sessionIds }: { sessionIds: string[] }) {
  useWorkStateVersion();
  let anyAttention = false;
  let anyWorking = false;
  let anyDone = false;
  for (const id of sessionIds) {
    if (getAttention(id)) { anyAttention = true; break; }
    const s = getWorkState(id);
    if (s === "working") anyWorking = true;
    else if (s === "done") anyDone = true;
  }
  if (anyAttention) return <Bell size={10} className="work-attention-bell" aria-label="Agent waiting for input" />;
  if (anyWorking) return <Loader size={10} className="spin work-spinner" />;
  if (anyDone) return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
});
