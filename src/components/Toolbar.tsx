import { DynamicIsland } from "./DynamicIsland";

export type SidebarMode = "agents" | "threads";

interface Props {
  tabsMode: "designed" | "tabbed" | "ver1" | "designer";
  projectName: string;
  rightActions: React.ReactNode;
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
}

const MODES: { id: SidebarMode; label: string }[] = [
  { id: "agents",  label: "Agents"  },
  { id: "threads", label: "Threads" },
];

export function Toolbar({ tabsMode, projectName, rightActions, mode, onModeChange }: Props) {
  const modeClass = tabsMode === "tabbed" ? " tabs-tabbed"
    : tabsMode === "ver1"      ? " tabs-ver1"
    : tabsMode === "designer"  ? " tabs-designer"
    : "";

  return (
    <div className={`bar${modeClass}`}>

      {/* Left end — project identity */}
      <div className="bar-end bar-end--identity">
        {projectName && (
          <>
            <div className="bar-mode-seg" role="tablist" aria-label="View mode">
              {MODES.map((m) => {
                const active = m.id === mode;
                return (
                  <button
                    key={m.id}
                    role="tab"
                    aria-selected={active}
                    className={`bar-mode-seg-item${active ? " bar-mode-seg-item--active" : ""}`}
                    onClick={() => onModeChange(m.id)}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div className="topbar-slash" />
            <span className="topbar-title">{projectName}</span>
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
