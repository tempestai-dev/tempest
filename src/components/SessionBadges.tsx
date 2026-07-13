import { memo } from "react";
import { Loader } from "lucide-react";
import { useWorkState } from "../store/workState";
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
