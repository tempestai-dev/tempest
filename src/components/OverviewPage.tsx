import { TerminalSquare, GitBranch, Eye, GitPullRequest, MoreHorizontal, Loader, FolderOpen } from "lucide-react";
import { AgentIcon } from "./NewSessionMenu";
import { useWorkState, getWorkState, useWorkStateVersion } from "../store/workState";
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
const STATE_ORDER: Record<WorkState, number> = { done: 0, working: 1, idle: 2 };

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}

function StateDot({ state }: { state: WorkState }) {
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
  const hasAgent = !!ws.agent;
  const fileCount = ws.changes.length;
  const firstName = fileCount > 0
    ? (ws.changes[0].path.split("/").pop() ?? ws.changes[0].path)
    : null;
  const extraCount = fileCount - 1;

  return (
    <div className="op-row">

      <div className="op-row-dot">
        <StateDot state={workState} />
      </div>

      <div className="op-row-identity">
        <div className="op-row-nameline">
          <span className="op-row-typeicon">
            {hasAgent ? <AgentIcon hint={ws.agent} size={11} /> : <TerminalSquare size={11} />}
          </span>
          <span className="op-row-name">{ws.name}</span>
          <span className="op-row-project">{ws.projectName}</span>
          {workState === "done" && (
            <span className="op-row-review">ready to review</span>
          )}
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
    const sa = STATE_ORDER[getWorkState(a.id) as WorkState] ?? 2;
    const sb = STATE_ORDER[getWorkState(b.id) as WorkState] ?? 2;
    return sa - sb;
  });

  const active = workspaces.filter((w) => {
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
          const prevOrder = prev ? (STATE_ORDER[getWorkState(prev.id) as WorkState] ?? 2) : -1;
          const curOrder = STATE_ORDER[getWorkState(ws.id) as WorkState] ?? 2;
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
