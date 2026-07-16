import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function SpSelect({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="sp-drop" ref={ref}>
      <button
        className={`sp-drop-btn${open ? " sp-drop-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="sp-drop-label">{label}</span>
        <ChevronDown size={11} className="sp-drop-chevron" />
      </button>
      {open && (
        <div className="sp-drop-menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`sp-drop-item${o.value === value ? " sp-drop-item--active" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
