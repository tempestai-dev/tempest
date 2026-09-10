"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Container } from "../_components/container";
import { Aurora } from "../_components/aurora";

type QA = { q: string; a: string };

const faqs: QA[] = [
  {
    q: "Is Tempest actually free?",
    a: "Yes. Apache 2.0, open source. The only cost is the model API you already have — and Token Intelligence cuts that by up to 86%.",
  },
  {
    q: "Which agents does it support?",
    a: "Any CLI agent. Claude Code, Codex, Gemini, Aider, Cline, opencode — if it runs in a terminal, it runs in Tempest. MCP config files are written automatically for the common ones.",
  },
  {
    q: "Does my code leave my machine?",
    a: "No. Tempest is local-first by architecture, not policy. The knowledge graph, worktrees, agent sessions, and Postgres branches all live on your disk. There is no cloud sync path.",
  },
  {
    q: "How is this different from just opening five terminals?",
    a: "Five terminals give you five copies of the same repo state and five independent context loads. Tempest gives each agent its own git worktree (no collisions), a shared code-knowledge graph (86% fewer tokens), an isolated Postgres branch (no DB corruption), and an OS-level sandbox (no runaway commands).",
  },
  {
    q: "Windows / macOS / Linux?",
    a: "All three. Native Tauri app — no Electron, no daemon. macOS and Windows have installers; Linux is build-from-source today with packages coming.",
  },
  {
    q: "Can I use my own API keys?",
    a: "Yes. Tempest uses your existing agent CLI installations, so whatever keys you already configured — Anthropic, OpenAI, Google — just work. Nothing goes through us.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#334155",
            "#000000",
            "#2563eb",
            "#000000",
            "#475569",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              FAQ
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">Questions we get a lot.</span>{" "}
              <span className="text-white/50">Answers in one line.</span>
            </h2>
          </div>
          <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
            Anything missing? File it on GitHub — we&apos;ll add it here.
          </p>
        </div>
      </div>

      <div className="border-t border-dashed border-white/15">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div
              key={f.q}
              className={
                (i > 0 ? "border-t border-dashed border-white/15 " : "") +
                "flex flex-col"
              }
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex items-center justify-between gap-6 px-6 py-5 text-left transition-colors hover:bg-white/[0.02] sm:px-8 sm:py-6 lg:px-10"
              >
                <span className="font-pixel text-[17px] leading-[1.2] tracking-[-0.02em] text-white sm:text-[19px]">
                  {f.q}
                </span>
                {isOpen ? (
                  <Minus size={16} strokeWidth={1.5} className="shrink-0 text-white/60" />
                ) : (
                  <Plus size={16} strokeWidth={1.5} className="shrink-0 text-white/60" />
                )}
              </button>
              {isOpen && (
                <div className="px-6 pb-6 sm:px-8 sm:pb-8 lg:px-10">
                  <p className="max-w-3xl text-[14px] font-light leading-[1.65] text-white/60">
                    {f.a}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Container>
  );
}
