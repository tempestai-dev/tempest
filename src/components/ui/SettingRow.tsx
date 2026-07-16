import type { ReactNode } from "react";

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="sp-row">
      <div className="sp-row-text">
        <span className="sp-row-label">{label}</span>
        {hint && <span className="sp-row-hint">{hint}</span>}
      </div>
      <div className="sp-row-control">{children}</div>
    </div>
  );
}
