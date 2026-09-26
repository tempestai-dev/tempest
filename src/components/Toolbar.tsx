import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Check } from "lucide-react";
import { Mark } from "../assets/Mark";
import { DynamicIsland } from "./DynamicIsland";

interface Props {
  tabsMode: "designed" | "tabbed" | "ver1" | "designer";
  projectName: string;
  rightActions: React.ReactNode;
}

type Mode = "agents" | "threads";
const MODES: { id: Mode; label: string }[] = [
  { id: "agents",  label: "Agents"  },
  { id: "threads", label: "Threads" },
];

export function Toolbar({ tabsMode, projectName, rightActions }: Props) {
  const modeClass = tabsMode === "tabbed" ? " tabs-tabbed"
    : tabsMode === "ver1"      ? " tabs-ver1"
    : tabsMode === "designer"  ? " tabs-designer"
    : "";

  // ponytail: local state only — no wiring yet, awaiting direction
  const [mode, setMode] = useState<Mode>("agents");
  const [open, setOpen] = useState(false);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const current = MODES.find((m) => m.id === mode)!;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={`bar${modeClass}`}>

      {/* Left end — project identity */}
      <div className="bar-end bar-end--identity">
        <Mark size={16} color="var(--tempest-fg-default)" />
        {projectName && (
          <>
            <div className="topbar-slash" />
            <span className="topbar-title">{projectName}</span>
            <div className="topbar-slash" />
            <div className="bar-mode-switch" ref={wrapRef}>
              <button
                ref={triggerRef}
                className="bar-mode-trigger"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
              >
                <span>{current.label}</span>
                <ChevronsUpDown size={10} className="bar-mode-trigger-chev" />
              </button>
              {open && menuPos && createPortal(
                <div
                  ref={menuRef}
                  className="bar-mode-menu"
                  role="listbox"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  {MODES.map((m) => {
                    const active = m.id === mode;
                    return (
                      <button
                        key={m.id}
                        role="option"
                        aria-selected={active}
                        className={`bar-mode-menu-item${active ? " bar-mode-menu-item--active" : ""}`}
                        onClick={() => { setMode(m.id); setOpen(false); }}
                      >
                        <span>{m.label}</span>
                        {active && <Check size={12} className="bar-mode-menu-check" />}
                      </button>
                    );
                  })}
                </div>,
                document.body,
              )}
            </div>
          </>
        )}
      </div>

      {/* Centred on the bar itself, not between the ends — so it holds the
          middle no matter how wide the project name or the actions slot get. */}
      <DynamicIsland />

      {/* Right end — actions slot */}
      <div className="bar-end">
        {rightActions}
      </div>
    </div>
  );
}
