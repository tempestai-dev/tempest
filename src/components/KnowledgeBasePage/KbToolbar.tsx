import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, ChevronDown } from "lucide-react";
import { Tooltip } from "../Tooltip";
import type { IndexedProject } from "../../types/knowledgeGraph";

type Props = {
  projects: IndexedProject[];
  selectedPath: string | null;
  hasGraph: boolean;
  onSelectPath: (path: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
};

export function KbToolbar({
  projects, selectedPath, hasGraph,
  onSelectPath, onZoomIn, onZoomOut, onFit, onReset,
}: Props) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div className="kb-toolbar">
      <div className="kb-project-drop" ref={dropRef}>
        <button
          className={`kb-project-drop-btn${open ? " kb-project-drop-btn--open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          disabled={projects.length === 0}
        >
          <span className="kb-project-drop-label">
            {projects.find((p) => p.path === selectedPath)?.name ?? "No indexed projects"}
          </span>
          <ChevronDown size={12} className="kb-project-drop-chevron" />
        </button>
        {open && projects.length > 0 && (
          <div className="kb-project-drop-menu">
            {projects.map((p) => (
              <button
                key={p.id}
                className={`kb-project-drop-item${p.path === selectedPath ? " kb-project-drop-item--active" : ""}`}
                onClick={() => { onSelectPath(p.path); setOpen(false); }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="kb-toolbar-divider" />

      <Tooltip content="Zoom in" placement="top">
        <button className="kb-tool-btn" onClick={onZoomIn} disabled={!hasGraph}><ZoomIn size={14} /></button>
      </Tooltip>
      <Tooltip content="Zoom out" placement="top">
        <button className="kb-tool-btn" onClick={onZoomOut} disabled={!hasGraph}><ZoomOut size={14} /></button>
      </Tooltip>
      <Tooltip content="Fit to screen" placement="top">
        <button className="kb-tool-btn" onClick={onFit} disabled={!hasGraph}><Maximize2 size={14} /></button>
      </Tooltip>
      <Tooltip content="Reset view" placement="top">
        <button className="kb-tool-btn" onClick={onReset} disabled={!hasGraph}><RotateCcw size={14} /></button>
      </Tooltip>
    </div>
  );
}
