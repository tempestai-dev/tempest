import { createPortal } from "react-dom";
import { TerminalSquare, Loader, ChevronDown, SquareSlash } from "lucide-react";
import { AgentIcon, type AgentConfig } from "../NewSessionMenu";
import type { BranchInfo } from "../../types/git";
import type { RefObject } from "react";

type Props = {
  pendingAgent: AgentConfig | null;

  gitNotFoundRoot: boolean;
  gitNotFound: boolean;

  // shared root-git branch
  rootRemoteUrl: string;
  setRootRemoteUrl: (v: string) => void;
  rootGitInitializing: boolean;
  rootGitError: string | null;
  onSkipGitForRoot: () => void;
  onInitGitForRoot: () => void;
  onBackFromRoot: () => void;

  // git-not-found variant
  terminalError: string | null;
  terminalLaunching: boolean;
  onContinueWithoutGit: () => void;
  onInitGitAndLaunch: () => void;
  onBackFromGitNotFound: () => void;

  // main naming variant
  useExistingBranch: boolean;
  setUseExistingBranch: (v: boolean) => void;
  existingBranches: BranchInfo[];
  existingBranchName: string;
  setExistingBranchName: (v: string) => void;
  existingDropOpen: boolean;
  setExistingDropOpen: (updater: (v: boolean) => boolean) => void;
  existingDropRef: RefObject<HTMLDivElement | null>;
  terminalName: string;
  setTerminalName: (v: string) => void;
  terminalPrompt: string;
  setTerminalPrompt: (v: string) => void;
  onCancel: () => void;
  onLaunchInRoot: () => void;
  onLaunchTerminalWorktree: () => void;
};

