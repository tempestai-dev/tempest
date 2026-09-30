import { useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NodeResizeControl, ResizeControlVariant, useReactFlow } from "@xyflow/react";
import { UiIcon } from "../../../icons/UiIcon";
const Trash2 = (p: any) => <UiIcon name="trash-2" {...p} />;
import { SpSelect } from "../../ui/SpSelect";
import { TerminalPane } from "../../TerminalPane";
import { AGENT_CONFIGS, AgentIcon } from "../../NewSessionMenu";
import { ThreadNodeContext } from "../ThreadNodeContext";
import { NodeConnector } from "./NodeConnector";
import { CollapsedNode } from "./CollapsedNode";
import { getThreadNode, saveThreadNode } from "../../../store/threads";
import { getSession, getBranch } from "../../../store/sessions";
import { sessionManager } from "../../../store/sessionManager";
import "./TextNode.css";

// Agent / terminal node (threads-plan.md §5). An independent, canvas-owned PTY
// session: launched from the node itself, it has NO tab-bar entry — the node is its
// sole home (thread_nodes.session_id). The session is spawned via the canvas
// primitives (ThreadNodeContext), rendered with the shared TerminalPane, and
// resumed on the node when the app restarts (its previous PTY died). The PTY layer
// (create_pty_session, sessionManager) is reused untouched — only the placement is
// new.
function SessionNode({ id, data, isAgent }: { id: string; data?: { collapsed?: boolean }; isAgent: boolean }) {
  const ctx = useContext(ThreadNodeContext);
  const { deleteElements } = useReactFlow();
  const [sessionId, setSessionId] = useState<string | null>(() => getThreadNode(id)?.sessionId ?? null);
  // TerminalPane may only mount once the session is registered in sessionManager
  // (attach() is a no-op before register, and it attaches exactly once on mount).
  // So gate the pane on `live`, flipped after spawn/resume resolves.
  const [live, setLive] = useState(false);
  const [launching, setLaunching] = useState(false);
  // Launch target: "" = project root, "__new__" = cut a new worktree, else a
  // worktree path. Drives thread_nodes.branch_id (execution binding, plan §3.2).
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");

  // Bind a just-spawned session to this node — persisting both the session FK and
  // the branch it landed in (session.branchId, stamped by the worktree spawn).
  function bind(sid: string) {
    const node = getThreadNode(id);
    if (!node) return;
    saveThreadNode({ ...node, sessionId: sid, branchId: getSession(sid)?.branchId ?? null });
    setSessionId(sid);
  }

  // On mount with a persisted session: if its PTY is still live (same app run),
  // show it; otherwise resume it (app restart killed the PTY) before mounting the
  // pane. resumeCanvasSession is idempotent and resolves post-registration.
  useEffect(() => {
    if (!sessionId) return;
    if (sessionManager.has(sessionId)) { setLive(true); return; }
    let alive = true;
    ctx?.resumeCanvasSession?.(sessionId).then(() => { if (alive) setLive(true); });
    return () => { alive = false; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function launch(agentHint?: string) {
    if (!ctx?.spawnCanvasSession || launching) return;
    setLaunching(true);
    // Resolve the worktree: root ("") stays undefined; "__new__" cuts one first.
    let worktreePath: string | undefined;
    if (target === "__new__") {
      worktreePath = (await ctx.createCanvasWorktree?.(newName)) ?? undefined;
      if (!worktreePath) { setLaunching(false); return; } // empty name / creation failed
    } else if (target) {
      worktreePath = target;
    }
    // Canvas MCP config in the agent's cwd → it discovers canvas_map / read_canvas_node.
    const cwd = worktreePath ?? ctx.projectPath;
    if (cwd) { try { await invoke("write_canvas_mcp_config", { projectPath: cwd, projectId: ctx.projectId }); } catch { /* best-effort */ } }
    const sid = await ctx.spawnCanvasSession({ agent: agentHint, worktreePath });
    setLaunching(false);
    if (!sid) return; // spawn failed (policy refusal etc. surfaced upstream)
    bind(sid);
    setLive(true);
  }

  const label = isAgent ? "Agent" : "Terminal";
  const name = sessionId ? getSession(sessionId)?.name : undefined;
  const boundBranch = getThreadNode(id)?.branchId;
  const branchName = boundBranch ? getBranch(boundBranch)?.name : undefined;

  // "Run in:" worktree picker (SpSelect) shown before launch. Root by default.
  const runInOptions = [
    { value: "", label: "Project root" },
    ...(ctx?.worktrees ?? []).map((w) => ({ value: w.path, label: w.name })),
    ...(ctx?.createCanvasWorktree ? [{ value: "__new__", label: "New worktree…" }] : []),
  ];
  const picker = (
    <div className="nodrag" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: target === "__new__" ? 6 : 0 }}>
        <span style={{ opacity: 0.7, flexShrink: 0 }}>Run in:</span>
        <SpSelect className="sp-drop--full" value={target} options={runInOptions} onChange={setTarget} />
      </div>
      {target === "__new__" && (
        <input
          className="nodrag"
          placeholder="new-branch-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{
            width: "100%", padding: "4px 6px", borderRadius: 5, boxSizing: "border-box",
            border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
            background: "var(--tempest-bg-editor, #0f0f0f)",
            color: "var(--tempest-fg-default, #e6e6e6)", font: "inherit",
          }}
        />
      )}
    </div>
  );

  const frame: React.CSSProperties = {
    width: "100%", height: "100%", boxSizing: "border-box",
    display: "flex", flexDirection: "column", overflow: "hidden",
    background: "var(--tempest-bg-elevated, #161616)",
    border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
    borderRadius: 8,
  };
  const header: React.CSSProperties = {
    flex: "0 0 auto", padding: "5px 9px", display: "flex", alignItems: "center", gap: 6,
    borderBottom: "1px solid var(--tempest-border-subtle, #2a2a2a)",
    color: "var(--tempest-fg-muted, #aaa)", font: '11px "Geist", system-ui, sans-serif',
  };

  if (data?.collapsed) return <CollapsedNode id={id} />;

  return (
    <div style={frame}>
      {/* Full-edge resize controls (same as TextNode): left/right resize width,
          top/bottom resize height. The grip pill fades in on edge hover. */}
      {(["top", "right", "bottom", "left"] as const).map((pos) => (
        <NodeResizeControl
          key={pos}
          position={pos}
          variant={ResizeControlVariant.Line}
          minWidth={280}
          minHeight={180}
          className={`tnode-edge tnode-edge--${pos}`}
        >
          <span className={`tnode-grip tnode-grip--${pos === "left" || pos === "right" ? "v" : "h"}`} />
        </NodeResizeControl>
      ))}

      <div style={header}>
        <NodeConnector nodeId={id} side="left" />
        <span style={{ opacity: 0.7 }}>{label}</span>
        {name && <span style={{ color: "var(--tempest-fg-default, #e6e6e6)" }}>{name}</span>}
        {branchName && <span style={{ opacity: 0.55 }}>· {branchName}</span>}
        <div style={{ flex: 1 }} />
        <button
          className="tnode-header-btn nodrag"
          title={`Delete ${label.toLowerCase()}`}
          onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }}
        >
          <Trash2 size={13} />
        </button>
        <NodeConnector nodeId={id} side="right" />
      </div>

      {sessionId && live ? (
        // TerminalPane's wrapper is position:absolute/inset:0 → needs a positioned,
        // sized parent. nodrag/nowheel keep terminal input + scroll off the canvas.
        <div className="nodrag nowheel" style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }}>
          <TerminalPane sessionId={sessionId} isAgent={isAgent} />
        </div>
      ) : (
        <div
          className="nodrag"
          style={{
            flex: "1 1 auto", overflow: "auto", padding: 8,
            font: '12px "Geist", system-ui, sans-serif', color: "var(--tempest-fg-muted, #888)",
          }}
        >
          {sessionId ? (
            <span>Resuming {label.toLowerCase()}…</span>
          ) : launching ? (
            <span>Launching {label.toLowerCase()}…</span>
          ) : isAgent ? (
            <>
              {picker}
              <div style={{ marginBottom: 6 }}>Launch an agent:</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6 }}>
                {AGENT_CONFIGS.filter((a) => !a.disabled).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => launch(a.hint)}
                    title={a.name}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      padding: "10px 8px", borderRadius: 6,
                      border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
                      background: "var(--tempest-bg-editor, #0f0f0f)",
                      color: "var(--tempest-fg-default, #e6e6e6)", cursor: "pointer", font: "inherit",
                    }}
                  >
                    <AgentIcon hint={a.hint} size={22} />
                    <span style={{
                      fontSize: 11, maxWidth: "100%", lineHeight: 1.2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{a.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {picker}
              <button
              onClick={() => launch()}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "5px 8px", borderRadius: 5,
                border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
                background: "var(--tempest-bg-editor, #0f0f0f)",
                color: "var(--tempest-fg-default, #e6e6e6)", cursor: "pointer", font: "inherit",
              }}
            >
              Launch terminal
            </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type NodeShellProps = { id: string; data?: { collapsed?: boolean } };
export function AgentNode(props: NodeShellProps) { return <SessionNode {...props} isAgent />; }
export function TerminalNode(props: NodeShellProps) { return <SessionNode {...props} isAgent={false} />; }
