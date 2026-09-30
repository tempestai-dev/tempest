import { UiIcon } from "../../icons/UiIcon";
const Minus = (p: any) => <UiIcon name="minus" {...p} />;
const Square = (p: any) => <UiIcon name="square" {...p} />;
const X = (p: any) => <UiIcon name="x" {...p} />;
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Tooltip } from "../Tooltip";
import { QuotaIsland } from "../QuotaIsland";

const win = getCurrentWindow();

export function TitleBar() {
  return (
    <div className="topbar">
      <div className="topbar-drag" data-tauri-drag-region />
      <div className="topbar-right">
        <QuotaIsland />
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
