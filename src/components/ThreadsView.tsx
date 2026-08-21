import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  MessagesSquare, StickyNote, Bot, SquareTerminal, LayoutGrid, Minimize2, Maximize2, Trash2, Trash,
  Image as ImageIcon, FileText, Globe, Play,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from "lucide-react";
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  applyNodeChanges, applyEdgeChanges, addEdge, ConnectionMode,
  useStore, useStoreApi,
  type Node, type NodeChange, type Edge, type EdgeChange, type Connection, type Viewport,
  type NodeTypes, type EdgeTypes, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceCenter, type SimulationNodeDatum } from "d3-force";
import {
  getThread, getThreadNode, getThreadNodes, loadProjectThreads, loadThreadNodes, loadThreadEdges,
  saveThread, saveThreadNode, deleteThreadNode, saveThreadEdge, deleteThreadEdge, patchNodeData,
} from "../store/threads";
import type { DbThreadEdge } from "../lib/db";
import { useTheme } from "../themes/ThemeContext";
import { TextNode } from "./threads/nodes/TextNode";
import { invoke } from "@tauri-apps/api/core";
import { ChatNode, buildAgentSeedContext } from "./threads/nodes/ChatNode";
import { AgentNode, TerminalNode } from "./threads/nodes/SessionNode";
import { ImageNode } from "./threads/nodes/ImageNode";
import { FileNode } from "./threads/nodes/FileNode";
import { SiteNode } from "./threads/nodes/SiteNode";
import { MediaNode } from "./threads/nodes/MediaNode";
import { ThreadEdge } from "./threads/ThreadEdge";
import { ThreadNodeContext } from "./threads/ThreadNodeContext";
import { Tooltip } from "./Tooltip";
import { getSession } from "../store/sessions";
import type { DbThreadNode } from "../lib/db";

// Custom node kinds → their component. Module-level so the object identity is
// stable across renders (React Flow warns otherwise). Unlisted kinds fall back to
// React Flow's default box.
const nodeTypes: NodeTypes = {
  text: TextNode, chat: ChatNode, agent: AgentNode, terminal: TerminalNode,
  image: ImageNode, file: FileNode, site: SiteNode, media: MediaNode,
};
const CUSTOM_KINDS = new Set(Object.keys(nodeTypes));
// Kinds whose height is driven by content — the node grows downward as messages
// stack instead of scrolling. We apply width only and let React Flow measure height.
const AUTO_HEIGHT_KINDS = new Set(["chat"]);
const edgeTypes: EdgeTypes = { thread: ThreadEdge };

// Right-click menu — shadcn dropdown idiom translated to Tempest's inline-style /
// CSS-var system: p-1 content, muted text-xs labels, gap-1.5 rounded-md items.
const menuStyle: React.CSSProperties = {
  minWidth: 176, padding: 4, borderRadius: 8,
  display: "flex", flexDirection: "column", gap: 1,
  background: "var(--tempest-bg-elevated, #161616)",
  border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
  font: '13px "Geist", system-ui, sans-serif',
};
const menuLabelStyle: React.CSSProperties = {
  padding: "6px 8px 4px", color: "var(--tempest-fg-muted, #888)",
  font: '12px "Geist", system-ui, sans-serif', fontWeight: 500,
};
const menuItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
  padding: "7px 8px", borderRadius: 6, border: "none",
  background: "transparent", color: "var(--tempest-fg-default, #e6e6e6)",
  cursor: "pointer", font: "inherit",
};
const menuSepStyle: React.CSSProperties = {
  height: 1, margin: "5px -4px", background: "var(--tempest-border-subtle, #2a2a2a)",
};

// Default canvas footprint per kind at creation (persisted; user-resizable later).
const KIND_SIZE: Record<string, { w: number; h: number }> = {
  text: { w: 500, h: 500 },
  chat: { w: 700, h: 500 },
  agent: { w: 480, h: 340 },
  terminal: { w: 480, h: 300 },
  image: { w: 360, h: 320 },
  file: { w: 420, h: 360 },
  site: { w: 460, h: 400 },
  media: { w: 460, h: 400 },
};

