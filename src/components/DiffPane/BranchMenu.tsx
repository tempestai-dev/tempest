import { GitBranch, Check, Trash2 } from "lucide-react";
import { Tooltip } from "../Tooltip";
import type { BranchInfo } from "../../types/git";

export function BranchMenu({
  branches,
  tab,
  onSetTab,
  onSwitch,
  onDelete,
}: {
  branches: BranchInfo[];
  tab: "local" | "remote";
  onSetTab: (t: "local" | "remote") => void;
  onSwitch: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  return (
    <>
      <div className="dv-branch-view-tabs">
        <button className={`dv-bdt${tab === "local" ? " active" : ""}`} onClick={() => onSetTab("local")}>Local</button>
        <button className={`dv-bdt${tab === "remote" ? " active" : ""}`} onClick={() => onSetTab("remote")}>Remote</button>
      </div>
      <div className="dv-branch-view-list">
        {branches.length === 0 ? (
          <div className="dv-branch-empty">No branches</div>
        ) : branches.map((b) => (
          <div key={b.name} className={`dv-branch-item-row${b.is_current ? " current" : ""}`}>
            <button
              className="dv-branch-item"
              onClick={() => !b.is_current && onSwitch(b.name)}
              disabled={b.is_current}
            >
              <GitBranch size={11} />
              <span>{b.name}</span>
              {b.is_current && <Check size={11} className="dv-branch-check" />}
            </button>
            {!b.is_current && !b.is_remote && (
              <Tooltip content="Delete branch" placement="left">
                <button
                  className="dv-branch-del"
                  onClick={(e) => { e.stopPropagation(); onDelete(b.name); }}
                >
                  <Trash2 size={11} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
