import { Minus, Square, X, ExternalLink } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Mark } from "../assets/Mark";
import { Tooltip } from "./Tooltip";
import "./TopBar.css";

const win = getCurrentWindow();

export function TopBar() {
  return (
    <div className="topbar">
      <div className="topbar-drag" data-tauri-drag-region />
      <div className="topbar-left">
        <Mark size={14} />
        <button className="topbar-zen-btn topbar-zen-btn--disabled" disabled title="Zen mode — coming soon" aria-label="Zen mode (disabled)">
          <ExternalLink size={12} />
        </button>
      </div>
      <div className="topbar-controls">
        <Tooltip content="Minimize" placement="bottom">
          <button className="win-btn" onClick={() => win.minimize()}>
            <Minus size={11} />
          </button>
        </Tooltip>
        <Tooltip content="Maximize" placement="bottom">
          <button className="win-btn" onClick={() => win.toggleMaximize()}>
            <Square size={10} />
          </button>
        </Tooltip>
        <Tooltip content="Close" placement="bottom">
          <button className="win-btn win-btn--close" onClick={() => win.close()}>
            <X size={12} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
