import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Shield, Globe, HardDrive, Lock, Database, Bot } from "lucide-react";
import { SandboxSection }     from "./ProjectSettingsPanel/SandboxSection";
import { NetworkSection }     from "./ProjectSettingsPanel/NetworkSection";
import { FilesystemSection }  from "./ProjectSettingsPanel/FilesystemSection";
import { PermissionsSection } from "./ProjectSettingsPanel/PermissionsSection";
import { DatabaseSection }    from "./ProjectSettingsPanel/DatabaseSection";
import { AgentSection }       from "./ProjectSettingsPanel/AgentSection";
import { useProjectSettings } from "./ProjectSettingsPanel/useProjectSettings";
import "./SettingsPanel.css";
import "./ProjectSettingsPanel.css";

type Section =
  | "sandbox" | "network" | "filesystem" | "permissions"
  | "database" | "agent";

interface Props {
  projectId: string;
  projectPath: string;
  projectName: string;
  onClose: () => void;
}

export function ProjectSettingsPanel({ projectId, projectPath, projectName, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("sandbox");
  const [settings, setSettings] = useProjectSettings(projectId, projectPath);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="sp-overlay" onClick={onClose}>
      <div className="sp-panel psp-panel" onClick={(e) => e.stopPropagation()}>

        <div className="sp-header">
          <div className="psp-header-text">
            <span className="sp-title">Project Settings</span>
            <div className="topbar-slash" />
            <span className="psp-project-name">{projectName}</span>
          </div>
          <button className="sp-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="sp-body">
          <nav className="sp-nav">
            <div className="sp-nav-group-label">Security</div>
            <NavItem icon={<Shield size={14} />}    label="Sandbox"     active={activeSection === "sandbox"}     onClick={() => setActiveSection("sandbox")} />
            <NavItem icon={<Globe size={14} />}     label="Network"     active={activeSection === "network"}     onClick={() => setActiveSection("network")} />
            <NavItem icon={<HardDrive size={14} />} label="Filesystem"  active={activeSection === "filesystem"}  onClick={() => setActiveSection("filesystem")} />
            <NavItem icon={<Lock size={14} />}      label="Permissions" active={activeSection === "permissions"} onClick={() => setActiveSection("permissions")} />

            <div className="sp-nav-group-label sp-nav-group-label--lower">Agent</div>
            <NavItem icon={<Bot size={14} />}       label="Agents"   active={activeSection === "agent"}    onClick={() => setActiveSection("agent")} />

            <div className="sp-nav-group-label sp-nav-group-label--lower">Data</div>
            <NavItem icon={<Database size={14} />}  label="Database" active={activeSection === "database"} onClick={() => setActiveSection("database")} />
          </nav>

          <div className="sp-content">
            {activeSection === "sandbox"     && <SandboxSection     value={settings.sandbox}     onChange={(sandbox) => setSettings({ ...settings, sandbox })} />}
            {activeSection === "network"     && <NetworkSection     value={settings.network}     onChange={(network) => setSettings({ ...settings, network })} />}
            {activeSection === "filesystem"  && <FilesystemSection  value={settings.filesystem}  onChange={(filesystem) => setSettings({ ...settings, filesystem })} />}
            {activeSection === "permissions" && <PermissionsSection value={settings.permissions} onChange={(permissions) => setSettings({ ...settings, permissions })} />}
            {activeSection === "agent"       && <AgentSection       value={settings.agents}      onChange={(agents) => setSettings({ ...settings, agents })} />}
            {activeSection === "database"    && <DatabaseSection workspacePath={projectPath} projectName={projectName} value={settings.database} onChange={(database) => setSettings({ ...settings, database })} />}
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}

function NavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`sp-nav-item${active ? " sp-nav-item--active" : ""}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
