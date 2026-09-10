"use client";

import type { ReactNode } from "react";
import {
  Amp,
  Antigravity,
  ClaudeCode,
  Cline,
  Codex,
  Cursor,
  GeminiCLI,
  Goose,
  Grok,
  HermesAgent,
  OpenCode,
} from "@lobehub/icons";
import { InfiniteSlider } from "@/components/slider/infinite-slider";

const COMBINE_STYLE = {
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "center",
};

type Agent = { label: string; node: (size: number) => ReactNode };

const combine =
  (Icon: { Combine: React.ComponentType<{ size?: number; style?: React.CSSProperties; type?: "color" | "mono" }> }) =>
  (size: number) =>
    <Icon.Combine size={size} style={COMBINE_STYLE} type="mono" />;

const iconOnly =
  (Icon: React.ComponentType<{ size?: number }>) =>
  (size: number) =>
    (
      <span className="inline-flex items-center gap-1.5">
        <Icon size={size} />
        <span className="text-[13px]">Antigravity</span>
      </span>
    );

const AGENTS: Agent[] = [
  { label: "Claude Code", node: combine(ClaudeCode) },
  { label: "Codex", node: combine(Codex) },
  { label: "Goose", node: combine(Goose) },
  { label: "OpenCode", node: combine(OpenCode) },
  { label: "Cline", node: combine(Cline) },
  { label: "Gemini CLI", node: combine(GeminiCLI) },
  { label: "Hermes", node: combine(HermesAgent) },
  { label: "Amp", node: combine(Amp) },
  { label: "Cursor", node: combine(Cursor) },
  { label: "Antigravity", node: iconOnly(Antigravity) },
  { label: "Grok", node: combine(Grok) },
];

// mask fades the slider content to transparent at both edges (video shows through cleanly)
const EDGE_MASK =
  "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)";

export function AgentCycle({ size = 22 }: { size?: number }) {
  return (
    <>
      <span className="sr-only">
        Supports {AGENTS.map((a) => a.label).join(", ")}.
      </span>
      <div
        aria-hidden="true"
        className="w-full text-white"
        style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
      >
        <InfiniteSlider gap={40} speed={40} speedOnHover={15}>
          {AGENTS.map((agent, i) => (
            <span key={i} className="inline-flex items-center">
              {agent.node(size)}
            </span>
          ))}
        </InfiniteSlider>
      </div>
    </>
  );
}
