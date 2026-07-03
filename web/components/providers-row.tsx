"use client";

import {
  ClaudeCode,
  Cline,
  Codex,
  GeminiCLI,
  Goose,
  HermesAgent,
  OpenCode,
} from "@lobehub/icons";

const AGENTS = [
  { Icon: ClaudeCode, label: "Claude Code", size: 28 },
  { Icon: Codex, label: "Codex", size: 28 },
  { Icon: Goose, label: "Goose", size: 28 },
  { Icon: OpenCode, label: "OpenCode", size: 28 },
  { Icon: GeminiCLI, label: "Gemini CLI", size: 22 },
  { Icon: Cline, label: "Cline", size: 28 },
  { Icon: HermesAgent, label: "Hermes Agent", size: 28 },
] as const;

// The icons rely on @lobehub/ui's Flexbox, which only lays out horizontally
// when @lobehub/ui's global stylesheet (ThemeProvider) is loaded. This app does
// not load it, so `.lobe-flex` never gets `display:flex` and the Combine's logo
// + text stack vertically. We force a real horizontal flex context inline so the
// icon and text render side by side without depending on the global styles.
const COMBINE_STYLE = {
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "center",
};

export function ProvidersRow() {
  return (
    <div className="grid grid-cols-2 min-[600px]:grid-cols-4 min-[1000px]:grid-cols-7 gap-3 mt-6">
      {AGENTS.map(({ Icon, label, size }) => (
        <div
          key={label}
          className="h-24 rounded bg-foreground/[0.06] flex items-center justify-center px-4"
        >
          <Icon.Combine size={size} style={COMBINE_STYLE} />
        </div>
      ))}
    </div>
  );
}
