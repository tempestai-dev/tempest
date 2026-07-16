import { Loader, Check, RotateCcw } from "lucide-react";
import { setAttribution } from "../../store/attribution";

export function CommitBox({
  commitTitle,
  commitDesc,
  commitState,
  coauthor,
  canCommit,
  stagedCount,
  onTitleChange,
  onDescChange,
  onCommit,
}: {
  commitTitle: string;
  commitDesc: string;
  commitState: "idle" | "committing" | "done" | "error";
  coauthor: boolean;
  canCommit: boolean;
  stagedCount: number;
  onTitleChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="dv-commit">
      <input
        className="dv-commit-msg"
        placeholder="Commit message"
        value={commitTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit(); } }}
        maxLength={72}
      />
      <textarea
        className="dv-commit-desc"
        placeholder="Description (optional)"
        value={commitDesc}
        onChange={(e) => onDescChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit(); } }}
        rows={2}
      />
      <div className="dv-coauthor-row">
        <span className="dv-coauthor-label">Co-authored-by Tempest</span>
        <input
          type="checkbox"
          className="dp-toggle"
          checked={coauthor}
          onChange={(e) => setAttribution(e.target.checked)}
        />
      </div>
      <button
        className={`dv-commit-btn${canCommit ? " ready" : ""}`}
        disabled={!canCommit || commitState === "committing"}
        onClick={onCommit}
      >
        {commitState === "committing" && <Loader size={12} className="dp-spin" />}
        {commitState === "done" && <Check size={12} />}
        Commit{stagedCount > 0 ? ` (${stagedCount})` : ""}
      </button>
      <button className="dv-amend-btn" onClick={() => {}}>
        <RotateCcw size={10} />
        Amend last commit
      </button>
    </div>
  );
}
