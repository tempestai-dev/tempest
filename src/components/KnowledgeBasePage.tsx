import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader, ZoomIn, ZoomOut, Maximize2, RotateCcw } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
} from "@xyflow/react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { getOpenProjects } from "../store/openProjects";
import "@xyflow/react/dist/style.css";
import "./KnowledgeBasePage.css";

cytoscape.use(fcose);

interface IndexedProject {
  id: string;
  name: string;
  path: string;
}

interface SymbolNode {
  id: string;
  name: string;
  kind: string;
  file_path: string;
  start_line: number;
  end_line: number;
  language: string;
}

interface SymbolEdge {
  source: string;
  target: string;
  kind: string;
}

interface GraphData {
  nodes: SymbolNode[];
  edges: SymbolEdge[];
}

type LoadState = "idle" | "loading" | "streaming" | "ready" | "error";

// Data carried on each React Flow node of type "symbol"
interface SymbolNodeData {
  label: string;
  color: string;
  [key: string]: unknown;
}

type SymbolRFNode = RFNode<SymbolNodeData, "symbol">;

// Threshold above which we switch edges from SVG (React Flow) to a canvas overlay.
const CANVAS_EDGE_THRESHOLD = 800;
// Number of nodes committed to React Flow state per animation frame.
const STREAM_BATCH_SIZE = 300;

const PROGRESS: Record<string, number> = {
  db:         10,
  found:      20,
  filtered:   28,
  dispatched: 35,
  init:       42,
  simulation: 50,
  transfer:   90,
  assemble:   96,
};

