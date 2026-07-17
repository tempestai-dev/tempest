import { memo } from "react";
import { Loader } from "lucide-react";
import { useWorkState, useWorkStateVersion, getWorkState, type WorkState } from "../store/workState";
import { useQueue } from "../store/messageQueue";

export const WorkStateBadge = memo(function WorkStateBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
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
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
});

// Aggregates all sessions in a project — shows highest-priority signal on the project header.
export const ProjectWorkBadge = memo(function ProjectWorkBadge({ sessionIds }: { sessionIds: string[] }) {
  useWorkStateVersion();
  let highest: WorkState = "idle";
  for (const id of sessionIds) {
    const s = getWorkState(id);
    if (s === "working") { highest = "working"; break; }
    if (s === "done") highest = "done";
  }
  if (highest === "working") return <Loader size={10} className="spin work-spinner" />;
  if (highest === "done") return <span className="work-done-dot" aria-label="Agent waiting" />;
  return null;
});
