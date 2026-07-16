import { GitBranch, GitPullRequest, Loader, Check, X } from "lucide-react";

export function PushControls({
  currentBranch,
  pushState,
  branchPushState,
  showBranchInput,
  newBranchName,
  onSetShowBranchInput,
  onSetNewBranchName,
  onPushCurrent,
  onPushNewBranch,
}: {
  currentBranch: string;
  pushState: "idle" | "pushing" | "done";
  branchPushState: "idle" | "pushing" | "done" | "error";
  showBranchInput: boolean;
  newBranchName: string;
  onSetShowBranchInput: (v: boolean) => void;
  onSetNewBranchName: (v: string) => void;
  onPushCurrent: () => void;
  onPushNewBranch: () => void;
}) {
  if (!showBranchInput) {
    return (
      <>
        <button
          className="dv-push-btn"
          disabled={pushState === "pushing"}
          onClick={onPushCurrent}
          title={`Push to ${currentBranch || "current branch"}`}
        >
          {pushState === "pushing" ? <Loader size={11} className="dp-spin" /> : pushState === "done" ? <Check size={11} /> : <GitBranch size={11} />}
          Push
        </button>
        <button
          className="dv-push-btn dv-push-btn--outline"
          onClick={() => onSetShowBranchInput(true)}
          title="Create new branch and push"
        >
          <GitPullRequest size={11} />
          PR
        </button>
      </>
    );
  }
  return (
    <div className="dv-new-branch-row">
      <button className="dv-branch-cancel" onClick={() => { onSetShowBranchInput(false); onSetNewBranchName(""); }}>
        <X size={11} />
      </button>
      <input
        className="dv-branch-input"
        placeholder="branch-name"
        value={newBranchName}
        onChange={(e) => onSetNewBranchName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onPushNewBranch();
          if (e.key === "Escape") { onSetShowBranchInput(false); onSetNewBranchName(""); }
        }}
        autoFocus
      />
      <button
        className="dv-push-btn"
        disabled={!newBranchName.trim() || branchPushState === "pushing"}
        onClick={onPushNewBranch}
      >
        {branchPushState === "pushing" ? <Loader size={11} className="dp-spin" /> : <GitPullRequest size={11} />}
        Push & PR
      </button>
    </div>
  );
}
