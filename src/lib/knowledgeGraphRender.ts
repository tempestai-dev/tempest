import type { GNode, GLink } from "../types/knowledgeGraph";
import { MINIMAP_W, MINIMAP_H } from "./knowledgeGraph";

export type Camera = { x: number; y: number; zoom: number };
export type MinimapTf = { scale: number; ox: number; oy: number } | null;

export type RenderCtx = {
  canvas: HTMLCanvasElement | null;
  minimap: HTMLCanvasElement | null;
  nodes: GNode[];
  links: GLink[];
  camera: Camera;
  hovered: GNode | null;
  selected: GNode | null;
  hoverNeighborIds: Set<string>;
  hoverConnLinks: Set<GLink>;
  selNeighborIds: Set<string>;
  selConnLinks: Set<GLink>;
  setMinimapTf: (tf: MinimapTf) => void;
};

function renderMinimap(ctx: RenderCtx) {
  const mm = ctx.minimap;
  if (!mm) return;
  const c = mm.getContext("2d");
  if (!c) return;

  const dpr = window.devicePixelRatio || 1;
  const W = MINIMAP_W, H = MINIMAP_H;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);

  const { nodes, links } = ctx;
  if (nodes.length === 0) { ctx.setMinimapTf(null); return; }

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
  ctx.setMinimapTf({ scale, ox, oy });
  const wx2 = (wx: number) => wx * scale + ox;
  const wy2 = (wy: number) => wy * scale + oy;

  const mmStyle = getComputedStyle(document.documentElement);
  const edgeCol = mmStyle.getPropertyValue("--tempest-border-subtle").trim() || "#2a2a2a";

  c.strokeStyle = edgeCol;
  c.globalAlpha = 0.15;
  c.lineWidth = 1;
  c.beginPath();
  for (const l of links) {
    c.moveTo(wx2(l.source.x), wy2(l.source.y));
    c.lineTo(wx2(l.target.x), wy2(l.target.y));
  }
  c.stroke();

  c.globalAlpha = 1;
  for (const n of nodes) {
    c.beginPath();
    c.arc(wx2(n.x), wy2(n.y), 1.5, 0, Math.PI * 2);
    c.fillStyle = n.color;
    c.fill();
  }

  const canvas = ctx.canvas;
  if (canvas) {
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    const { x: tx, y: ty, zoom } = ctx.camera;
    const vwx0 = -tx / zoom,        vwy0 = -ty / zoom;
    const vwx1 = (cw - tx) / zoom,  vwy1 = (ch - ty) / zoom;
    const rx = wx2(vwx0), ry = wy2(vwy0);
    const rw = (vwx1 - vwx0) * scale, rh = (vwy1 - vwy0) * scale;
    const cs = getComputedStyle(document.documentElement);
    c.fillStyle   = cs.getPropertyValue("--tempest-minimap-overlay").trim();
    c.strokeStyle = cs.getPropertyValue("--tempest-minimap-border").trim();
    c.lineWidth   = 1;
    c.fillRect(rx, ry, rw, rh);
    c.strokeRect(rx, ry, rw, rh);
  }
}

export function renderGraph(ctx: RenderCtx) {
  const canvas = ctx.canvas;
  if (!canvas) return;
  const c = canvas.getContext("2d");
  if (!c) return;

  const dpr  = window.devicePixelRatio || 1;
  const cw   = canvas.width  / dpr;
  const ch   = canvas.height / dpr;
  const { x: tx, y: ty, zoom } = ctx.camera;
  const { nodes, links, hovered, selected } = ctx;
  const hasHover     = hovered  !== null;
  const hasSel       = selected !== null;
  const hasHighlight = hasHover || hasSel;
  const activeNode     = hovered ?? selected;
  const activeNeibIds  = hasHover ? ctx.hoverNeighborIds : ctx.selNeighborIds;
  const activeConnLnks = hasHover ? ctx.hoverConnLinks   : ctx.selConnLinks;
  const showLabels = zoom > 0.55;

  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save();
  c.scale(dpr, dpr);

  const style = getComputedStyle(document.documentElement);
  c.fillStyle = style.getPropertyValue("--tempest-bg-editor").trim() || "#0f0f0f";
  c.fillRect(0, 0, cw, ch);

  c.translate(tx, ty);
  c.scale(zoom, zoom);

  const edgeBase = style.getPropertyValue("--tempest-border-subtle").trim() || "#2a2a2a";

  if (!hasHighlight) {
    c.beginPath();
    c.strokeStyle = edgeBase;
    c.lineWidth   = 0.8 / zoom;
    c.globalAlpha = 0.28;
    for (const l of links) {
      c.moveTo(l.source.x, l.source.y);
      c.lineTo(l.target.x, l.target.y);
    }
    c.stroke();
  } else {
    c.beginPath();
    c.strokeStyle = edgeBase;
    c.lineWidth   = 0.6 / zoom;
    c.globalAlpha = 0.05;
    for (const l of links) {
      if (!activeConnLnks.has(l)) {
        c.moveTo(l.source.x, l.source.y);
        c.lineTo(l.target.x, l.target.y);
      }
    }
    c.stroke();

    if (activeNode) {
      c.beginPath();
      c.strokeStyle = activeNode.color;
      c.lineWidth   = 1.2 / zoom;
      c.globalAlpha = 0.7;
      for (const l of activeConnLnks) {
        c.moveTo(l.source.x, l.source.y);
        c.lineTo(l.target.x, l.target.y);
      }
      c.stroke();
    }
  }

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

    c.globalAlpha = alpha;

    if (focus || isNeib) {
      const gr   = r * (focus ? 4 : 2.5);
      const grad = c.createRadialGradient(n.x, n.y, r * 0.2, n.x, n.y, gr);
      grad.addColorStop(0, n.color + (focus ? "70" : "50"));
      grad.addColorStop(1, n.color + "00");
      c.fillStyle   = grad;
      c.globalAlpha = alpha;
      c.beginPath();
      c.arc(n.x, n.y, gr, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = alpha;
    }

    c.beginPath();
    c.arc(n.x, n.y, r, 0, Math.PI * 2);
    c.fillStyle = n.color;
    c.fill();

    if (isSel) {
      c.beginPath();
      c.arc(n.x, n.y, r + 4 / zoom, 0, Math.PI * 2);
      c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--tempest-fg-default").trim();
      c.lineWidth   = 1.5 / zoom;
      c.globalAlpha = 0.9;
      c.stroke();
    } else if (isHov) {
      c.beginPath();
      c.arc(n.x, n.y, r + 3 / zoom, 0, Math.PI * 2);
      c.strokeStyle = n.color;
      c.lineWidth   = 1.5 / zoom;
      c.globalAlpha = 0.55;
      c.stroke();
    }

    if (showLabels) {
      const inVP  = n.x > vx0 && n.x < vx1 && n.y > vy0 && n.y < vy1;
      const show  = inVP && (focus || isNeib || zoom > 1.1);
      if (show) {
        const fs = Math.max(8, Math.min(13, 11 / zoom));
        c.font        = `${fs}px "Geist Mono", monospace`;
        c.textAlign   = "center";
        c.fillStyle   = focus ? getComputedStyle(document.documentElement).getPropertyValue("--tempest-fg-default").trim() : getComputedStyle(document.documentElement).getPropertyValue("--tempest-fg-muted").trim();
        c.globalAlpha = focus ? 1 : 0.75 * alpha;
        c.fillText(n.label, n.x, n.y + r + fs * 1.4);
      }
    }
  }

  c.globalAlpha = 1;
  c.restore();

  renderMinimap(ctx);
}