function resolveKindColors(): Record<string, string> {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--tempest-${n}`).trim();
  return {
    function:  v("accent-blue"),
    method:    v("accent-blue"),
    class:     v("accent-yellow"),
    interface: v("accent-green"),
    type:      "#9b59b6",
    variable:  v("fg-muted"),
    constant:  v("fg-muted"),
    _default:  v("fg-subtle"),
  };
}

function gridPositions(ids: string[]): Map<string, { x: number; y: number }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const gap = 60;
  const m = new Map<string, { x: number; y: number }>();
  ids.forEach((id, i) => {
    m.set(id, { x: (i % cols) * gap, y: Math.floor(i / cols) * gap });
  });
  return m;
}

// --- Parallel layout helpers -------------------------------------------------

// Round-robin assignment by index — simple, no graph library needed. An edge is
// kept in a partition only when BOTH endpoints land in that same partition;
// cross-partition edges become dangling and are laid out independently.
function partitionNodes(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
  numPartitions: number
): Array<{ nodes: { id: string }[]; edges: { source: string; target: string }[] }> {
  const partitions = Array.from({ length: numPartitions }, () => ({
    nodes: [] as { id: string }[],
    edges: [] as { source: string; target: string }[],
  }));
  nodes.forEach((n, i) => partitions[i % numPartitions].nodes.push(n));
  const nodePart = new Map(nodes.map((n, i) => [n.id, i % numPartitions]));
  edges.forEach((e) => {
    const sp = nodePart.get(e.source);
    const tp = nodePart.get(e.target);
    if (sp !== undefined && sp === tp) partitions[sp].edges.push(e);
  });
  return partitions;
}

// Arrange each partition's laid-out positions into a non-overlapping grid of
// bounding boxes with fixed padding between cells.
function mergePartitionPositions(
  partitionResults: Array<{ positions: { id: string; x: number; y: number }[] }>
): Map<string, { x: number; y: number }> {
  const PADDING = 200;
  const cols = Math.ceil(Math.sqrt(partitionResults.length));
  const merged = new Map<string, { x: number; y: number }>();

  let cellW = 0, cellH = 0;
  const boxes = partitionResults.map(({ positions }) => {
    if (positions.length === 0) return { minX: 0, minY: 0, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX, h = maxY - minY;
    cellW = Math.max(cellW, w);
    cellH = Math.max(cellH, h);
    return { minX, minY, w, h };
  });

  partitionResults.forEach(({ positions }, pi) => {
    const col = pi % cols, row = Math.floor(pi / cols);
    const offsetX = col * (cellW + PADDING) - (boxes[pi]?.minX ?? 0);
    const offsetY = row * (cellH + PADDING) - (boxes[pi]?.minY ?? 0);
    for (const p of positions) {
      merged.set(p.id, { x: p.x + offsetX, y: p.y + offsetY });
    }
  });
  return merged;
}

// Commit nodes to React Flow state in batches across animation frames so a huge
// graph appears progressively instead of freezing the UI thread on one giant
// synchronous reconciliation.
function streamNodesToReactFlow(
  allNodes: SymbolRFNode[],
  allEdges: RFEdge[],
  setNodes: (nodes: SymbolRFNode[]) => void,
  setEdges: (edges: RFEdge[]) => void,
  setLoadState: (s: LoadState) => void,
  setStreamPct: (p: number) => void,
  rafRef: { current: number | null },
  batchSize = STREAM_BATCH_SIZE
) {
  // Edges go in first (they may reference not-yet-rendered nodes — RF tolerates
  // this). For large graphs the caller passes [] here and uses the canvas overlay.
  setEdges(allEdges);

  const total = allNodes.length;
  let idx = 0;
  // Show the canvas immediately; keep a small non-blocking strip until done.
  setLoadState(total > 0 ? "streaming" : "ready");
  setStreamPct(0);

  const tick = () => {
    idx += batchSize;
    setNodes(allNodes.slice(0, idx));
    if (idx < total) {
      setStreamPct(Math.min(99, Math.round((idx / total) * 100)));
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setStreamPct(100);
      setLoadState("ready");
      rafRef.current = null;
    }
  };
  rafRef.current = requestAnimationFrame(tick);
}

// Custom React Flow node — a small colored dot with a label below it.
function SymbolFlowNode({ data }: NodeProps<SymbolRFNode>) {
  return (
    <div className="kb-node">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="kb-node-handle"
      />
      <div className="kb-node-dot" style={{ background: data.color }} />
      <div className="kb-node-label">{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="kb-node-handle"
      />
    </div>
  );
}

const nodeTypes = { symbol: SymbolFlowNode };

function buildRFNodes(
  graphNodes: SymbolNode[],
  posMap: Map<string, { x: number; y: number }>
): SymbolRFNode[] {
  const colors = resolveKindColors();
  return graphNodes.map((n) => {
    const p = posMap.get(n.id);
    return {
      id: n.id,
      type: "symbol",
      position: p ? { x: p.x, y: p.y } : { x: 0, y: 0 },
      data: { label: n.name, color: colors[n.kind] ?? colors._default },
    };
  });
}

function buildRFEdges(validEdges: SymbolEdge[]): RFEdge[] {
  const s = getComputedStyle(document.documentElement);
  const edgeColor = s.getPropertyValue("--tempest-border-subtle").trim();
  return validEdges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    type: "straight",
    style: { stroke: edgeColor, strokeWidth: 0.5, opacity: 0.4 },
  }));
}

function KnowledgeBaseInner() {
  const reactFlowInstance = useReactFlow();

  const [indexedProjects, setIndexedProjects] = useState<IndexedProject[]>([]);
  const [projectsResolved, setProjectsResolved] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<SymbolRFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [selectedNode, setSelectedNode] = useState<SymbolNode | null>(null);
  const [logLine, setLogLine] = useState("");
  const [progress, setProgress] = useState(0);
  const [streamPct, setStreamPct] = useState(0);
  const [useCanvasEdges, setUseCanvasEdges] = useState(false);

  const nodeMapRef = useRef<Map<string, SymbolNode>>(new Map());
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parallel-layout bookkeeping
  const activeWorkersRef = useRef<Worker[]>([]);
  const workerFractionsRef = useRef<number[]>([]);
  const streamRafRef = useRef<number | null>(null);

  // Canvas edge overlay bookkeeping
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRafRef = useRef<number | null>(null);
  const nodePosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const edgesForCanvasRef = useRef<{ source: string; target: string }[]>([]);

  const clearSimTimer = () => {
    if (simTimerRef.current !== null) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  };

  const clearWatchdog = () => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const terminateWorkers = () => {
    activeWorkersRef.current.forEach((w) => w.terminate());
    activeWorkersRef.current = [];
  };

  const cancelStreamRaf = () => {
    if (streamRafRef.current !== null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  };

  // --- Canvas edge rendering -------------------------------------------------

  const drawEdges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x: ox, y: oy, zoom } = reactFlowInstance.getViewport();
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(ox, oy);
    ctx.scale(zoom, zoom);

    const edgeColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--tempest-border-subtle")
      .trim();
    ctx.strokeStyle = edgeColor || "#444";
    ctx.lineWidth = 0.5 / zoom; // stay 0.5px regardless of zoom
    ctx.globalAlpha = 0.4;
    ctx.beginPath();

    const posMap = nodePosRef.current;
    for (const edge of edgesForCanvasRef.current) {
      const s = posMap.get(edge.source);
      const t = posMap.get(edge.target);
      if (!s || !t) continue;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();
    ctx.restore();
  }, [reactFlowInstance]);

  const scheduleDraw = useCallback(() => {
    if (canvasRafRef.current !== null) cancelAnimationFrame(canvasRafRef.current);
    canvasRafRef.current = requestAnimationFrame(() => {
      canvasRafRef.current = null;
      drawEdges();
    });
  }, [drawEdges]);

  // Keep nodeId → center-position lookup fresh as nodes stream in. Symbol nodes
  // are ~10px dots, so the center is offset +5px on each axis from the RF
  // top-left position.
  useEffect(() => {
    nodePosRef.current = new Map(
      nodes.map((n) => [n.id, { x: n.position.x + 5, y: n.position.y + 5 }])
    );
    if (useCanvasEdges) scheduleDraw();
  }, [nodes, useCanvasEdges, scheduleDraw]);

  // Size the canvas to its container (HiDPI-aware) and redraw on resize.
  useEffect(() => {
    if (!useCanvasEdges) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      scheduleDraw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [useCanvasEdges, scheduleDraw]);

  // React Flow viewport change: redraw canvas edges + toggle level-of-detail.
  const handleMove = useCallback(
    (_ev: MouseEvent | TouchEvent | null, vp: { x: number; y: number; zoom: number }) => {
      if (containerRef.current) {
        containerRef.current.classList.toggle("kb-flow--zoomed-out", vp.zoom < 0.4);
      }
      if (useCanvasEdges) scheduleDraw();
    },
    [useCanvasEdges, scheduleDraw]
  );

  // Discover indexed projects on mount
  useEffect(() => {
    const open = getOpenProjects();
    Promise.all(
      open.map((p) =>
        invoke<boolean>("check_atlas_db", { projectPath: p.path })
          .then((ok) => (ok ? { id: p.id, name: p.name, path: p.path } : null))
          .catch(() => null)
      )
    ).then((results) => {
      const indexed = results.filter((r): r is IndexedProject => r !== null);
      setIndexedProjects(indexed);
      setProjectsResolved(true);
      if (indexed.length > 0) setSelectedPath(indexed[0].path);
    });
  }, []);

  // Tear everything down on unmount
  useEffect(() => {
    return () => {
      terminateWorkers();
      cancelStreamRaf();
      if (canvasRafRef.current !== null) cancelAnimationFrame(canvasRafRef.current);
      clearSimTimer();
      clearWatchdog();
    };
  }, []);

  // Fetch + lay out graph when selectedPath changes
  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;

    terminateWorkers();
    cancelStreamRaf();
    clearSimTimer();
    clearWatchdog();
    setLoadState("loading");
    setSelectedNode(null);
    setNodes([]);
    setEdges([]);
    setUseCanvasEdges(false);
    setStreamPct(0);
    setProgress(PROGRESS.db);
    setLogLine("Querying symbol database…");

    // Commit final positions: stream nodes into RF in frames, and pick edge
    // rendering strategy (SVG vs canvas overlay) based on graph size.
    const finishWithPositions = (
      graphNodes: SymbolNode[],
      validEdges: SymbolEdge[],
      posMap: Map<string, { x: number; y: number }>
    ) => {
      clearSimTimer();
      clearWatchdog();
      setProgress(100);

      const allNodes = buildRFNodes(graphNodes, posMap);
      const canvasEdges = allNodes.length > CANVAS_EDGE_THRESHOLD;
      setUseCanvasEdges(canvasEdges);

      if (canvasEdges) {
        // Edges rendered off-DOM on a canvas overlay; no RF edges at all.
        edgesForCanvasRef.current = validEdges.map((e) => ({
          source: e.source,
          target: e.target,
        }));
        streamNodesToReactFlow(
          allNodes,
          [],
          setNodes,
          setEdges,
          setLoadState,
          setStreamPct,
          streamRafRef
        );
      } else {
        edgesForCanvasRef.current = [];
        streamNodesToReactFlow(
          allNodes,
          buildRFEdges(validEdges),
          setNodes,
          setEdges,
          setLoadState,
          setStreamPct,
          streamRafRef
        );
      }
    };

    invoke<GraphData>("get_atlas_graph", { projectPath: selectedPath })
      .then((graph) => {
        if (cancelled) return;

        setProgress(PROGRESS.found);
        setLogLine(`Found ${graph.nodes.length} symbols, ${graph.edges.length} edges`);

        const ids = new Set(graph.nodes.map((n) => n.id));
        nodeMapRef.current = new Map(graph.nodes.map((n) => [n.id, n]));
        const validEdges = graph.edges.filter(
          (e) => ids.has(e.source) && ids.has(e.target)
        );

        const dropped = graph.edges.length - validEdges.length;
        setProgress(PROGRESS.filtered);
        if (dropped > 0) setLogLine(`Filtered ${dropped} dangling edges`);

        // Small graphs: run layout on the main thread — no worker overhead
        if (graph.nodes.length < 200) {
          setProgress(PROGRESS.simulation);
          setLogLine("Laying out on main thread…");
          const tmp = cytoscape({
            headless: true,
            styleEnabled: false,
            elements: {
              nodes: graph.nodes.map((n) => ({ data: { id: n.id } })),
              edges: validEdges.map((e, i) => ({
                data: { id: `e${i}`, source: e.source, target: e.target },
              })),
            },
          });
          const lay = tmp.layout({
            name: "fcose",
            animate: false,
            randomize: true,
            fit: false,
            nodeRepulsion: 4500,
            idealEdgeLength: 80,
            numIter: 2500,
            tile: true,
          } as any);
          lay.one("layoutstop", () => {
            const posMap = new Map(
              tmp.nodes().map((n) => [n.id(), { x: n.position().x, y: n.position().y }])
            );
            tmp.destroy();
            if (!cancelled) finishWithPositions(graph.nodes, validEdges, posMap);
          });
          lay.run();
          return;
        }

        // Large graphs: partition the graph and lay out each chunk in parallel
        // across multiple workers, then merge the partition boxes into a grid.
        const numPartitions = Math.min(
          6,
          Math.max(2, navigator.hardwareConcurrency || 2)
        );
        const simpleNodes = graph.nodes.map((n) => ({ id: n.id }));
        const simpleEdges = validEdges.map((e) => ({
          source: e.source,
          target: e.target,
        }));
        const parts = partitionNodes(simpleNodes, simpleEdges, numPartitions);

        setProgress(PROGRESS.dispatched);
        setLogLine(
          `Laying out ${graph.nodes.length} symbols across ${numPartitions} workers…`
        );

        const fractions = new Array(numPartitions).fill(0);
        workerFractionsRef.current = fractions;

        const stageFraction = (msg: string): number =>
          msg.startsWith("Initializing")
            ? 0.15
            : msg.startsWith("Running")
            ? 0.4
            : msg.startsWith("Transferring")
            ? 0.9
            : 0;

        // Smoothly creep the averaged progress during the long "Running" phase.
        simTimerRef.current = setInterval(() => {
          const f = workerFractionsRef.current;
          for (let i = 0; i < f.length; i++) {
            if (f[i] >= 0.4 && f[i] < 0.85) f[i] = Math.min(0.85, f[i] + 0.02);
          }
          const avg = f.reduce((a, b) => a + b, 0) / (f.length || 1);
          setProgress(
            PROGRESS.dispatched + avg * (PROGRESS.transfer - PROGRESS.dispatched)
          );
        }, 200);

        const workers: Worker[] = [];
        activeWorkersRef.current = workers;

        const runPartition = (
          part: { nodes: { id: string }[]; edges: { source: string; target: string }[] },
          i: number
        ): Promise<{ id: string; x: number; y: number }[]> =>
          new Promise((resolve, reject) => {
            const w = new Worker(
              new URL("../workers/graphLayout.worker.ts", import.meta.url),
              { type: "module" }
            );
            workers.push(w);
            w.onmessage = (
              ev: MessageEvent<{
                progress?: string;
                error?: string;
                positions?: { id: string; x: number; y: number }[];
              }>
            ) => {
              const d = ev.data;
              if (d.error) {
                w.terminate();
                reject(new Error(d.error));
                return;
              }
              if (d.progress) {
                const fr = stageFraction(d.progress);
                if (fr > fractions[i]) fractions[i] = fr;
                return;
              }
              if (d.positions) {
                fractions[i] = 1;
                w.terminate();
                resolve(d.positions);
              }
            };
            w.onerror = (e) => {
              w.terminate();
              reject(new Error(e.message || "Layout worker error"));
            };
            w.postMessage({ nodes: part.nodes, edges: part.edges });
          });

        // 30s watchdog — fall back to grid if the workers never finish
        watchdogRef.current = setTimeout(() => {
          if (cancelled) return;
          terminateWorkers();
          clearSimTimer();
          setLogLine("Layout timed out — using grid fallback");
          finishWithPositions(
            graph.nodes,
            validEdges,
            gridPositions(graph.nodes.map((n) => n.id))
          );
        }, 30_000);

        Promise.all(parts.map((p, i) => runPartition(p, i)))
          .then((results) => {
            if (cancelled) return;
            clearSimTimer();
            clearWatchdog();
            activeWorkersRef.current = [];
            setProgress(PROGRESS.assemble);
            setLogLine("Merging partition layouts…");
            const merged = mergePartitionPositions(
              results.map((positions) => ({ positions }))
            );
            finishWithPositions(graph.nodes, validEdges, merged);
          })
          .catch((err) => {
            if (cancelled) return;
            terminateWorkers();
            clearSimTimer();
            clearWatchdog();
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setLoadState("error");
          });
      })
      .catch((err) => {
        if (cancelled) return;
        clearSimTimer();
        clearWatchdog();
        setErrorMsg(String(err));
        setLoadState("error");
      });

    return () => {
      cancelled = true;
      terminateWorkers();
      cancelStreamRaf();
      clearSimTimer();
      clearWatchdog();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  const onNodeClick = useCallback(
    (_ev: React.MouseEvent, node: RFNode) => {
      setSelectedNode(nodeMapRef.current.get(node.id) ?? null);
    },
    []
  );

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const zoomIn = useCallback(() => reactFlowInstance.zoomIn(), [reactFlowInstance]);
  const zoomOut = useCallback(() => reactFlowInstance.zoomOut(), [reactFlowInstance]);
  const fit = useCallback(
    () => reactFlowInstance.fitView({ padding: 0.1 }),
    [reactFlowInstance]
  );
  const resetZoom = useCallback(
    () => reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 }),
    [reactFlowInstance]
  );

  const graphVisible = loadState === "ready" || loadState === "streaming";
  const hasGraph = graphVisible && nodes.length > 0;

  return (
    <div className="kb-root">
      <div className="kb-toolbar">
        <select
          className="kb-project-select"
          value={selectedPath ?? ""}
          onChange={(e) => setSelectedPath(e.target.value)}
          disabled={indexedProjects.length === 0}
        >
          {indexedProjects.length === 0 ? (
            <option value="">No indexed projects</option>
          ) : (
            indexedProjects.map((p) => (
              <option key={p.id} value={p.path}>
                {p.name}
              </option>
            ))
          )}
        </select>

        <div className="kb-toolbar-divider" />

        <button
          className="kb-tool-btn"
          title="Zoom in"
          onClick={zoomIn}
          disabled={!hasGraph}
        >
          <ZoomIn size={14} />
        </button>
        <button
          className="kb-tool-btn"
          title="Zoom out"
          onClick={zoomOut}
          disabled={!hasGraph}
        >
          <ZoomOut size={14} />
        </button>
        <button
          className="kb-tool-btn"
          title="Fit to screen"
          onClick={fit}
          disabled={!hasGraph}
        >
          <Maximize2 size={14} />
        </button>
        <button
          className="kb-tool-btn"
          title="Reset zoom"
          onClick={resetZoom}
          disabled={!hasGraph}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="kb-canvas-wrap" ref={containerRef}>
        {projectsResolved && indexedProjects.length === 0 && (
          <div className="kb-empty">
            <span className="kb-empty-title">No indexed projects</span>
            <span className="kb-empty-desc">
              Index a project with Atlas to see its code graph.
            </span>
          </div>
        )}

        {loadState === "loading" && (
          <div className="kb-loader">
            <Loader size={28} className="kb-loader-spin" />
            <div className="kb-loader-header">
              <span className="kb-loader-text">Building graph…</span>
              <span className="kb-loader-pct">{Math.round(progress)}%</span>
            </div>
            <div className="kb-progress-track">
              <div
                className="kb-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="kb-log-line">{logLine}</span>
          </div>
        )}

        {loadState === "error" && (
          <div className="kb-empty">
            <span className="kb-empty-title">Failed to load graph</span>
            <span className="kb-empty-desc">{errorMsg}</span>
          </div>
        )}

        {graphVisible && (
          <>
            <ReactFlow
              className="kb-flow"
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onMove={handleMove}
              fitView
              onlyRenderVisibleElements
              minZoom={0.05}
              maxZoom={3}
              proOptions={{ hideAttribution: true }}
            />
            {useCanvasEdges && (
              <canvas ref={canvasRef} className="kb-edge-canvas" />
            )}
            {loadState === "streaming" && (
              <div className="kb-stream-strip" title="Rendering nodes…">
                <div
                  className="kb-stream-strip-fill"
                  style={{ width: `${streamPct}%` }}
                />
              </div>
            )}
          </>
        )}

        {selectedNode && (
          <div className="kb-detail">
            <button
              className="kb-detail-close"
              onClick={() => setSelectedNode(null)}
            >
              ×
            </button>
            <div className="kb-detail-name">{selectedNode.name}</div>
            <div className="kb-detail-kind">{selectedNode.kind}</div>
            <div className="kb-detail-row">
              <span>File</span>
              {selectedNode.file_path}
            </div>
            <div className="kb-detail-row">
              <span>Line</span>
              {selectedNode.start_line}
            </div>
            <div className="kb-detail-row">
              <span>Lang</span>
              {selectedNode.language}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function KnowledgeBasePage() {
  return (
    <ReactFlowProvider>
      <KnowledgeBaseInner />
    </ReactFlowProvider>
  );
}
