"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

const faqs = [
  {
    q: "Is Tempest free?",
    a: "Yes. Tempest is free and open source under the Apache 2.0 license. Download it, use it, build with it — no subscription, no seat fee.",
  },
  {
    q: "What AI coding tools does Tempest support?",
    a: "Claude Code, Aider, OpenCode, Copilot CLI, Cline, Goose — and anything else you can run in a terminal. If it runs in a shell, Tempest can run it.",
  },
  {
    q: "How does isolation work?",
    a: "Each session runs in its own git worktree, which is a separate working directory linked to your repo. Agents write to their own branch and never touch each other's files.",
  },
  {
    q: "What happens when I close a tab?",
    a: "The session is preserved exactly as you left it — including the full conversation history with the agent. Reopen it and it picks up right where it stopped.",
  },
  {
    q: "Is it only for Windows?",
    a: "Pre-built binaries are Windows-only in early access. You can build from source on Windows, macOS, and Linux today. Mac and Linux binaries are on the roadmap.",
  },
  {
    q: "What are Token Intelligence and Database Branches?",
    a: "Token Intelligence is a local code-knowledge graph in active development that cuts context consumption by up to 64%. Database Branches gives each agent session its own isolated Postgres instance. Both are coming soon.",
  },
]

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-1 min-[900px]:grid-cols-[2fr_3fr] gap-12 min-[900px]:gap-20">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground font-semibold">FAQ</p>
        <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
          Answers to the questions that come up most.
        </h2>
        <div className="mt-auto pt-8 flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">Still have questions?</p>
          <p className="text-sm text-muted-foreground">Open an issue on GitHub and we'll get back to you.</p>
          <a
            href="https://github.com/tempestai-dev/tempest/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors w-fit"
          >
            Open an issue
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="h-[calc(1rem+12px)] hidden min-[900px]:block" />
        {faqs.map((faq, i) => (
          <div key={i} className="rounded bg-foreground/[0.06] overflow-hidden">
            <button
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <p className="text-sm text-foreground">{faq.q}</p>
              <Plus
                className="size-4 text-muted-foreground shrink-0 transition-transform duration-200"
                style={{ transform: open === i ? "rotate(45deg)" : "rotate(0deg)" }}
              />
            </button>
            {open === i && (
              <div className="px-5 pb-5">
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
