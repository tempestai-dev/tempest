import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader, ZoomIn, ZoomOut, Maximize2, RotateCcw, ChevronDown } from "lucide-react";
import {
  forceSimulation,
  forceManyBody,
  forceLink as forceLinks,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
} from "d3-force";
import { getOpenProjects } from "../store/openProjects";
import "./KnowledgeBasePage.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface IndexedProject { id: string; name: string; path: string }

interface SymbolNodeRaw {
  id: string; name: string; kind: string; file_path: string;
  start_line: number; end_line: number; language: string;
}
interface SymbolEdgeRaw { source: string; target: string; kind: string }
interface GraphData { nodes: SymbolNodeRaw[]; edges: SymbolEdgeRaw[] }

type LoadState = "idle" | "loading" | "ready" | "error";

// D3 augments nodes with index; we provide x/y/vx/vy up-front
interface GNode extends SimulationNodeDatum {
  id: string; label: string; kind: string; color: string; radius: number;
  file_path: string; start_line: number; language: string;
  x: number; y: number; vx: number; vy: number;
  fx?: number | null; fy?: number | null;
}

// Links are pre-resolved to GNode objects; d3 uses them directly
interface GLink extends SimulationLinkDatum<GNode> {
  source: GNode; target: GNode; kind: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveKindColors(): Record<string, string> {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--tempest-${n}`).trim();
  return {
    function:  v("accent-blue"),   method:    v("accent-blue"),
    class:     v("accent-yellow"), interface: v("accent-green"),
    type:      "#9b59b6",          variable:  v("fg-muted"),
    constant:  v("fg-muted"),      _default:  v("fg-subtle"),
  };
}

function nodeRadius(deg: number): number {
  return 4 + Math.sqrt(deg) * 1.5;
}

// Minimap dimensions (CSS px)
const MINIMAP_W = 180;
const MINIMAP_H = 120;

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
  const [dropOpen,         setDropOpen]         = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);

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
  const minimapTfRef = useRef<{ scale: number; ox: number; oy: number } | null>(null);

  // RAF
  const rafRef    = useRef<number | null>(null);
  const renderRef = useRef<() => void>(() => {});

  // ── Render fn (set once; reads refs only, never re-created) ───────────────

  useEffect(() => {
    // Renders the whole graph, plus the current viewport rect, into the
    // small minimap canvas. Reads refs only; called at the end of the main
    // render fn so it stays in sync with the primary canvas.
    const renderMinimap = () => {
      const mm = minimapCanvasRef.current;
      if (!mm) return;
      const ctx = mm.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const W = MINIMAP_W, H = MINIMAP_H;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const nodes = nodesRef.current;
      const links = linksRef.current;
      if (nodes.length === 0) { minimapTfRef.current = null; return; }

      // Bounding box of all nodes (same logic as fitView)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) {
        x0 = Math.min(x0, n.x - n.radius); y0 = Math.min(y0, n.y - n.radius);
        x1 = Math.max(x1, n.x + n.radius); y1 = Math.max(y1, n.y + n.radius);
      }
      const pad = 8;
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
      const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
      const ox = (W - bw * scale) / 2 - x0 * scale;
      const oy = (H - bh * scale) / 2 - y0 * scale;
      minimapTfRef.current = { scale, ox, oy };
      const wx2 = (wx: number) => wx * scale + ox;
      const wy2 = (wy: number) => wy * scale + oy;

      const mmStyle = getComputedStyle(document.documentElement);
      const edgeCol = mmStyle.getPropertyValue("--tempest-border-subtle").trim() || "#2a2a2a";

      // Edges — 1px lines at ~15% opacity
      ctx.strokeStyle = edgeCol;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const l of links) {
        ctx.moveTo(wx2(l.source.x), wy2(l.source.y));
        ctx.lineTo(wx2(l.target.x), wy2(l.target.y));
      }
      ctx.stroke();

      // Nodes — 1.5px filled circles in their kind color
      ctx.globalAlpha = 1;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(wx2(n.x), wy2(n.y), 1.5, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
      }

      // Viewport rectangle — map the 4 corners of the main viewport to minimap
      const canvas = canvasRef.current;
      if (canvas) {
        const cw = canvas.width / dpr, ch = canvas.height / dpr;
        const { x: tx, y: ty, zoom } = camRef.current;
        const vwx0 = -tx / zoom,        vwy0 = -ty / zoom;
        const vwx1 = (cw - tx) / zoom,  vwy1 = (ch - ty) / zoom;
        const rx = wx2(vwx0), ry = wy2(vwy0);
        const rw = (vwx1 - vwx0) * scale, rh = (vwy1 - vwy0) * scale;
        ctx.fillStyle   = "rgba(255,255,255,0.25)";
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth   = 1;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      }
    };

    renderRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr  = window.devicePixelRatio || 1;
      const cw   = canvas.width  / dpr;
      const ch   = canvas.height / dpr;
      const { x: tx, y: ty, zoom } = camRef.current;
      const nodes    = nodesRef.current;
      const links    = linksRef.current;
      const hovered  = hoverNodeRef.current;
      const selected = detailNodeRef.current;
      const hasHover     = hovered  !== null;
      const hasSel       = selected !== null;
      const hasHighlight = hasHover || hasSel;
      // Hover takes priority for neighborhood; fall back to selection when not hovering
      const activeNode     = hovered ?? selected;
      const activeNeibIds  = hasHover ? neighborIdsRef.current  : selNeighborIdsRef.current;
      const activeConnLnks = hasHover ? connLinksRef.current    : selConnLinksRef.current;
      const showLabels = zoom > 0.55;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      const style = getComputedStyle(document.documentElement);
      ctx.fillStyle = style.getPropertyValue("--tempest-bg-editor").trim() || "#0f0f0f";
      ctx.fillRect(0, 0, cw, ch);

      ctx.translate(tx, ty);
      ctx.scale(zoom, zoom);

      const edgeBase = style.getPropertyValue("--tempest-border-subtle").trim() || "#2a2a2a";

      // ── Edges ───────────────────────────────────────────────────────────
      if (!hasHighlight) {
        ctx.beginPath();
        ctx.strokeStyle = edgeBase;
        ctx.lineWidth   = 0.8 / zoom;
        ctx.globalAlpha = 0.28;
        for (const l of links) {
          ctx.moveTo(l.source.x, l.source.y);
          ctx.lineTo(l.target.x, l.target.y);
        }
        ctx.stroke();
      } else {
        // Dim unconnected edges
        ctx.beginPath();
        ctx.strokeStyle = edgeBase;
        ctx.lineWidth   = 0.6 / zoom;
        ctx.globalAlpha = 0.05;
        for (const l of links) {
          if (!activeConnLnks.has(l)) {
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);
          }
        }
        ctx.stroke();

        // Highlight connected edges in the active node's color
        if (activeNode) {
          ctx.beginPath();
          ctx.strokeStyle = activeNode.color;
          ctx.lineWidth   = 1.2 / zoom;
          ctx.globalAlpha = 0.7;
          for (const l of activeConnLnks) {
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);
          }
          ctx.stroke();
        }
      }

      // ── Nodes ───────────────────────────────────────────────────────────
      // Viewport bounds for label culling
      const marg = 60 / zoom;
      const vx0 = (-tx / zoom) - marg, vx1 = ((cw - tx) / zoom) + marg;
      const vy0 = (-ty / zoom) - marg, vy1 = ((ch - ty) / zoom) + marg;

      for (const n of nodes) {
        const isHov  = n === hovered;
        const isSel  = n === selected;
        const isNeib = hasHighlight && activeNeibIds.has(n.id);
        const focus  = isHov || isSel;
        const alpha  = (hasHighlight && !focus && !isNeib) ? 0.1 : 1;
        const r      = n.radius;

        ctx.globalAlpha = alpha;

        // Glow for focused / neighbor nodes
        if (focus || isNeib) {
          const gr   = r * (focus ? 4 : 2.5);
          const grad = ctx.createRadialGradient(n.x, n.y, r * 0.2, n.x, n.y, gr);
          grad.addColorStop(0, n.color + (focus ? "70" : "50"));
          grad.addColorStop(1, n.color + "00");
          ctx.fillStyle   = grad;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(n.x, n.y, gr, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = alpha;
        }

        // Circle fill
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        // Selection ring
        if (isSel) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 4 / zoom, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth   = 1.5 / zoom;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        } else if (isHov) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3 / zoom, 0, Math.PI * 2);
          ctx.strokeStyle = n.color;
          ctx.lineWidth   = 1.5 / zoom;
          ctx.globalAlpha = 0.55;
          ctx.stroke();
        }

        // Labels — viewport-culled; shown for focus/neighbors or when zoomed in
        if (showLabels) {
          const inVP  = n.x > vx0 && n.x < vx1 && n.y > vy0 && n.y < vy1;
          const show  = inVP && (focus || isNeib || zoom > 1.1);
          if (show) {
            const fs = Math.max(8, Math.min(13, 11 / zoom));
            ctx.font        = `${fs}px "Geist Mono", monospace`;
            ctx.textAlign   = "center";
            ctx.fillStyle   = focus ? "#ffffff" : "#909090";
            ctx.globalAlpha = focus ? 1 : 0.75 * alpha;
            ctx.fillText(n.label, n.x, n.y + r + fs * 1.4);
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();

      renderMinimap();
    };
  }, []); // empty: reads refs only, never needs to update

  // ── Single-frame render request ────────────────────────────────────────────

  const requestRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      renderRef.current();
    });
  }, []);

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

  // ── Close project dropdown on outside click ────────────────────────────────

  useEffect(() => {
    if (!dropOpen) return;
    function onOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [dropOpen]);

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
                renderRef.current();
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
      <div className="kb-toolbar">
        <div className="kb-project-drop" ref={dropRef}>
          <button
            className={`kb-project-drop-btn${dropOpen ? " kb-project-drop-btn--open" : ""}`}
            onClick={() => setDropOpen((v) => !v)}
            disabled={indexedProjects.length === 0}
          >
            <span className="kb-project-drop-label">
              {indexedProjects.find((p) => p.path === selectedPath)?.name ?? "No indexed projects"}
            </span>
            <ChevronDown size={12} className="kb-project-drop-chevron" />
          </button>
          {dropOpen && indexedProjects.length > 0 && (
            <div className="kb-project-drop-menu">
              {indexedProjects.map((p) => (
                <button
                  key={p.id}
                  className={`kb-project-drop-item${p.path === selectedPath ? " kb-project-drop-item--active" : ""}`}
                  onClick={() => { setSelectedPath(p.path); setDropOpen(false); }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="kb-toolbar-divider" />

        <button className="kb-tool-btn" title="Zoom in"      onClick={() => zoomBy(1.25)} disabled={!hasGraph}><ZoomIn    size={14} /></button>
        <button className="kb-tool-btn" title="Zoom out"     onClick={() => zoomBy(0.8)}  disabled={!hasGraph}><ZoomOut   size={14} /></button>
        <button className="kb-tool-btn" title="Fit to screen" onClick={fitView}            disabled={!hasGraph}><Maximize2 size={14} /></button>
        <button className="kb-tool-btn" title="Reset view"   onClick={resetView}           disabled={!hasGraph}><RotateCcw size={14} /></button>
      </div>

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
          <div className="kb-detail">
            <button
              className="kb-detail-close"
              onClick={() => {
                detailNodeRef.current     = null;
                setDetailNode(null);
                selNeighborIdsRef.current = new Set();
                selConnLinksRef.current   = new Set();
                requestRender();
              }}
            >×</button>
            <div
              className="kb-detail-badge"
              style={{ background: detailNode.color + "22", color: detailNode.color }}
            >
              {detailNode.kind}
            </div>
            <div className="kb-detail-name">{detailNode.label}</div>
            <div className="kb-detail-row">
              <span>File</span>
              {detailNode.file_path.split(/[/\\]/).slice(-2).join("/")}
            </div>
            <div className="kb-detail-row">
              <span>Line</span>
              {detailNode.start_line}
            </div>
            <div className="kb-detail-row">
              <span>Language</span>
              {detailNode.language}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
