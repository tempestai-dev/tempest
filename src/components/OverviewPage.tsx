import { TerminalSquare, GitBranch, Eye, GitPullRequest, MoreHorizontal, Loader, FolderOpen, Bell } from "lucide-react";
import { AgentIcon } from "./NewSessionMenu";
import { useWorkState, useAttention, getWorkState, getAttention, useWorkStateVersion } from "../store/workState";
import "./OverviewPage.css";

export interface ChangeEntry {
  status: "M" | "A" | "D" | "R" | "?";
  path: string;
}

export interface WorkspaceEntry {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  cwd: string;
  branch: string | null;
  agent?: string;
  changes: ChangeEntry[];
  lastActiveAt: string; // ISO timestamp
}

interface OverviewPageProps {
  workspaces: WorkspaceEntry[];
  onOpen: (sessionId: string) => void;
  onDiff: (cwd: string, projectId: string) => void;
  onOpenProject: () => void;
}

type WorkState = "idle" | "working" | "done";
// Sort bucket: attention (0) beats done (0), then working (1), then idle (2).
// Attention shares the bucket with done so they render in the same group but
// attention rows will sort first inside it via the second-level sort key.
function sortBucket(sessionId: string): number {
  if (getAttention(sessionId)) return 0;
  const s = getWorkState(sessionId);
  if (s === "done") return 0;
  if (s === "working") return 1;
  return 2;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}

function StateDot({ state, attention }: { state: WorkState; attention: boolean }) {
  if (attention) {
    return <Bell size={10} className="op-attention-bell" aria-label="Waiting for input" />;
  }
  if (state === "working") {
    return <Loader size={10} className="op-spinner" aria-label="Working" />;
  }
  return <span className={`op-dot op-dot--${state}`} aria-label={state} />;
}

function WorkspaceRow({
  ws,
  onOpen,
  onDiff,
}: {
  ws: WorkspaceEntry;
  onOpen: (sessionId: string) => void;
  onDiff: (cwd: string, projectId: string) => void;
}) {
  const workState = useWorkState(ws.id);
  const attention = useAttention(ws.id);
  const hasAgent = !!ws.agent;
  const fileCount = ws.changes.length;
  const firstName = fileCount > 0
    ? (ws.changes[0].path.split("/").pop() ?? ws.changes[0].path)
    : null;
  const extraCount = fileCount - 1;

  return (
    <div className="op-row">

      <div className="op-row-dot">
        <StateDot state={workState} attention={attention} />
      </div>

      <div className="op-row-identity">
        <div className="op-row-nameline">
          <span className="op-row-typeicon">
            {hasAgent ? <AgentIcon hint={ws.agent} size={11} /> : <TerminalSquare size={11} />}
          </span>
          <span className="op-row-name">{ws.name}</span>
          <span className="op-row-project">{ws.projectName}</span>
          {attention ? (
            <span className="op-row-review">waiting for input</span>
          ) : workState === "done" ? (
            <span className="op-row-review">ready to review</span>
          ) : null}
        </div>
        {(ws.branch || firstName) && (
          <div className="op-row-branchline">
            {ws.branch && (
              <>
                <GitBranch size={10} className="op-row-branchicon" />
                <span className="op-row-branch">{ws.branch}</span>
              </>
            )}
            {firstName && (
              <>
                {ws.branch && <span className="op-row-dot-sep">·</span>}
                <span className="op-row-file">{firstName}</span>
                {extraCount > 0 && (
                  <span className="op-row-filemore">+{extraCount}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="op-row-right">
        <span className="op-row-age">{timeAgo(ws.lastActiveAt)}</span>
        <div className="op-row-actions">
          <button className="op-act" onClick={() => onOpen(ws.id)}>Open</button>
          {hasAgent && (
            <button
              className="op-act op-act--icon"
              aria-label="View diff"
              onClick={() => onDiff(ws.cwd, ws.projectId)}
            >
              <Eye size={12} />
            </button>
          )}
          {workState === "done" && (
            <button className="op-act op-act--icon" aria-label="Open PR">
              <GitPullRequest size={12} />
            </button>
          )}
          <button className="op-act op-act--icon" aria-label="More">
            <MoreHorizontal size={12} />
          </button>
        </div>
      </div>

    </div>
  );
}

export function OverviewPage({ workspaces, onOpen, onDiff, onOpenProject }: OverviewPageProps) {
  // Subscribe to work state changes so header counts and sort order stay live.
  useWorkStateVersion();

  const sorted = [...workspaces].sort((a, b) => {
    const ba = sortBucket(a.id);
    const bb = sortBucket(b.id);
    if (ba !== bb) return ba - bb;
    // Inside the done/attention bucket, attention rows come first.
    const aa = getAttention(a.id) ? 0 : 1;
    const ab = getAttention(b.id) ? 0 : 1;
    return aa - ab;
  });

  const active = workspaces.filter((w) => {
    if (getAttention(w.id)) return true;
    const s = getWorkState(w.id);
    return s === "working" || s === "done";
  }).length;

  return (
    <div className="op-root">

      <div className="op-header">
        <span className="op-header-count">
          {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
        </span>
        <span className="op-header-sep">·</span>
        <span className="op-header-active">{active} active</span>
      </div>

      <div className="op-list">
        {sorted.length === 0 ? (
          <div className="op-empty">
            <span className="op-empty-text">No workspaces open</span>
            <button className="op-empty-btn" onClick={onOpenProject}>
              <FolderOpen size={13} />
              Open Project
            </button>
          </div>
        ) : sorted.map((ws, i) => {
          const prev = sorted[i - 1];
          const prevOrder = prev ? sortBucket(prev.id) : -1;
          const curOrder = sortBucket(ws.id);
          const groupChanged = prev && prevOrder !== curOrder;
          return (
            <div key={ws.id}>
              {groupChanged && <div className="op-group-gap" />}
              <WorkspaceRow ws={ws} onOpen={onOpen} onDiff={onDiff} />
            </div>
          );
        })}
      </div>

    </div>
  );
}
