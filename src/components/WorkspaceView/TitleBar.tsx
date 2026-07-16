import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Tooltip } from "../Tooltip";

const win = getCurrentWindow();

export function TitleBar() {
  return (
    <div className="topbar">
      <div className="topbar-drag" data-tauri-drag-region />
      <div className="topbar-right">
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
