import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./AtlasIndexModal.css";

interface Props {
  path: string;
  onCancel: () => void;
  onComplete: () => void;
  /** Dev flag: disables polling and auto-dismiss so the modal stays open for inspection. */
  persistent?: boolean;
}

export function AtlasIndexModal({ path, onCancel, onComplete, persistent }: Props) {
  const [currentLine, setCurrentLine] = useState("Starting…");
  const [done, setDone] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Replace current line with each incoming atlas:log line for this path
  useEffect(() => {
    if (persistent) return;
    const p = listen<{ path: string; line: string }>("atlas:log", (e) => {
      if (e.payload.path === path) setCurrentLine(e.payload.line);
    });
    return () => { p.then((fn) => fn()); };
  }, [path, persistent]);

  // Poll every 2s until atlas.db exists (skipped in persistent/dev mode)
  useEffect(() => {
    if (persistent || done) return;
    const id = setInterval(() => {
      invoke<boolean>("check_atlas_db", { projectPath: path })
        .then((exists) => {
          if (exists && !completedRef.current) {
            completedRef.current = true;
            setDone(true);
            setCurrentLine("Index complete");
            setTimeout(() => onCompleteRef.current(), 1500);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [path, done, persistent]);

  return createPortal(
    <div className="aim-overlay">
      <div className="aim-dialog">
        <div className="aim-header">
          <span
            className={`aim-icon${done ? " aim-icon--done" : ""}`}
            aria-hidden="true"
          >
            {done ? (
              <svg className="aim-check" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <span className="aim-spinner" />
            )}
          </span>
          <h2 className="aim-title">
            {done ? "Codebase indexed" : "Indexing your codebase"}
          </h2>
        </div>

        <p className="aim-line" title={currentLine}>{currentLine}</p>

        <div className="aim-progress" role="progressbar" aria-label="Indexing progress">
          <div className={`aim-bar${done ? " aim-bar--done" : ""}`} />
        </div>

        <div className="aim-actions">
          <button className="aim-cancel-btn" onClick={onCancel} disabled={done}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
