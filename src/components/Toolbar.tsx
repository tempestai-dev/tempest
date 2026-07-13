interface Props {
  tabsMode: "designed" | "tabbed" | "ver1" | "designer";
  projectName: string;
  rightActions: React.ReactNode;
}

export function Toolbar({ tabsMode, projectName, rightActions }: Props) {
  const modeClass = tabsMode === "tabbed" ? " tabs-tabbed"
    : tabsMode === "ver1"      ? " tabs-ver1"
    : tabsMode === "designer"  ? " tabs-designer"
    : "";

  const letter = projectName[0]?.toUpperCase() ?? "";

  return (
    <div className={`bar${modeClass}`}>

      {/* Left end — project identity */}
      <div className="bar-end">
        {letter && (
          <>
            <div className="topbar-avatar">{letter}</div>
            <div className="topbar-slash" />
            <span className="topbar-title">{projectName}</span>
          </>
        )}
      </div>

      {/* Right end — actions slot */}
      <div className="bar-end">
        {rightActions}
      </div>
    </div>
  );
}
