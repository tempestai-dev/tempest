import { Tooltip } from "../Tooltip";
import type { GNode } from "../../types/knowledgeGraph";

type Props = {
  node: GNode;
  onClose: () => void;
};

export function NodeDetailPanel({ node, onClose }: Props) {
  return (
    <div className="kb-detail">
      <Tooltip content="Close" placement="top">
        <button className="kb-detail-close" onClick={onClose}>×</button>
      </Tooltip>
      <div
        className="kb-detail-badge"
        style={{ background: node.color + "22", color: node.color }}
      >
        {node.kind}
      </div>
      <div className="kb-detail-name">{node.label}</div>
      <div className="kb-detail-row">
        <span>File</span>
        {node.file_path.split(/[/\\]/).slice(-2).join("/")}
      </div>
      <div className="kb-detail-row">
        <span>Line</span>
        {node.start_line}
      </div>
      <div className="kb-detail-row">
        <span>Language</span>
        {node.language}
      </div>
    </div>
  );
}
