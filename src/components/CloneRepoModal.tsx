import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen } from "lucide-react";
import { parseCloneUrl, defaultFolderName, classifyCloneError, type ClassifiedCloneError } from "../lib/gitClone";
import "./NewProjectModal.css";
import "./CloneRepoModal.css";

interface Props {
  onClose: () => void;
  /** Called with the freshly-cloned folder's path once `git clone` succeeds. */
  onCloned: (path: string) => void;
}

const CATEGORY_COPY: Record<ClassifiedCloneError["category"], string> = {
  auth: "Authentication failed — check your SSH key or credential helper for this host.",
  exists: "That folder already has files in it.",
  network: "Couldn't reach the remote — check your connection and the URL.",
  unknown: "The clone failed.",
};

export function CloneRepoModal({ onClose, onCloned }: Props) {
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderNameTouched, setFolderNameTouched] = useState(false);
  const [targetWarning, setTargetWarning] = useState(false);
  const [gitMissing, setGitMissing] = useState(false);
  const [phase, setPhase] = useState<"form" | "cloning" | "error">("form");
  const [currentLine, setCurrentLine] = useState("Starting…");
  const [error, setError] = useState<ClassifiedCloneError | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    invoke<boolean>("check_program_available", { program: "git" })
      .then((available) => setGitMissing(!available))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "cloning") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  // Pre-flight check: does parentDir/folderName already exist and have files?
  useEffect(() => {
    if (!parentDir || !folderName) { setTargetWarning(false); return; }
    const id = setTimeout(() => {
      invoke<boolean>("check_clone_target", { parentDir, folderName })
        .then(setTargetWarning)
        .catch(() => setTargetWarning(false));
    }, 300);
    return () => clearTimeout(id);
  }, [parentDir, folderName]);

  function onUrlChange(value: string) {
    setUrl(value);
    setError(null);
    if (!folderNameTouched) setFolderName(defaultFolderName(value));
  }

  async function browse() {
    const path = await open({ directory: true, multiple: false, title: "Select parent folder" });
    if (path) setParentDir(path);
  }

  async function clone() {
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setPhase("cloning");
    setCurrentLine("Starting…");

    const unlisten = await listen<{ requestId: string; line: string }>("git-clone:log", (e) => {
      if (e.payload.requestId === requestId) setCurrentLine(e.payload.line);
    });

    try {
      const clonedPath = await invoke<string>("git_clone_repo", {
        requestId,
        url: url.trim(),
        parentDir,
        folderName,
      });
      onCloned(clonedPath);
    } catch (e) {
      setError(classifyCloneError(String(e)));
      setPhase("error");
    } finally {
      unlisten();
    }
  }

  const parsedUrl = parseCloneUrl(url);
  const canClone = parsedUrl.valid && parentDir.length > 0 && folderName.trim().length > 0 && !gitMissing && phase === "form";

  return (
    <div className="modal-overlay" onClick={() => phase !== "cloning" && onClose()}>
      <div className="modal crm-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Clone from remote</h2>

        {phase === "cloning" ? (
          <div className="crm-progress">
            <span className="crm-spinner" aria-hidden="true" />
            <p className="crm-line" title={currentLine}>{currentLine}</p>
          </div>
        ) : (
          <>
            <div className="modal-field">
              <label className="modal-label">Repository URL</label>
              <input
                className="modal-input"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                autoFocus
              />
              {url.length > 0 && !parsedUrl.valid && (
                <p className="modal-error">Not a valid repository URL.</p>
              )}
            </div>

            <div className="modal-field">
              <label className="modal-label">Parent folder</label>
              <div className="modal-location-row">
                <input
                  className="modal-input modal-input--location"
                  placeholder="Select a folder…"
                  value={parentDir}
                  readOnly
                  onClick={browse}
                />
                <button className="modal-browse-btn" onClick={browse}>
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">Folder name</label>
              <input
                className="modal-input"
                placeholder="repo"
                value={folderName}
                onChange={(e) => { setFolderName(e.target.value); setFolderNameTouched(true); }}
                onKeyDown={(e) => e.key === "Enter" && canClone && clone()}
              />
              {targetWarning && (
                <p className="modal-error">A non-empty folder already exists at this location.</p>
              )}
            </div>

            {gitMissing && (
              <p className="modal-error">git was not found on your PATH — install git to clone a repository.</p>
            )}

            {phase === "error" && error && (
              <div className="crm-error-panel">
                <p className="modal-error">{CATEGORY_COPY[error.category]}</p>
                <pre className="crm-error-detail">{error.message}</pre>
              </div>
            )}
          </>
        )}

        <div className="modal-footer">
          {phase === "error" ? (
            <>
              <button className="modal-btn modal-btn--cancel" onClick={onClose}>Cancel</button>
              <button className="modal-btn modal-btn--create" onClick={() => setPhase("form")}>Try again</button>
            </>
          ) : (
            <>
              <button className="modal-btn modal-btn--cancel" onClick={onClose} disabled={phase === "cloning"}>
                Cancel
              </button>
              <button className="modal-btn modal-btn--create" onClick={clone} disabled={!canClone}>
                {phase === "cloning" ? "Cloning…" : "Clone"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
