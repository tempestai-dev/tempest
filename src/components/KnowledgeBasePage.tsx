import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader } from "lucide-react";
import {
  forceSimulation,
  forceManyBody,
  forceLink as forceLinks,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3-force";
import { getOpenProjects } from "../store/openProjects";
import type {
  IndexedProject,
  GraphData,
  LoadState,
  GNode,
  GLink,
} from "../types/knowledgeGraph";
import { resolveKindColors, nodeRadius, MINIMAP_W, MINIMAP_H } from "../lib/knowledgeGraph";
import { renderGraph, type MinimapTf } from "../lib/knowledgeGraphRender";
import { NodeDetailPanel } from "./KnowledgeBasePage/NodeDetailPanel";
import { KbToolbar } from "./KnowledgeBasePage/KbToolbar";
import "./KnowledgeBasePage.css";

// ── Component ──────────────────────────────────────────────────────────────

export function KnowledgeBasePage() {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const containerRef     = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // UI state (drives React renders)
  const [indexedProjects,  setIndexedProjects]  = useState<IndexedProject[]>([]);
  const [projectsResolved, setProjectsResolved] = useState(false);
  const [selectedPath,     setSelectedPath]     = useState<string | null>(null);
  const [loadState,        setLoadState]        = useState<LoadState>("idle");
  const [errorMsg,         setErrorMsg]         = useState("");
  const [logLine,          setLogLine]          = useState("");
  const [progress,         setProgress]         = useState(0);
  const [detailNode,       setDetailNode]       = useState<GNode | null>(null);

  // Ref mirror of detail node so the render fn can read it without re-rendering
  const detailNodeRef = useRef<GNode | null>(null);

  // Graph / simulation
  const simRef   = useRef<Simulation<GNode, GLink> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);

  // Camera — world→screen:  screen = world * zoom + (x, y)
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });

  // Hover state
  const hoverNodeRef   = useRef<GNode | null>(null);
  const neighborIdsRef = useRef<Set<string>>(new Set());
  const connLinksRef   = useRef<Set<GLink>>(new Set());

  // Selection neighborhood — persists after hover moves away from the selected node
  const selNeighborIdsRef = useRef<Set<string>>(new Set());
  const selConnLinksRef   = useRef<Set<GLink>>(new Set());

  // Drag / pan
  const dragNodeRef = useRef<GNode | null>(null);
  const panStartRef = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const didMoveRef  = useRef(false);

  // Pinch-to-zoom (multi-pointer). Tracks active touch pointers by id.
  const pinchRef        = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  // Minimap world→minimap transform, updated each frame by renderMinimap()
  const minimapTfRef = useRef<MinimapTf>(null);

  // RAF
  const rafRef    = useRef<number | null>(null);

  const render = useCallback(() => {
    renderGraph({
      canvas: canvasRef.current,
      minimap: minimapCanvasRef.current,
      nodes: nodesRef.current,
      links: linksRef.current,
      camera: camRef.current,
      hovered: hoverNodeRef.current,
      selected: detailNodeRef.current,
      hoverNeighborIds: neighborIdsRef.current,
      hoverConnLinks: connLinksRef.current,
      selNeighborIds: selNeighborIdsRef.current,
      selConnLinks: selConnLinksRef.current,
      setMinimapTf: (tf) => { minimapTfRef.current = tf; },
    });
  }, []);

  // ── Single-frame render request ────────────────────────────────────────────

  const requestRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  }, [render]);

  // ── Hit test (world-space distance to each node) ───────────────────────────

  const hitTest = useCallback((mx: number, my: number): GNode | null => {
    const { x: tx, y: ty, zoom } = camRef.current;
    const wx = (mx - tx) / zoom, wy = (my - ty) / zoom;
    let best: GNode | null = null, bestD = 14 / zoom;
    for (const n of nodesRef.current) {
      const dx = wx - n.x, dy = wy - n.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < n.radius + bestD) { bestD = d - n.radius; best = n; }
    }
    return best;
  }, []);

  // ── Hover (neighbor sets) ──────────────────────────────────────────────────

  const setHover = useCallback((node: GNode | null) => {
    if (node === hoverNodeRef.current) return;
    hoverNodeRef.current = node;
    if (!node) {
      neighborIdsRef.current = new Set();
      connLinksRef.current   = new Set();
    } else {
      const ids = new Set<string>(), lks = new Set<GLink>();
      for (const l of linksRef.current) {
        if      (l.source === node) { ids.add(l.target.id); lks.add(l); }
        else if (l.target === node) { ids.add(l.source.id); lks.add(l); }
      }
      neighborIdsRef.current = ids;
      connLinksRef.current   = lks;
    }
    requestRender();
  }, [requestRender]);

  // ── Canvas event helpers ───────────────────────────────────────────────────

  // getXY is inside handlers' closure; canvasRef is stable so this always reads
  // the current bounding rect even though the fn is captured at effect-creation time.
  const getXY = (e: MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  };

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { mx, my } = getXY(e);
    const node = hitTest(mx, my);
    didMoveRef.current = false;
    if (node) {
      dragNodeRef.current = node;
      node.fx = node.x; node.fy = node.y;
    } else {
      panStartRef.current = { mx, my, tx: camRef.current.x, ty: camRef.current.y };
    }
  }, [hitTest]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const { mx, my } = getXY(e);
    const canvas = canvasRef.current;

    if (dragNodeRef.current) {
      didMoveRef.current = true;
      const { x: tx, y: ty, zoom } = camRef.current;
      dragNodeRef.current.fx = (mx - tx) / zoom;
      dragNodeRef.current.fy = (my - ty) / zoom;
      // Reheat the simulation slightly so other nodes react
      simRef.current?.alpha(0.3).restart();
      requestRender();
      if (canvas) canvas.style.cursor = "grabbing";
    } else if (panStartRef.current) {
      const s = panStartRef.current;
      const dx = mx - s.mx, dy = my - s.my;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMoveRef.current = true;
      camRef.current.x = s.tx + dx;
      camRef.current.y = s.ty + dy;
      requestRender();
      if (canvas) canvas.style.cursor = "grabbing";
    } else {
      const node = hitTest(mx, my);
      setHover(node);
      if (canvas) canvas.style.cursor = node ? "pointer" : "grab";
    }
  }, [hitTest, setHover, requestRender]);

  const handleMouseUp = useCallback((_e: MouseEvent) => {
    const moved = didMoveRef.current;
    const drag  = dragNodeRef.current;
    const canvas = canvasRef.current;

    if (drag) {
      if (!moved) {
        // Click on node → select / deselect
        const next = (drag === detailNodeRef.current) ? null : drag;
        detailNodeRef.current = next;
        setDetailNode(next);
        // Build persistent selection neighborhood so highlight survives hover moves
        if (next) {
          const ids = new Set<string>(), lks = new Set<GLink>();
          for (const l of linksRef.current) {
            if      (l.source === next) { ids.add(l.target.id); lks.add(l); }
            else if (l.target === next) { ids.add(l.source.id); lks.add(l); }
          }
          selNeighborIdsRef.current = ids;
          selConnLinksRef.current   = lks;
        } else {
          selNeighborIdsRef.current = new Set();
          selConnLinksRef.current   = new Set();
        }
      }
      drag.fx = null; drag.fy = null;
      dragNodeRef.current = null;
      simRef.current?.alpha(0.08).restart();
      requestRender();
    } else if (!moved && panStartRef.current) {
      // Click on background → deselect
      detailNodeRef.current = null;
      setDetailNode(null);
      selNeighborIdsRef.current = new Set();
      selConnLinksRef.current   = new Set();
      requestRender();
    }

    panStartRef.current = null;
    didMoveRef.current  = false;
    if (canvas) canvas.style.cursor = hoverNodeRef.current ? "pointer" : "grab";
  }, [requestRender]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const { mx, my } = getXY(e);
    const { x: tx, y: ty, zoom } = camRef.current;

    // ctrlKey === true on all browsers/OSes for trackpad pinch gestures.
    // Pinch deltaY is in pixels and small (1–5 per event), so use exponential
    // scaling for smooth continuous zoom. Regular scroll wheel uses coarse steps.
    const factor = e.ctrlKey
      ? Math.pow(0.98, e.deltaY)      // pinch: proportional, smooth
      : e.deltaY < 0 ? 1.1 : 1 / 1.1; // wheel: stepped

    const nz = Math.min(6, Math.max(0.02, zoom * factor));
    camRef.current = {
      x: mx - (mx - tx) * (nz / zoom),
      y: my - (my - ty) * (nz / zoom),
      zoom: nz,
    };
    requestRender();
  }, [requestRender]);

  const handleMouseLeave = useCallback(() => {
    setHover(null);
    if (!dragNodeRef.current) panStartRef.current = null;
  }, [setHover]);

  // ── Pinch-to-zoom (Pointer Events) ───────────────────────────────────────────
  // WebView2 on Windows intercepts touchpad pinch as ctrl+wheel (handled in
  // handleWheel as a fallback), but touchscreen pinch never reaches wheel. We
  // track two active touch pointers, measure the distance between them each
  // frame, and zoom toward their midpoint. touch-action:none on .kb-canvas keeps
  // the browser from handling the gesture itself. Single-pointer touch is left to
  // the existing mouse-event drag/pan path (which fires via compat mouse events).

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pinchRef.current.size === 2) {
      // A second finger down → cancel any in-progress single-pointer drag/pan so
      // it doesn't fight the pinch.
      if (dragNodeRef.current) {
        dragNodeRef.current.fx = null;
        dragNodeRef.current.fy = null;
        dragNodeRef.current = null;
      }
      panStartRef.current = null;
      lastPinchDistRef.current = null;
      e.preventDefault();
    }
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    if (!pinchRef.current.has(e.pointerId)) return;
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current.size !== 2) return;
    e.preventDefault();

    const pts = Array.from(pinchRef.current.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const last = lastPinchDistRef.current;
    lastPinchDistRef.current = dist;
    if (last === null || last === 0) return;

    const factor = dist / last;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (pts[0].x + pts[1].x) / 2 - rect.left;
    const my = (pts[0].y + pts[1].y) / 2 - rect.top;
    const { x: tx, y: ty, zoom } = camRef.current;
    const nz = Math.min(6, Math.max(0.02, zoom * factor));
    camRef.current = {
      x: mx - (mx - tx) * (nz / zoom),
      y: my - (my - ty) * (nz / zoom),
      zoom: nz,
    };
    requestRender();
  }, [requestRender]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pinchRef.current.delete(e.pointerId);
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // Reset baseline so remaining/next fingers re-establish distance cleanly.
    lastPinchDistRef.current = null;
  }, []);

  // ── Minimap camera jump / drag ───────────────────────────────────────────────
  // Converts a client-space point over the minimap into a world point and
  // centers the main camera there (preserving current zoom).
  const minimapPanTo = useCallback((clientX: number, clientY: number) => {
    const mm = minimapCanvasRef.current;
    const tf = minimapTfRef.current;
    const canvas = canvasRef.current;
    if (!mm || !tf || !canvas) return;
    const rect = mm.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const wx = (px - tf.ox) / tf.scale;
    const wy = (py - tf.oy) / tf.scale;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    const zoom = camRef.current.zoom;
    camRef.current = {
      x: cw / 2 - wx * zoom,
      y: ch / 2 - wy * zoom,
      zoom,
    };
    requestRender();
  }, [requestRender]);

  // ── Canvas resize ──────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width        = Math.round(rect.width  * dpr);
      canvas.height       = Math.round(rect.height * dpr);
      canvas.style.width  = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      // Minimap has a fixed CSS size; size its backing store for the DPR once here.
      const mm = minimapCanvasRef.current;
      if (mm) {
        mm.width  = Math.round(MINIMAP_W * dpr);
        mm.height = Math.round(MINIMAP_H * dpr);
      }
      requestRender();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [requestRender]);

  // ── Wire canvas events ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown",  handleMouseDown);
    canvas.addEventListener("mousemove",  handleMouseMove);
    window.addEventListener("mouseup",    handleMouseUp);
    canvas.addEventListener("wheel",      handleWheel, { passive: false });
    canvas.addEventListener("mouseleave", handleMouseLeave);
    // Pinch-to-zoom via pointer events (primary path on touchscreens).
    canvas.addEventListener("pointerdown",   handlePointerDown, { passive: false });
    canvas.addEventListener("pointermove",   handlePointerMove, { passive: false });
    canvas.addEventListener("pointerup",     handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    return () => {
      canvas.removeEventListener("mousedown",  handleMouseDown);
      canvas.removeEventListener("mousemove",  handleMouseMove);
      window.removeEventListener("mouseup",    handleMouseUp);
      canvas.removeEventListener("wheel",      handleWheel);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("pointerdown",   handlePointerDown);
      canvas.removeEventListener("pointermove",   handlePointerMove);
      canvas.removeEventListener("pointerup",     handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleMouseLeave,
      handlePointerDown, handlePointerMove, handlePointerUp]);

  // ── Wire minimap events (separate from main canvas handlers) ────────────────

  useEffect(() => {
    const mm = minimapCanvasRef.current;
    if (!mm) return;
    let dragging = false;
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      minimapPanTo(e.clientX, e.clientY);
    };
    const move = (e: MouseEvent) => {
      if (!dragging) return;
      minimapPanTo(e.clientX, e.clientY);
    };
    const up = () => { dragging = false; };
    mm.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      mm.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [minimapPanTo]);

  // ── Discover indexed projects on mount ─────────────────────────────────────

  useEffect(() => {
    const open = getOpenProjects();
    Promise.all(
      open.map((p) =>
        invoke<boolean>("check_atlas_db", { projectPath: p.path })
          .then((ok) => ok ? { id: p.id, name: p.name, path: p.path } : null)
          .catch(() => null)
      )
    ).then((results) => {
      const indexed = results.filter((r): r is IndexedProject => r !== null);
      setIndexedProjects(indexed);
      setProjectsResolved(true);
      if (indexed.length > 0) setSelectedPath(indexed[0].path);
    });
  }, []);

  // ── Unmount cleanup ────────────────────────────────────────────────────────

  useEffect(() => () => {
    simRef.current?.stop();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Load + simulate graph ──────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;

    // Tear down previous
    simRef.current?.stop();
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    nodesRef.current      = [];
    linksRef.current      = [];
    hoverNodeRef.current      = null;
    neighborIdsRef.current    = new Set();
    connLinksRef.current      = new Set();
    selNeighborIdsRef.current = new Set();
    selConnLinksRef.current   = new Set();
    dragNodeRef.current       = null;
    detailNodeRef.current     = null;
    setDetailNode(null);
    setLoadState("loading");
    setProgress(15);
    setLogLine("Querying symbol database…");

    invoke<GraphData>("get_atlas_graph", { projectPath: selectedPath })
      .then((graph) => {
        if (cancelled) return;
        setProgress(45);
        setLogLine(`${graph.nodes.length} symbols · ${graph.edges.length} edges`);

        const colors   = resolveKindColors();
        const validIds = new Set(graph.nodes.map((n) => n.id));
        const rawEdges = graph.edges.filter(
          (e) => validIds.has(e.source) && validIds.has(e.target)
        );

        // Degree for node sizing
        const deg = new Map<string, number>();
        for (const n of graph.nodes) deg.set(n.id, 0);
        for (const e of rawEdges) {
          deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
          deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
        }

        // Spread nodes proportional to count so they have room to settle
        const spread = Math.max(200, Math.sqrt(graph.nodes.length) * 22);

        const gNodes: GNode[] = graph.nodes.map((n) => ({
          id: n.id, label: n.name, kind: n.kind,
          color:  colors[n.kind] ?? colors._default,
          radius: nodeRadius(deg.get(n.id) ?? 0),
          file_path: n.file_path, start_line: n.start_line, language: n.language,
          x: (Math.random() - 0.5) * spread,
          y: (Math.random() - 0.5) * spread,
          vx: 0, vy: 0, fx: null, fy: null,
        }));

        const byId = new Map(gNodes.map((n) => [n.id, n]));
        const gLinks: GLink[] = rawEdges
          .map((e) => ({
            source: byId.get(e.source)!,
            target: byId.get(e.target)!,
            kind: e.kind,
          }))
          .filter((l) => l.source && l.target);

        nodesRef.current = gNodes;
        linksRef.current = gLinks;

        // Initial camera: zoom out far enough that the estimated final spread
        // is fully visible from the start. "Does not matter if graph is small."
        const canvas = canvasRef.current;
        if (canvas) {
          const dpr = window.devicePixelRatio || 1;
          const cw  = canvas.width  / dpr;
          const ch  = canvas.height / dpr;
          // Rough estimate of final layout radius after repulsion settles
          const estR     = Math.max(400, Math.sqrt(gNodes.length) * 55);
          const initZoom = Math.min(0.9, (Math.min(cw, ch) * 0.88) / (estR * 2));
          camRef.current = { x: cw / 2, y: ch / 2, zoom: initZoom };
        }

        setProgress(70);
        setLogLine("Simulating…");

        // Auto-fit helper: reads live node positions and adjusts camera
        const doAutoFit = () => {
          const c = canvasRef.current;
          if (!c || nodesRef.current.length === 0) return;
          const dpr2 = window.devicePixelRatio || 1;
          const cw2  = c.width  / dpr2, ch2 = c.height / dpr2;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const n of nodesRef.current) {
            x0 = Math.min(x0, n.x - n.radius); y0 = Math.min(y0, n.y - n.radius);
            x1 = Math.max(x1, n.x + n.radius); y1 = Math.max(y1, n.y + n.radius);
          }
          const pad = 56;
          const z   = Math.min(3,
            (cw2 - pad * 2) / Math.max(1, x1 - x0),
            (ch2 - pad * 2) / Math.max(1, y1 - y0)
          );
          camRef.current = {
            x: cw2 / 2 - ((x0 + x1) / 2) * z,
            y: ch2 / 2 - ((y0 + y1) / 2) * z,
            zoom: z,
          };
        };

        // Build D3 force simulation
        // - forceManyBody: strong repulsion keeps nodes apart (Obsidian feel)
        // - forceLink: edges as springs — connected nodes stay nearby
        // - forceCenter: very weak pull toward origin
        // - forceCollide: prevents node overlap
        // - slow alphaDecay: simulation runs long enough for nodes to spread wide
        let autoFitted = false;
        const sim = forceSimulation<GNode>(gNodes)
          .force("charge",  forceManyBody<GNode>().strength(-220).distanceMax(700))
          .force("link",    forceLinks<GNode, GLink>(gLinks).distance(90).strength(0.35))
          .force("center",  forceCenter<GNode>(0, 0).strength(0.04))
          .force("collide", forceCollide<GNode>((n) => (n as GNode).radius + 7).strength(0.9))
          .alphaDecay(0.013)
          .velocityDecay(0.4)
          .on("tick", () => {
            // Auto-fit once when simulation is ~60% settled (alpha < 0.15).
            // By this point nodes have spread organically; fit gives a stable view.
            if (!autoFitted && sim.alpha() < 0.15) {
              autoFitted = true;
              if (!cancelled) doAutoFit();
            }
            // Each simulation tick requests exactly one animation frame
            if (rafRef.current === null) {
              rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                render();
              });
            }
          });

        simRef.current = sim;
        setProgress(100);
        if (!cancelled) setLoadState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(String(err));
        setLoadState("error");
      });

    return () => {
      cancelled = true;
      simRef.current?.stop();
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [selectedPath]);

  // ── Toolbar zoom controls ──────────────────────────────────────────────────

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cx = canvas.width / (2 * dpr), cy = canvas.height / (2 * dpr);
    const { x: tx, y: ty, zoom } = camRef.current;
    const nz = Math.min(6, Math.max(0.02, zoom * factor));
    camRef.current = {
      x: cx - (cx - tx) * (nz / zoom),
      y: cy - (cy - ty) * (nz / zoom),
      zoom: nz,
    };
    requestRender();
  }, [requestRender]);

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes  = nodesRef.current;
    if (!canvas || nodes.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.radius); minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius); maxY = Math.max(maxY, n.y + n.radius);
    }
    const pad  = 48;
    const zoom = Math.min(4,
      (cw - pad * 2) / Math.max(1, maxX - minX),
      (ch - pad * 2) / Math.max(1, maxY - minY)
    );
    camRef.current = {
      x: cw / 2 - ((minX + maxX) / 2) * zoom,
      y: ch / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    };
    requestRender();
  }, [requestRender]);

  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    camRef.current = { x: canvas.width / (2 * dpr), y: canvas.height / (2 * dpr), zoom: 1 };
    requestRender();
  }, [requestRender]);

  const hasGraph = loadState === "ready" && nodesRef.current.length > 0;

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="kb-root">
      <KbToolbar
        projects={indexedProjects}
        selectedPath={selectedPath}
        hasGraph={hasGraph}
        onSelectPath={setSelectedPath}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onFit={fitView}
        onReset={resetView}
      />

      <div className="kb-canvas-wrap" ref={containerRef}>
        {projectsResolved && indexedProjects.length === 0 && (
          <div className="kb-empty">
            <span className="kb-empty-title">No indexed projects</span>
            <span className="kb-empty-desc">
              Index a project with Atlas to see its knowledge graph.
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
              <div className="kb-progress-fill" style={{ width: `${progress}%` }} />
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

        <canvas
          ref={canvasRef}
          className="kb-canvas"
          style={{ display: loadState === "ready" ? "block" : "none" }}
        />

        <canvas
          ref={minimapCanvasRef}
          className="kb-minimap"
          style={{ display: hasGraph ? "block" : "none" }}
        />

        {detailNode && (
          <NodeDetailPanel
            node={detailNode}
            onClose={() => {
              detailNodeRef.current     = null;
              setDetailNode(null);
              selNeighborIdsRef.current = new Set();
              selConnLinksRef.current   = new Set();
              requestRender();
            }}
          />
        )}
      </div>
    </div>
  );
}
