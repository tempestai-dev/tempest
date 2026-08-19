import type { ReactElement } from "react";
import { Icon } from "./icons";
import type { Source } from "./types";

const TABS: { id: Source; label: string; glyph: () => ReactElement }[] = [
  { id: "unified", label: "Unified", glyph: Icon.tabUnified },
  { id: "github", label: "GitHub", glyph: Icon.ghMark },
  { id: "linear", label: "Linear", glyph: Icon.linearMark },
];

export function SourceTabs({
  source,
  counts,
  onChange,
  onRefresh,
  refreshing,
}: {
  source: Source;
  counts: Record<Source, number | null>;
  onChange: (s: Source) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="source-tabs">
      <div className="tabs">
        {TABS.map((t) => {
          const n = counts[t.id];
          return (
            <button
              key={t.id}
              className={`tab${source === t.id ? " active" : ""}`}
              onClick={() => onChange(t.id)}
            >
              {t.glyph()}
              <span>{t.label}</span>
              {n !== null && <span className="counter">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="tabs-right">
        <button
          className={`icon-btn${refreshing ? " is-spinning" : ""}`}
          title="Refresh"
          aria-label="Refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {Icon.refresh()}
        </button>
      </div>
    </header>
  );
}
