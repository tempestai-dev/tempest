import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Tooltip } from "../Tooltip";
import {
  ACTION_DEFS,
  DEFAULTS,
  useKeybindings,
  setBinding,
  resetBinding,
  resetAllBindings,
  formatShortcut,
  shortcutFromEvent,
  type ActionId,
  type Shortcut,
} from "../../store/keybindings";

export function KeyboardSection() {
  const bindings = useKeybindings();
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); return; }
      const sc = shortcutFromEvent(e);
      if (sc) { setBinding(capturing, sc); setCapturing(null); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing]);

  const groups = ACTION_DEFS.reduce<Record<string, typeof ACTION_DEFS>>((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  const hasCustom = ACTION_DEFS.some(
    (d) => JSON.stringify(bindings[d.id]) !== JSON.stringify(DEFAULTS[d.id])
  );

  return (
    <div className="sp-section sp-section--kb" ref={overlayRef}>
      <div className="sp-kb-header-row">
        <div>
          <div className="sp-section-heading">Keybindings</div>
          <p className="sp-section-desc">Click a binding to remap it. Press Escape to cancel.</p>
        </div>
        {hasCustom && (
          <button className="sp-kb-reset-all" onClick={resetAllBindings}>
            <RotateCcw size={12} />
            Reset all
          </button>
        )}
      </div>

      {Object.entries(groups).map(([group, defs]) => (
        <div key={group} className="sp-kb-group">
          <div className="sp-kb-group-label">{group}</div>
          {defs.map((def) => {
            const sc = bindings[def.id];
            const isDefault = JSON.stringify(sc) === JSON.stringify(DEFAULTS[def.id]);
            const isCapturing = capturing === def.id;
            return (
              <div key={def.id} className="sp-kb-row">
                <span className="sp-kb-action">{def.label}</span>
                <div className="sp-kb-right">
                  <button
                    className={`sp-kb-binding${isCapturing ? " sp-kb-binding--capturing" : ""}`}
                    onClick={() => setCapturing(isCapturing ? null : def.id)}
                  >
                    {isCapturing
                      ? <span className="sp-kb-press-hint">Press shortcut…</span>
                      : <ShortcutChips shortcut={sc} />
                    }
                  </button>
                  {!isDefault && !isCapturing && (
                    <Tooltip content="Reset to default" placement="top">
                      <button
                        className="sp-kb-reset-btn"
                        onClick={(e) => { e.stopPropagation(); resetBinding(def.id); }}
                      >
                        <RotateCcw size={11} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ShortcutChips({ shortcut }: { shortcut: Shortcut | null }) {
  if (!shortcut) return <span className="sp-kb-unset">—</span>;
  const label = formatShortcut(shortcut);
  return (
    <span className="sp-kb-chips">
      {label.split("+").map((part, i) => (
        <span key={i} className="sp-kb-chip">{part}</span>
      ))}
    </span>
  );
}
