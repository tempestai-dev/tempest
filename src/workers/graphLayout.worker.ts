/// <reference lib="webworker" />
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

interface LayoutRequest {
  nodes: { id: string }[];
  edges: { source: string; target: string }[];
}

type WorkerMessage =
  | { progress: string }
  | { error: string }
  | { positions: { id: string; x: number; y: number }[] };

const post = (msg: WorkerMessage) =>
  (self as unknown as Worker).postMessage(msg);

self.onerror = (ev) => {
  const msg =
    ev instanceof ErrorEvent
      ? `${ev.message} (${ev.filename}:${ev.lineno})`
      : String(ev);
  post({ error: `Layout worker error: ${msg}` });
};

(self as any).onunhandledrejection = (ev: PromiseRejectionEvent) => {
  post({ error: `Layout worker rejection: ${String(ev.reason)}` });
};

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  try {
    const { nodes, edges } = e.data;

    if (nodes.length === 0) {
      post({ positions: [] });
      return;
    }

    post({ progress: `Initializing layout engine (${nodes.length} symbols)…` });

    const cy = cytoscape({
      headless: true,
      styleEnabled: false,
      elements: {
        nodes: nodes.map((n) => ({ data: { id: n.id } })),
        edges: edges.map((ed, i) => ({
          data: { id: `e${i}`, source: ed.source, target: ed.target },
        })),
      },
    });

    post({ progress: `Running force simulation (${edges.length} edges)…` });

    const layout = cy.layout({
      name: "fcose",
      quality: nodes.length > 2000 ? "draft" : "default",
      animate: false,
      randomize: true,
      fit: false,
      nodeRepulsion: 4500,
      idealEdgeLength: 80,
      numIter: nodes.length > 2000 ? 1000 : 2500,
      tile: true,
    } as any);

    layout.one("layoutstop", () => {
      post({ progress: "Transferring positions to renderer…" });
      const positions = cy.nodes().map((n) => {
        const p = n.position();
        return { id: n.id(), x: p.x, y: p.y };
      });
      cy.destroy();
      post({ positions });
    });

    layout.run();
  } catch (err) {
    post({
      error: `Layout failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};