// Phase 2: renders exactly one canvas (named by `threadId`) as a bare React Flow
// surface — pan/zoom, minimap, node dragging. Node *types* (chat/text/agent/
// terminal) and node creation land in phase 3+; here every persisted node shows
// as a default box so positions still round-trip. Viewport + node positions
// persist back to SQLite via the threads store.

// A persisted thread_node → a React Flow node. Label comes from data.title,
// falling back to the kind. Node bodies are phase 3.
// Compact width of a collapsed node — a single-row gist pill. Its height is left
// to React Flow to measure (like auto-height kinds), so it hugs the one row.
const COLLAPSED_W = 260;

// A node's real on-canvas footprint: explicit width/height (from creation) if
// set, else React Flow's measured size, else a sane fallback. Neither field is
// guaranteed (auto-height kinds only get width; freshly-created nodes may not
// have been measured yet), so every consumer of node size goes through this.
const dimW = (n: Node) => n.width ?? n.measured?.width ?? COLLAPSED_W;
const dimH = (n: Node) => n.height ?? n.measured?.height ?? 160;

function toFlowNode(n: DbThreadNode): Node {
  let title = n.kind;
  let collapsed = false;
  try {
    const d = n.data ? JSON.parse(n.data) : null;
    if (d && typeof d.title === "string" && d.title) title = d.title;
    if (d) collapsed = !!d.collapsed;
  } catch { /* keep kind */ }
  return {
    id: n.id,
    ...(CUSTOM_KINDS.has(n.kind) ? { type: n.kind } : {}),
    position: { x: n.x, y: n.y },
    data: { label: title, collapsed },
    // Collapsed → fixed compact width, height measured. Otherwise: auto-height
    // kinds get width only (height measures to content); the rest get both. The
    // stored width/height are untouched by collapse, so expand restores exactly.
    ...(collapsed
      ? { width: COLLAPSED_W }
      : AUTO_HEIGHT_KINDS.has(n.kind)
        ? (n.width ? { width: n.width } : {})
        : (n.width && n.height ? { width: n.width, height: n.height } : {})),
  };
}

// A persisted thread_edge → a React Flow edge (and back). The DB id is the RF id
// so removes/updates round-trip by the same key.
function toFlowEdge(e: DbThreadEdge): Edge {
  return {
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined,
  };
}

// Cursor-following line for click-to-connect. React Flow arms the connection on a
// single click (store.connectionClickStartHandle) but — unlike a drag — draws no
// rubber-band line, so the click felt inert. We mirror the armed handle: draw a
// bezier from it to the cursor until a second handle click completes it (React Flow
// clears the handle → line vanishes) or a pane click / Escape cancels. Screen
// coords via getBoundingClientRect; a fixed overlay needs no viewport transform.
// Must render inside <ReactFlow> to see the store. ponytail: line origin is frozen
// at arm time — panning mid-connect would drift it; not worth tracking.
function ClickConnectLine() {
  const store = useStoreApi();
  const start = useStore((s) => s.connectionClickStartHandle);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    if (!start) { setLine(null); return; }
    const el = document.querySelector(
      `.react-flow__handle[data-nodeid="${start.nodeId}"][data-handleid="${start.id ?? ""}"]`,
    ) as HTMLElement | null;
    if (!el) { setLine(null); return; }
    const r = el.getBoundingClientRect();
    const x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
    setLine({ x1, y1, x2: x1, y2: y1 });

    const move = (e: MouseEvent) => setLine((l) => (l ? { ...l, x2: e.clientX, y2: e.clientY } : l));
    // A click anywhere that isn't a handle cancels (a handle click either
    // completes the connection or re-arms — React Flow owns that).
    const cancel = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.(".react-flow__handle")) {
        store.setState({ connectionClickStartHandle: null });
      }
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") store.setState({ connectionClickStartHandle: null }); };
    window.addEventListener("mousemove", move);
    window.addEventListener("click", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("click", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [start, store]);

  if (!line) return null;
  const dx = Math.max(40, Math.abs(line.x2 - line.x1) * 0.5);
  const d = `M ${line.x1},${line.y1} C ${line.x1 + dx},${line.y1} ${line.x2 - dx},${line.y2} ${line.x2},${line.y2}`;
  return createPortal(
    <svg style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 8 }}>
      <path d={d} fill="none" stroke="var(--tempest-accent-yellow, #f5c518)" strokeWidth={3} strokeLinecap="round" />
    </svg>,
    document.body,
  );
}

