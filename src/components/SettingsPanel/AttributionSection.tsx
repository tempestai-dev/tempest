import { useAttribution, setAttribution } from "../../store/attribution";

interface AttributionSectionProps {
  onToggle?: (enabled: boolean) => void;
}

export function AttributionSection({ onToggle }: AttributionSectionProps) {
  const enabled = useAttribution();

  function toggle() {
    const next = !enabled;
    setAttribution(next);
    onToggle?.(next);
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Tempest Co-authorship</div>
      <p className="sp-section-desc">
        Tempest is open source. This feature is one small way you can help it grow.
      </p>
      <p className="sp-section-desc">
        When enabled, Tempest adds itself as a co-author on commits made inside your
        workspaces. On GitHub, that means every commit shows Tempest next to your name —
        a quiet signal to other developers that this project was built with the help of Tempest.
        No data is collected and nothing is sent anywhere. It is purely a git trailer
        line in the commit message, and you can turn it off at any time.
      </p>

      <div className="sp-toggle-row" onClick={toggle}>
        <div className="sp-toggle-text">
          <span className="sp-toggle-label">Add Tempest as co-author</span>
          <span className="sp-toggle-desc">Off by default — entirely your choice.</span>
        </div>
        <button
          className={`sp-toggle${enabled ? " sp-toggle--on" : ""}`}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          role="switch"
          aria-checked={enabled}
        >
          <span className="sp-toggle-thumb" />
        </button>
      </div>

      {enabled && (
        <p className="sp-attribution-note">
          Hook written to <code className="sp-code">.git/hooks/prepare-commit-msg</code> in
          each open project. Disabling removes it automatically.
        </p>
      )}
    </div>
  );
}
