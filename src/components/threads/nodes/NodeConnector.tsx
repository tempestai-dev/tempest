import { Handle, Position, useConnection, useNodeConnections } from "@xyflow/react";
import { Hexagon } from "lucide-react";

// Inline hexagon connector for a thread node header. Left = target (incoming,
// followed by a separator that fences it off from the title); right = source
// (outgoing, rightmost). Styling lives in TextNode.css (.tnode-connector); the
// library's absolute dot is neutralized there so this sits as a header icon.
//
// Fill states: a connector that participates in an edge is filled + default fg;
// an unconnected one stays muted + hollow (so on a node wired on one side, the
// other side reads as inactive). An in-progress drag from this node fills yellow.
export function NodeConnector({ nodeId, side }: { nodeId: string; side: "left" | "right" }) {
  const connecting = useConnection((c) => c.inProgress && c.fromNode?.id === nodeId);
  const connections = useNodeConnections({
    id: nodeId,
    handleType: side === "left" ? "target" : "source",
  });
  const connected = connections.length > 0;

  const fill = connecting
    ? "var(--tempest-accent-yellow, #f5c518)"
    : connected
    ? "currentColor"
    : "none";

  // Issue #14: a small count badge on the incoming (left/target) handle so a
  // node fed by several sources shows how many at a glance — the hexagon's
  // fill state alone can't distinguish 1 wire from many.
  const handle = (
    <Handle
      type={side === "left" ? "target" : "source"}
      position={side === "left" ? Position.Left : Position.Right}
      id={side === "left" ? "in" : "out"}
      className={`tnode-connector nodrag${connecting ? " connecting" : ""}${connected ? " connected" : ""}`}
      title={side === "left" ? "Connect into this node" : "Click to connect"}
    >
      <Hexagon size={13} fill={fill} />
      {side === "left" && connections.length > 1 && (
        <span className="tnode-connector-badge">{connections.length}</span>
      )}
    </Handle>
  );
  if (side === "right") return handle;
  return (
    <>
      {handle}
      <span className="tnode-connector-sep" />
    </>
  );
}
