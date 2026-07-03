import { Network } from "lucide-react";
import "./NexusPage.css";

export function NexusPage() {
  return (
    <div className="nx-root">
      <div className="nx-empty">
        <Network size={40} className="nx-empty-icon" />
        <span className="nx-empty-title">Nexus</span>
        <span className="nx-empty-desc">Code graph visualization coming soon</span>
      </div>
    </div>
  );
}