export function ThreadsView({
  threadId, projectId, hidden, projectPath, atlasIndexed, spawnCanvasSession, resumeCanvasSession, closeCanvasSession,
  worktrees, createCanvasWorktree, autoNameThread,
}: {
  threadId: string;
  projectId: string;
  hidden?: boolean;
  projectPath?: string;
  atlasIndexed?: boolean;
  spawnCanvasSession?: (projectId: string, opts: { agent?: string; name?: string; prompt?: string; model?: string; worktreePath?: string }) => Promise<string | null>;
  resumeCanvasSession?: (sessionId: string) => Promise<void>;
  closeCanvasSession?: (sessionId: string) => void;
  worktrees?: { name: string; path: string }[];
  createCanvasWorktree?: (projectId: string, name: string) => Promise<string | null>;
  autoNameThread?: (threadId: string, firstMessage: string) => void;
}) {
  const { theme } = useTheme();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false); // flips once the thread row is in the store
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rfRef = useRef<ReactFlowInstance<Node> | null>(null);
  // Right-click "add node" menu: screen coords for placement, flow coords for the node.
  const [menu, setMenu] = useState<{ x: number; y: number; flow: { x: number; y: number }; nodeId?: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Collision-aware placement (shadcn/Radix does this natively): after the menu
  // mounts, nudge it back inside the viewport if the cursor was near an edge.
  // Runs before paint, so no flash from the correction.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    if (r.right > window.innerWidth - pad) el.style.left = `${Math.max(pad, window.innerWidth - r.width - pad)}px`;
    if (r.bottom > window.innerHeight - pad) el.style.top = `${Math.max(pad, window.innerHeight - r.height - pad)}px`;
  }, [menu]);

  useEffect(() => {
    let alive = true;
    // Ensure the thread row exists in the store (restored tabs open before the
    // sidebar hydrates the project's threads) so viewport read/write works.
    const rows = getThread(threadId) ? Promise.resolve() : loadProjectThreads(projectId).then(() => {});
    Promise.all([rows, loadThreadNodes(threadId), loadThreadEdges(threadId)]).then(([, nodeRows, edgeRows]) => {
      if (!alive) return;
      setNodes(nodeRows.map(toFlowNode));
      setEdges(edgeRows.map(toFlowEdge));
      setReady(true);
    });
    return () => { alive = false; };
  }, [threadId, projectId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev);
      // Persist finished drags (position, dragging=false) and finished resizes
      // (dimensions, resizing=false) — read the merged node so size + position
      // round-trip together (top/left resize moves the node too).
      for (const c of changes) {
        if (c.type === "remove") {
          // A deleted agent/terminal node owns its canvas session — tear it down
          // (kill PTY + drop the row) so it doesn't leak or resume as a zombie.
          const sid = getThreadNodes(threadId).find((n) => n.id === c.id)?.sessionId;
          if (sid) closeCanvasSession?.(sid);
          deleteThreadNode(c.id);
          continue;
        }
        const done =
          (c.type === "position" && c.dragging === false) ||
          (c.type === "dimensions" && c.resizing === false);
        if (!done) continue;
        const nn = next.find((n) => n.id === c.id);
        const stored = getThreadNodes(threadId).find((n) => n.id === c.id);
        if (!nn || !stored) continue;
        const w = Math.round(nn.width ?? nn.measured?.width ?? stored.width ?? 0);
        const h = Math.round(nn.height ?? nn.measured?.height ?? stored.height ?? 0);
        saveThreadNode({
          ...stored,
          x: nn.position.x, y: nn.position.y,
          width: w || stored.width, height: h || stored.height,
        });
      }
      return next;
    });
  }, [threadId, closeCanvasSession]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) if (c.type === "remove") deleteThreadEdge(c.id);
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const onConnect = useCallback((c: Connection) => {
    const id = crypto.randomUUID();
    saveThreadEdge({
      id, threadId, source: c.source, target: c.target,
      sourceHandle: c.sourceHandle ?? null, targetHandle: c.targetHandle ?? null,
    });
    setEdges((prev) => addEdge({ ...c, id }, prev));
  }, [threadId]);

  // Collapse/expand: only touches data.collapsed (never width/height), then
  // rebuilds the flow node from the store so dimensions + the collapsed prop
  // update together. Expand restores the stored size exactly.
  const setNodeCollapsed = useCallback((nid: string, collapsed: boolean) => {
    patchNodeData(nid, { collapsed });
    const row = getThreadNode(nid);
    if (row) setNodes((prev) => prev.map((n) => (n.id === nid ? toFlowNode(row) : n)));
  }, []);

  const setAllCollapsed = useCallback((collapsed: boolean) => {
    for (const r of getThreadNodes(threadId)) patchNodeData(r.id, { collapsed });
    setNodes((prev) => prev.map((n) => { const row = getThreadNode(n.id); return row ? toFlowNode(row) : n; }));
  }, [threadId]);

  // Tidy: untangle the wires with a force-directed layout (d3-force). Edges here
  // are associative, not directional, so a layered/hierarchical layout would
  // invent a flow that isn't in the data — a spring/charge simulation instead
  // pulls connected nodes together and lets repulsion + collision relax crossed
  // edges out. Only nodes that carry an edge are laid out; isolated nodes are
  // left exactly where the user put them. ponytail: fixed force constants, no
  // per-graph tuning knob — add one if dense canvases settle too tight/loose.
  const tidy = useCallback(() => {
    setNodes((prev) => {
      const connected = new Set<string>();
      for (const e of edges) { connected.add(e.source); connected.add(e.target); }
      if (connected.size < 2) { setTimeout(() => rfRef.current?.fitView({ duration: 400, padding: 0.2 }), 50); return prev; }

      // Circle radius per node from its real footprint (half the diagonal) so big
      // nodes claim proportional space in the sim; point-particles would clip.
      type SimNode = SimulationNodeDatum & { id: string; r: number };
      const sim: SimNode[] = prev
        .filter((n) => connected.has(n.id))
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, r: Math.hypot(dimW(n), dimH(n)) / 2 }));
      const byId = new Map(sim.map((s) => [s.id, s]));
      const links = edges
        .filter((e) => byId.has(e.source) && byId.has(e.target))
        .map((e) => ({ source: e.source, target: e.target }));

      // Keep the cluster roughly where it already is (centre on its own centroid).
      const cx = sim.reduce((s, n) => s + (n.x ?? 0), 0) / sim.length;
      const cy = sim.reduce((s, n) => s + (n.y ?? 0), 0) / sim.length;

      const simulation = forceSimulation<SimNode>(sim)
        .force("link", forceLink<SimNode, { source: string; target: string }>(links)
          .id((d) => d.id)
          // d3 mutates source/target from ids to node objects once linked.
          .distance((l) => (l.source as unknown as SimNode).r + (l.target as unknown as SimNode).r + 80))
        .force("charge", forceManyBody<SimNode>().strength((d) => -(d.r * 12)))
        .force("collide", forceCollide<SimNode>().radius((d) => d.r + 24))
        .force("center", forceCenter(cx, cy))
        .stop();
      for (let i = 0; i < 300; i++) simulation.tick();

      for (const s of sim) {
        const row = getThreadNode(s.id);
        if (row) saveThreadNode({ ...row, x: Math.round(s.x ?? row.x), y: Math.round(s.y ?? row.y) });
      }
      const pos = new Map(sim.map((s) => [s.id, { x: Math.round(s.x ?? 0), y: Math.round(s.y ?? 0) }]));
      return prev.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
    });
    setTimeout(() => rfRef.current?.fitView({ duration: 400, padding: 0.2 }), 50);
  }, [edges]);

  type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "distributeH" | "distributeV";

  // Multi-select alignment/distribution — a bulk, non-drag reposition of the
  // currently-selected nodes (same shape as tidy(): compute new positions,
  // persist each via saveThreadNode, then setNodes so React Flow reflects them).
  const alignSelection = useCallback((mode: AlignMode) => {
    setNodes((prev) => {
      const sel = prev.filter((n) => n.selected);
      if (sel.length < 2) return prev;
      const boxes = sel.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: dimW(n), h: dimH(n) }));
      const pos = new Map<string, { x: number; y: number }>();

      if (mode === "distributeH" || mode === "distributeV") {
        // Even gaps between edges, ordered along the axis — the outermost two
        // nodes anchor the span, interior nodes are spaced to fill it evenly.
        const axis = mode === "distributeH" ? "x" : "y";
        const size = mode === "distributeH" ? "w" : "h";
        const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
        const first = sorted[0], last = sorted[sorted.length - 1];
        const span = (last[axis] + last[size]) - first[axis];
        const totalSize = sorted.reduce((s, b) => s + b[size], 0);
        const gap = (span - totalSize) / (sorted.length - 1);
        let cursor = first[axis];
        for (const b of sorted) {
          pos.set(b.id, mode === "distributeH" ? { x: Math.round(cursor), y: b.y } : { x: b.x, y: Math.round(cursor) });
          cursor += b[size] + gap;
        }
      } else {
        const minX = Math.min(...boxes.map((b) => b.x));
        const maxRight = Math.max(...boxes.map((b) => b.x + b.w));
        const minY = Math.min(...boxes.map((b) => b.y));
        const maxBottom = Math.max(...boxes.map((b) => b.y + b.h));
        const centerX = (minX + maxRight) / 2;
        const centerY = (minY + maxBottom) / 2;
        for (const b of boxes) {
          let x = b.x, y = b.y;
          if (mode === "left") x = minX;
          else if (mode === "right") x = maxRight - b.w;
          else if (mode === "hcenter") x = centerX - b.w / 2;
          else if (mode === "top") y = minY;
          else if (mode === "bottom") y = maxBottom - b.h;
          else if (mode === "vcenter") y = centerY - b.h / 2;
          pos.set(b.id, { x: Math.round(x), y: Math.round(y) });
        }
      }

      for (const [id, p] of pos) {
        const row = getThreadNode(id);
        if (row) saveThreadNode({ ...row, x: p.x, y: p.y });
      }
      return prev.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n));
    });
  }, []);

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    const rf = rfRef.current;
    if (!rf) return;
    const { clientX, clientY } = e as React.MouseEvent;
    setMenu({ x: clientX, y: clientY, flow: rf.screenToFlowPosition({ x: clientX, y: clientY }) });
  }, []);

  // React Flow swallows right-clicks that land on a node, so the pane handler
  // never fires there — wire the node handler too and record which node was hit
  // (enables "Delete node").
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    const rf = rfRef.current;
    if (!rf) return;
    const { clientX, clientY } = e;
    setMenu({ x: clientX, y: clientY, flow: rf.screenToFlowPosition({ x: clientX, y: clientY }), nodeId: node.id });
  }, []);

  // Route through deleteElements so removals reuse onNodesChange's teardown
  // (kills any owned canvas session + drops the row).
  const deleteNodes = useCallback((ids: string[]) => {
    rfRef.current?.deleteElements({ nodes: ids.map((id) => ({ id })) });
    setMenu(null);
  }, []);

  const createNode = useCallback((kind: string) => {
    const size = KIND_SIZE[kind] ?? { w: 240, h: 140 };
    // Right-click menu gives an anchor; toolbar has none → drop at viewport centre.
    const flow = menu?.flow
      ?? rfRef.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      ?? { x: 0, y: 0 };
    const node: DbThreadNode = {
      id: crypto.randomUUID(), threadId, kind,
      x: flow.x, y: flow.y, width: size.w, height: size.h,
      branchId: null, sessionId: null, data: null,
    };
    saveThreadNode(node);
    setNodes((prev) => [...prev, toFlowNode(node)]);
    setMenu(null);
  }, [threadId, menu]);

  // A chat node's launch proposal → spawn an `agent` node on this canvas (plan
  // §6.4). The session is spawned first (canvas-placed, no tab), then the node is
  // created already bound to it — so SessionNode mounts with a live session and
  // renders its terminal immediately (no post-mount rebind race). Placed just right
  // of the firing chat node when known, else at the viewport centre.
  const launchAgentNode = useCallback(
    async (agentHint: string, prompt: string, model?: string, sourceNodeId?: string, worktreePath?: string) => {
      if (!spawnCanvasSession) return;
      // Drop a canvas MCP config into the agent's cwd so it discovers canvas_map /
      // read_canvas_node on its own (the Tempest Bridge — works for any launch path).
      const cwd = worktreePath ?? projectPath;
      if (cwd) { try { await invoke("write_canvas_mcp_config", { projectPath: cwd, projectId }); } catch { /* best-effort */ } }
      // Seed the CLI agent with canvas context (lineage from the firing chat + ambient map).
      const seed = buildAgentSeedContext(threadId, sourceNodeId);
      const seededPrompt = seed ? `${seed}\n\n---\n\n${prompt}` : prompt;
      const sid = await spawnCanvasSession(projectId, { agent: agentHint, prompt: seededPrompt, model, worktreePath });
      if (!sid) return;

      const src = sourceNodeId ? getThreadNodes(threadId).find((n) => n.id === sourceNodeId) : undefined;
      const size = KIND_SIZE.agent;
      let pos: { x: number; y: number };
      if (src) {
        pos = { x: src.x + (src.width ?? 700) + 40, y: src.y };
      } else {
        const c = rfRef.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        pos = c ?? { x: 0, y: 0 };
      }

      const node: DbThreadNode = {
        id: crypto.randomUUID(), threadId, kind: "agent",
        x: pos.x, y: pos.y, width: size.w, height: size.h,
        branchId: getSession(sid)?.branchId ?? null, sessionId: sid,
        data: JSON.stringify({ title: getSession(sid)?.name ?? agentHint }),
      };
      saveThreadNode(node);
      setNodes((prev) => [...prev, toFlowNode(node)]);
    },
    [projectId, threadId, spawnCanvasSession],
  );

  // Debounce viewport writes — pan/zoom fire continuously.
  const onMove = useCallback((_: unknown, vp: Viewport) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const t = getThread(threadId);
      if (t) saveThread({ ...t, viewport: JSON.stringify(vp) });
    }, 400);
  }, [threadId]);

  const thread = getThread(threadId);
  let defaultViewport: Viewport | undefined;
  try { if (thread?.viewport) defaultViewport = JSON.parse(thread.viewport); } catch { /* none */ }

  // Drives the alignment toolbar's visibility — only meaningful with 2+ nodes.
  const selectedCount = useMemo(() => nodes.reduce((n, node) => n + (node.selected ? 1 : 0), 0), [nodes]);

  const nodeCtx = useMemo(
    () => ({
      projectId, projectPath, atlasIndexed,
      onLaunchAgent: launchAgentNode,
      spawnCanvasSession: spawnCanvasSession ? (opts: { agent?: string; name?: string; prompt?: string; model?: string; worktreePath?: string }) => spawnCanvasSession(projectId, opts) : undefined,
      resumeCanvasSession,
      closeCanvasSession,
      worktrees,
      createCanvasWorktree: createCanvasWorktree ? (name: string) => createCanvasWorktree(projectId, name) : undefined,
      autoNameThread: autoNameThread ? (firstMessage: string) => autoNameThread(threadId, firstMessage) : undefined,
      setNodeCollapsed,
    }),
    [projectId, threadId, projectPath, atlasIndexed, launchAgentNode, spawnCanvasSession, resumeCanvasSession, closeCanvasSession, worktrees, createCanvasWorktree, autoNameThread, setNodeCollapsed],
  );

  // Wait for hydration so the saved viewport applies on ReactFlow mount
  // (defaultViewport is mount-only). Keep the tab mounted when hidden.
  if (!ready) return <div style={{ width: "100%", height: "100%", display: hidden ? "none" : "block" }} />;

  return (
    <ThreadNodeContext.Provider value={nodeCtx}>
    <div style={{ width: "100%", height: "100%", display: hidden ? "none" : "block" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectOnClick
        connectionMode={ConnectionMode.Loose}
        connectionLineStyle={{ stroke: "var(--tempest-accent-yellow, #f5c518)", strokeWidth: 3 }}
        defaultEdgeOptions={{ type: "thread", style: { stroke: "var(--tempest-accent-yellow, #f5c518)", strokeWidth: 3 } }}
        onMove={onMove}
        onPaneClick={() => setMenu(null)}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        defaultViewport={defaultViewport}
        fitView={!defaultViewport}
        proOptions={{ hideAttribution: true }}
        colorMode={theme.type}
      >
        <Background id="threads-bg" bgColor="var(--tempest-bg-editor)" color="var(--tempest-border-subtle)" gap={28} size={2.5} />
        <Controls />
        <MiniMap pannable zoomable />
        <Panel position="top-center">
          <div
            style={{
              display: "flex", gap: 2, padding: 3, borderRadius: 999,
              background: "var(--tempest-bg-elevated, #161616)",
              border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            }}
          >
            {([
              { title: "Tidy canvas", Icon: LayoutGrid, onClick: tidy },
              { title: "Minimize all nodes", Icon: Minimize2, onClick: () => setAllCollapsed(true) },
              { title: "Maximize all nodes", Icon: Maximize2, onClick: () => setAllCollapsed(false) },
              "sep",
              { title: "Add chat node", Icon: MessagesSquare, onClick: () => createNode("chat") },
              { title: "Add text note", Icon: StickyNote, onClick: () => createNode("text") },
              { title: "Add agent node", Icon: Bot, onClick: () => createNode("agent") },
              { title: "Add terminal node", Icon: SquareTerminal, onClick: () => createNode("terminal") },
              "sep",
              { title: "Add image", Icon: ImageIcon, onClick: () => createNode("image") },
              { title: "Add file", Icon: FileText, onClick: () => createNode("file") },
              { title: "Add site (scrape)", Icon: Globe, onClick: () => createNode("site") },
              { title: "Add media (transcribe)", Icon: Play, onClick: () => createNode("media") },
            ] as const).map((b, i, arr) =>
              b === "sep" ? (
                <div key={i} style={{ width: 1, alignSelf: "stretch", margin: "2px 3px", background: "var(--tempest-border-subtle, #2a2a2a)" }} />
              ) : (
                <Tooltip key={b.title} content={b.title} placement="bottom">
                  <button
                    onClick={b.onClick}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28, border: "none",
                      borderRadius: [
                        i === 0 ? 999 : 5,
                        i === arr.length - 1 ? 999 : 5,
                        i === arr.length - 1 ? 999 : 5,
                        i === 0 ? 999 : 5,
                      ].map((r) => `${r}px`).join(" "),
                      background: "transparent", color: "var(--tempest-fg-default, #e6e6e6)", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tempest-bg-hover, #232323)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <b.Icon size={15} />
                  </button>
                </Tooltip>
              )
            )}
          </div>
        </Panel>

        {selectedCount >= 2 && (
          <Panel position="bottom-center">
            <div
              style={{
                display: "flex", alignItems: "center", gap: 2, padding: 3, borderRadius: 999,
                background: "var(--tempest-bg-elevated, #161616)",
                border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              <span style={{ padding: "0 8px", color: "var(--tempest-fg-muted, #888)", font: '12px "Geist", system-ui, sans-serif' }}>
                {selectedCount} selected
              </span>
              <div style={{ width: 1, alignSelf: "stretch", margin: "2px 1px", background: "var(--tempest-border-subtle, #2a2a2a)" }} />
              {([
                { title: "Align left", Icon: AlignStartVertical, onClick: () => alignSelection("left") },
                { title: "Align center horizontally", Icon: AlignCenterVertical, onClick: () => alignSelection("hcenter") },
                { title: "Align right", Icon: AlignEndVertical, onClick: () => alignSelection("right") },
                "sep",
                { title: "Align top", Icon: AlignStartHorizontal, onClick: () => alignSelection("top") },
                { title: "Align middle", Icon: AlignCenterHorizontal, onClick: () => alignSelection("vcenter") },
                { title: "Align bottom", Icon: AlignEndHorizontal, onClick: () => alignSelection("bottom") },
                "sep",
                { title: "Distribute horizontally", Icon: AlignHorizontalDistributeCenter, onClick: () => alignSelection("distributeH") },
                { title: "Distribute vertically", Icon: AlignVerticalDistributeCenter, onClick: () => alignSelection("distributeV") },
              ] as const).map((b, i) =>
                b === "sep" ? (
                  <div key={i} style={{ width: 1, alignSelf: "stretch", margin: "2px 3px", background: "var(--tempest-border-subtle, #2a2a2a)" }} />
                ) : (
                  <Tooltip key={b.title} content={b.title} placement="top">
                    <button
                      onClick={b.onClick}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, border: "none", borderRadius: 5,
                        background: "transparent", color: "var(--tempest-fg-default, #e6e6e6)", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tempest-bg-hover, #232323)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <b.Icon size={15} />
                    </button>
                  </Tooltip>
                )
              )}
            </div>
          </Panel>
        )}

        <ClickConnectLine />
      </ReactFlow>

      {menu && (
        <div
          ref={menuRef}
          className="thread-node-menu"
          style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 10, ...menuStyle }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div style={menuLabelStyle}>Canvas</div>
          {[
            { label: "Tidy canvas", Icon: LayoutGrid, run: tidy },
            { label: "Minimize all", Icon: Minimize2, run: () => setAllCollapsed(true) },
            { label: "Maximize all", Icon: Maximize2, run: () => setAllCollapsed(false) },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.run(); setMenu(null); }}
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tempest-bg-hover, #232323)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <item.Icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
              {item.label}
            </button>
          ))}

          <div style={menuSepStyle} />

          <div style={menuLabelStyle}>Add node</div>
          {[
            { kind: "chat", label: "Chat node", Icon: MessagesSquare },
            { kind: "text", label: "Text note", Icon: StickyNote },
            { kind: "agent", label: "Agent node", Icon: Bot },
            { kind: "terminal", label: "Terminal node", Icon: SquareTerminal },
            { kind: "image", label: "Image", Icon: ImageIcon },
            { kind: "file", label: "File", Icon: FileText },
            { kind: "site", label: "Site (scrape)", Icon: Globe },
            { kind: "media", label: "Media (transcribe)", Icon: Play },
          ].map((item) => (
            <button
              key={item.kind}
              onClick={() => createNode(item.kind)}
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tempest-bg-hover, #232323)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <item.Icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
              {item.label}
            </button>
          ))}

          <div style={menuSepStyle} />

          <div style={menuLabelStyle}>Danger</div>
          {[
            { key: "one", label: "Delete node", Icon: Trash2, disabled: !menu.nodeId, run: () => menu.nodeId && deleteNodes([menu.nodeId]) },
            { key: "all", label: "Delete all nodes", Icon: Trash, disabled: nodes.length === 0, run: () => deleteNodes(nodes.map((n) => n.id)) },
          ].map((item) => (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={item.run}
              style={{ ...menuItemStyle, color: "var(--tempest-accent-red, #e5484d)", opacity: item.disabled ? 0.4 : 1, cursor: item.disabled ? "not-allowed" : "pointer" }}
              onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "var(--tempest-bg-hover, #232323)"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <item.Icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
    </ThreadNodeContext.Provider>
  );
}
