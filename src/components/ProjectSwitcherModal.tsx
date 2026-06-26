import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Link, ChevronRight } from "lucide-react";
import { getRecents, type RecentWorkspace } from "../store/recents";
import "./ProjectSwitcherModal.css";

function folderName(path: string): string {
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? path;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface Props {
  anchorRect: DOMRect;
  onClose: () => void;
  onSwitch: (name: string, path: string) => Promise<void>;
}

export function ProjectSwitcherModal({ anchorRect, onClose, onSwitch }: Props) {
  const [recents] = useState<RecentWorkspace[]>(() => getRecents());
  const [cloneMode, setCloneMode] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [onClose]);

  async function openLocal() {
    const path = await open({ directory: true, multiple: false });
    if (!path) return;
    await onSwitch(folderName(path), path);
    onClose();
  }

  async function selectRecent(ws: RecentWorkspace) {
    await onSwitch(ws.name, ws.path);
    onClose();
  }

  const style = {
    position: "fixed" as const,
    top: `${anchorRect.top}px`,
    left: `${anchorRect.right}px`,
    width: "max-content",
    minWidth: "260px",
    transform: "translateY(calc(-100% - 8px))",
  };

  return createPortal(
    <div className="psm" ref={ref} style={style}>
      <div className="psm-recents">
        {recents.length === 0 ? (
          <div className="psm-empty">No recent projects</div>
        ) : (
          recents.slice(0, 8).map((ws) => (
            <div key={ws.id} className="psm-recent-item" onClick={() => selectRecent(ws)}>
              <div className="psm-recent-info">
                <span className="psm-recent-name">{ws.name}</span>
              </div>
              <div className="psm-recent-right">
                <span className="psm-recent-time">{formatRelativeTime(ws.lastOpened)}</span>
                <ChevronRight size={13} className="psm-recent-chevron" />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="psm-actions">
        <button className="psm-action-btn" onClick={openLocal}>
          <FolderOpen size={14} />
          <span>Open local folder</span>
        </button>
        <button className="psm-action-btn" onClick={() => setCloneMode((v) => !v)}>
          <Link size={14} />
          <span>Clone from URL</span>
        </button>
      </div>

      {cloneMode && (
        <div className="psm-clone">
          <input
            className="psm-clone-input"
            placeholder="https://github.com/user/repo"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            autoFocus
          />
          <button className="psm-clone-btn" disabled={!cloneUrl.trim()}>
            Clone
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
