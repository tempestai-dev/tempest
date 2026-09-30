import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { UiIcon } from "../../icons/UiIcon";
const X = (p: any) => <UiIcon name="x" {...p} />;
import { useNodeGenerating } from "../../store/nodeActivity";

// Removable connection edge. React Flow has no built-in "disconnect" gesture, so
// each edge carries a midpoint × button. deleteElements routes through the same
// onEdgesChange the canvas already uses (controlled edges), so the button and a
// Backspace on a selected edge both remove it the same way.
export function ThreadEdge({
  id, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const generating = useNodeGenerating(target);
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {generating && <path d={path} className="thread-edge-comet" pathLength={100} fill="none" />}
      <EdgeLabelRenderer>
        <button
          className="thread-edge-del nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={(e) => { e.stopPropagation(); void deleteElements({ edges: [{ id }] }); }}
          title="Remove connection"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
