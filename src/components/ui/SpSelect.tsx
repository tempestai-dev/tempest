import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "../../icons/UiIcon";
const ChevronDown = (p: any) => <UiIcon name="chevron-down" {...p} />;
import "./SpSelect.css";

export function SpSelect({ value, options, onChange, className }: {
  value: string;
  options: { value: string; label: string; icon?: ReactNode }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Menu is portaled + position:fixed off the button's viewport rect, so it never
  // clips inside overflow:hidden parents (canvas nodes) and isn't scaled by canvas zoom.
  const [rect, setRect] = useState<{ left: number; top: number; width: number; flipUp: boolean } | null>(null);
  const current = options.find((o) => o.value === value);
  const label = current?.label ?? value;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Estimated menu height: 26px per row + 6px padding, capped at the CSS
    // max-height (240). Flip upward when the space below the button is less
    // than the menu wants AND there's more room above — matches shadcn.
    const menuH = Math.min(240, options.length * 26 + 6);
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const flipUp = below < menuH + 8 && above > below;
    setRect({
      left: r.left,
      top: flipUp ? r.top - menuH - 3 : r.bottom + 3,
      width: r.width,
      flipUp,
    });
  }, [open, options.length]);

  return (
    <div className={`sp-drop${className ? " " + className : ""}`}>
      <button
        ref={btnRef}
        className={`sp-drop-btn${open ? " sp-drop-btn--open" : ""}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        type="button"
      >
        {current?.icon && <span className="sp-drop-icon">{current.icon}</span>}
        <span className="sp-drop-label">{label}</span>
        <ChevronDown size={11} className="sp-drop-chevron" />
      </button>
      {open && rect && createPortal(
        <>
          <div className="sp-drop-overlay" onMouseDown={() => setOpen(false)} />
          <div
            className="sp-drop-menu nodrag nowheel"
            style={{ position: "fixed", left: rect.left, top: rect.top, minWidth: rect.width }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`sp-drop-item${o.value === value ? " sp-drop-item--active" : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.icon && <span className="sp-drop-icon">{o.icon}</span>}
                <span className="sp-drop-label">{o.label}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
