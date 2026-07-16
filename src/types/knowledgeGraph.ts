import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

export interface IndexedProject { id: string; name: string; path: string }

export interface SymbolNodeRaw {
  id: string; name: string; kind: string; file_path: string;
  start_line: number; end_line: number; language: string;
}

export interface SymbolEdgeRaw { source: string; target: string; kind: string }

export interface GraphData { nodes: SymbolNodeRaw[]; edges: SymbolEdgeRaw[] }

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface GNode extends SimulationNodeDatum {
  id: string; label: string; kind: string; color: string; radius: number;
  file_path: string; start_line: number; language: string;
  x: number; y: number; vx: number; vy: number;
  fx?: number | null; fy?: number | null;
}

export interface GLink extends SimulationLinkDatum<GNode> {
  source: GNode; target: GNode; kind: string;
}
