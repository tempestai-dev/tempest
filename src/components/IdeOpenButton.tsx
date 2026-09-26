import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useSettings } from "../store/appSettings";
import vscodeSrc from "../assets/agent-icons/vscode.svg";
import cursorSrc from "../assets/agent-icons/cursor.svg";
import zedSrc from "../assets/agent-icons/zed.svg";
import windsurfSrc from "../assets/agent-icons/windsurf.svg";
import jetbrainsSrc from "../assets/agent-icons/jetbrains.svg";
import sublimeSrc from "../assets/agent-icons/sublime.svg";
import devinSrc from "../assets/agent-icons/devin.svg";

export type Ide = { id: string; label: string; cmd: string; iconSrc: string; mono?: boolean };

export const IDES: Ide[] = [
  { id: "cursor",    label: "Cursor",        cmd: "cursor",   iconSrc: cursorSrc,    mono: true },
  { id: "vscode",    label: "Code",          cmd: "code",     iconSrc: vscodeSrc },
  { id: "zed",       label: "Zed",           cmd: "zed",      iconSrc: zedSrc },
  { id: "windsurf",  label: "Windsurf",      cmd: "windsurf", iconSrc: windsurfSrc },
  { id: "jetbrains", label: "IntelliJ IDEA", cmd: "idea",     iconSrc: jetbrainsSrc },
  { id: "sublime",   label: "Sublime Text",  cmd: "subl",     iconSrc: sublimeSrc },
  { id: "devin",     label: "Devin",         cmd: "devin",    iconSrc: devinSrc,     mono: true },
];

export function IdeOpenButton({ path }: { path: string }) {
  const settings = useSettings();
  const choice = IDES.find((i) => i.id === settings.defaultIde) ?? IDES[0];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    if (moreRef.current) {
      const r = moreRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (moreRef.current?.contains(t as Node)) return;
      if (t?.closest(".ide-open-menu")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const launch = (ide: Ide) => {
    openPath(path, ide.cmd).catch((e) => console.error("[open-in-ide]", ide.cmd, e));
  };

  return (
    <div className="ide-open-group">
      <button
        className="ide-open-btn ide-open-btn--main"
        title={`Open worktree in ${choice.label}`}
        onClick={() => launch(choice)}
      >
        <img src={choice.iconSrc} alt="" className={`ide-open-btn__icon${choice.mono ? " agent-icon--mono" : ""}`} />
        <span className="ide-open-btn__label">Open in {choice.label}</span>
      </button>
      <button
        ref={moreRef}
        className="ide-open-btn ide-open-btn--more"
        title="Choose IDE"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={12} />
      </button>
      {open && pos && createPortal(
        <div className="ide-open-menu" style={{ top: pos.top, right: pos.right }}>
          {IDES.map((ide) => (
            <button
              key={ide.id}
              className={`ide-open-menu-item${ide.id === choice.id ? " ide-open-menu-item--active" : ""}`}
              onClick={() => { launch(ide); setOpen(false); }}
            >
              <img src={ide.iconSrc} alt="" className={`ide-open-menu-item__icon${ide.mono ? " agent-icon--mono" : ""}`} />
              <span>{ide.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
