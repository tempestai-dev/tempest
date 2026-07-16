export function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`sp-toggle${on ? " sp-toggle--on" : ""}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    >
      <span className="sp-toggle-thumb" />
    </button>
  );
}