export function TerminalNamingModal(p: Props) {
  return createPortal(
    <div className="naming-modal-overlay" onClick={p.onCancel}>
      <div className="naming-modal" onClick={(e) => e.stopPropagation()}>
        {p.gitNotFoundRoot ? (
          <>
            <div className="naming-modal-header">
              {p.pendingAgent ? <AgentIcon hint={p.pendingAgent.hint} size={15} /> : <TerminalSquare size={15} />}
              <span>No Git Repository Found</span>
            </div>
            <p className="naming-modal-desc">
              This folder isn't a Git repository. Initialize one to enable version
              control and the Changes tab, or continue without Git (the Changes tab
              will show a notice instead).
            </p>
            <div className="naming-modal-prompt-block">
              <label className="naming-modal-prompt-label">
                Remote URL
                <span className="naming-modal-prompt-hint"> — optional</span>
              </label>
              <input
                className="naming-modal-input"
                type="text"
                placeholder="https://github.com/user/repo.git"
                value={p.rootRemoteUrl}
                onChange={(e) => p.setRootRemoteUrl(e.target.value)}
              />
            </div>
            {p.rootGitError && <p className="naming-modal-error">{p.rootGitError}</p>}
            <div className="naming-modal-actions naming-modal-actions--git">
              <div className="naming-modal-actions-row">
                <button
                  className="naming-modal-btn naming-modal-btn--cancel"
                  disabled={p.rootGitInitializing}
                  onClick={p.onSkipGitForRoot}
                >
                  {p.rootGitInitializing ? <Loader size={13} className="spin" /> : "Continue without Git"}
                </button>
                <button
                  className="naming-modal-btn naming-modal-btn--create"
                  disabled={p.rootGitInitializing}
                  onClick={p.onInitGitForRoot}
                >
                  {p.rootGitInitializing ? <Loader size={13} className="spin" /> : "Initialize Git"}
                </button>
              </div>
              <button
                className="naming-modal-btn naming-modal-btn--back"
                onClick={p.onBackFromRoot}
              >
                Back
              </button>
            </div>
          </>
        ) : p.gitNotFound ? (
          <>
            <div className="naming-modal-header">
              {p.pendingAgent ? <AgentIcon hint={p.pendingAgent.hint} size={15} /> : <TerminalSquare size={15} />}
              <span>No Git Repository Found</span>
            </div>
            <p className="naming-modal-desc">
              This folder isn't a Git repository. Tempest can initialize one for you, or
              you can continue in a basic terminal-only environment with limited functionality.
            </p>
            {p.terminalError && <p className="naming-modal-error">{p.terminalError}</p>}
            <div className="naming-modal-actions naming-modal-actions--git">
              <div className="naming-modal-actions-row">
                <button
                  className="naming-modal-btn naming-modal-btn--cancel"
                  disabled={p.terminalLaunching}
                  onClick={p.onContinueWithoutGit}
                >
                  {p.terminalLaunching ? <Loader size={13} className="spin" /> : "Continue without Git"}
                </button>
                <button
                  className="naming-modal-btn naming-modal-btn--create"
                  disabled={p.terminalLaunching}
                  onClick={p.onInitGitAndLaunch}
                >
                  {p.terminalLaunching ? <Loader size={13} className="spin" /> : "Initialize Git & Launch"}
                </button>
              </div>
              <button
                className="naming-modal-btn naming-modal-btn--back"
                onClick={p.onBackFromGitNotFound}
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="naming-modal-header">
              {p.pendingAgent ? <AgentIcon hint={p.pendingAgent.hint} size={15} /> : <TerminalSquare size={15} />}
              <span>{p.pendingAgent ? `New ${p.pendingAgent.name} Session` : "New Workspace"}</span>
            </div>
            <p className="naming-modal-desc">Give your workspace a name to get started.</p>
            {(() => {
              const pickableBranches = p.existingBranches.filter((b) => !b.is_current);
              const noOtherBranches = pickableBranches.length === 0;
              return (
                <>
                  <div className="naming-modal-branch-toggle">
                    <button
                      className={`naming-modal-branch-opt${!p.useExistingBranch ? " active" : ""}`}
                      onClick={() => p.setUseExistingBranch(false)}
                    >New branch</button>
                    <button
                      className={`naming-modal-branch-opt${p.useExistingBranch ? " active" : ""}${noOtherBranches ? " naming-modal-branch-opt--disabled" : ""}`}
                      onClick={() => { if (!noOtherBranches) p.setUseExistingBranch(true); }}
                      disabled={noOtherBranches}
                      title={noOtherBranches ? "No other branches exist" : undefined}
                    >Use existing</button>
                  </div>
                  {p.useExistingBranch ? (
                    <div className="naming-modal-drop" ref={p.existingDropRef}>
                      <button
                        type="button"
                        className={`naming-modal-input naming-modal-drop-btn${p.existingDropOpen ? " naming-modal-drop-btn--open" : ""}`}
                        onClick={() => p.setExistingDropOpen((v) => !v)}
                      >
                        <span className={p.existingBranchName ? "" : "naming-modal-drop-placeholder"}>
                          {p.existingBranchName || "Select a branch…"}
                        </span>
                        <ChevronDown size={12} className={`naming-modal-drop-chevron${p.existingDropOpen ? " naming-modal-drop-chevron--open" : ""}`} />
                      </button>
                      {p.existingDropOpen && (
                        <div className="naming-modal-drop-menu">
                          {pickableBranches.map((b) => (
                            <button
                              key={b.name}
                              type="button"
                              className={`naming-modal-drop-item${b.name === p.existingBranchName ? " naming-modal-drop-item--active" : ""}${b.is_worktree ? " naming-modal-drop-item--worktree" : ""}${b.is_remote ? " naming-modal-drop-item--remote" : ""}`}
                              onClick={() => { p.setExistingBranchName(b.name); p.setExistingDropOpen(() => false); }}
                            >
                              <span className="naming-modal-drop-item-name">{b.name}</span>
                              {b.is_worktree && <span className="naming-modal-drop-badge">open</span>}
                              {b.is_remote && <span className="naming-modal-drop-badge">remote</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      className="naming-modal-input"
                      type="text"
                      placeholder="e.g. my-feature"
                      value={p.terminalName}
                      onChange={(e) => p.setTerminalName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") p.onLaunchTerminalWorktree(); }}
                      autoFocus
                    />
                  )}
                </>
              );
            })()}
            {p.pendingAgent && (
              <div className="naming-modal-prompt-block">
                <div className="naming-modal-prompt-label">
                  Custom Prompt
                  <span className="naming-modal-prompt-hint">Sent to the agent the moment it starts — leave blank to begin manually.</span>
                </div>
                <textarea
                  className="naming-modal-prompt"
                  placeholder="e.g. Refactor the auth module to use JWT tokens"
                  value={p.terminalPrompt}
                  onChange={(e) => p.setTerminalPrompt(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            {p.terminalError && <p className="naming-modal-error">{p.terminalError}</p>}
            <div className="naming-modal-actions">
              <button className="naming-modal-btn naming-modal-btn--cancel" onClick={p.onCancel}>
                Cancel
              </button>
              <button
                className="naming-modal-btn naming-modal-btn--root"
                disabled={p.terminalLaunching}
                onClick={p.onLaunchInRoot}
                title="Open directly in the project root — no branch created"
              >
                {p.terminalLaunching ? <Loader size={13} className="spin" /> : <><SquareSlash size={13} />in Root</>}
              </button>
              <button
                className="naming-modal-btn naming-modal-btn--create"
                disabled={(p.useExistingBranch ? !p.existingBranchName.trim() : !p.terminalName.trim()) || p.terminalLaunching}
                onClick={p.onLaunchTerminalWorktree}
              >
                {p.terminalLaunching ? <Loader size={13} className="spin" /> : p.useExistingBranch ? "Open Branch" : "in Branch"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
