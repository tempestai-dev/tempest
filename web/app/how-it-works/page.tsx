import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export const metadata: Metadata = {
  title: "How Tempest Works — Git Worktrees, Token Intelligence, Parallel Agents",
  description:
    "Tempest uses git worktrees for agent isolation and a local code-knowledge graph (Token Intelligence) to share context across sessions. Here is how it all fits together.",
  alternates: { canonical: `${SITE_URL}/how-it-works` },
  openGraph: {
    title: "How Tempest Works — Git Worktrees, Token Intelligence, Parallel Agents",
    description:
      "Tempest uses git worktrees for agent isolation and a local code-knowledge graph (Token Intelligence) to share context across sessions.",
    type: "website",
    url: `${SITE_URL}/how-it-works`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "How Tempest Works" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How Tempest Works — Git Worktrees, Token Intelligence, Parallel Agents",
    description:
      "Tempest uses git worktrees for agent isolation and a local code-knowledge graph (Token Intelligence) to share context across sessions.",
    images: ["/og-image.webp"],
  },
};

const steps = [
  {
    num: "01",
    title: "Open a project",
    body: "Point Tempest at a local git repository. The overview screen shows your recent projects and open sessions. Each project has its own set of agent sessions, Token Intelligence index, and workspace state.",
  },
  {
    num: "02",
    title: "Start an agent session",
    body: "Click the + tab to open a new session. Pick an agent — Claude Code, Aider, Cline, Goose, or any terminal-based tool. Tempest creates a new git worktree and a fresh branch for that session automatically. The agent starts in its own isolated working directory.",
  },
  {
    num: "03",
    title: "Run agents in parallel",
    body: "Open as many session tabs as you need. Each runs in its own worktree on its own branch. They cannot interfere — no shared files, no shared state, no merge conflicts mid-run. A live status indicator on each tab shows whether the agent is working or done, without you clicking in.",
  },
  {
    num: "04",
    title: "Token Intelligence indexes your codebase",
    body: "Atlas (the local code-knowledge graph) runs in the background on first open. It builds a semantic index of every symbol, import, and cross-file relationship in your project. Once indexed, every parallel session queries the graph instead of reading files from scratch — up to 86% fewer tokens across sessions.",
  },
  {
    num: "05",
    title: "Review, commit, push",
    body: "When an agent finishes, open its diff viewer. Review every changed file line by line. Stage what you want to keep, write a commit message, and push — all without leaving Tempest. Each session has its own branch so you can review and merge changes independently.",
  },
  {
    num: "06",
    title: "Sessions persist between visits",
    body: "Close a tab and the session is saved exactly as it is — conversation history, branch state, worktree contents. Reopen it and the agent picks up where it left off. Nothing is lost between sessions.",
  },
];

const underTheHood: [string, string][] = [
  ["Framework", "Tauri 2.x — Rust backend, React + TypeScript frontend"],
  ["Terminal", "Native PTY sessions per agent, ANSI-compatible"],
  ["Isolation", "Git worktrees — separate working directories per session"],
  ["Token Intelligence", "Atlas local semantic code graph, MCP protocol"],
  ["Persistence", "JSON state file per workspace, survives restarts"],
  ["License", "Apache 2.0 — free for commercial use"],
];

export default function HowItWorksPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "How Tempest Works — Git Worktrees, Token Intelligence, Parallel Agents",
            description:
              "Tempest uses git worktrees for agent isolation and a local code-knowledge graph (Token Intelligence) to share context across sessions. Here is how it all fits together.",
            url: `${SITE_URL}/how-it-works`,
            step: steps.map((s) => ({
              "@type": "HowToStep",
              name: s.title,
              text: s.body,
            })),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              {
                "@type": "ListItem",
                position: 2,
                name: "How It Works",
                item: `${SITE_URL}/how-it-works`,
              },
            ],
          }),
        }}
      />

      <PageHero
        eyebrow="How it works"
        headline="Two primitives."
        headlineMuted="Git worktrees for isolation. Token Intelligence for shared context."
        subhead="Tempest is a Tauri desktop app — Rust backend, React frontend, native WebView. Everything runs on your machine. No cloud, no servers, no data leaving your environment."
        actions={
          <>
            <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
              <Link href="/download">
                Download Now
                <Download data-icon="inline-end" />
              </Link>
            </Button>
            <Button
              asChild
              compact
              mono
              variant="secondary"
              className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
            >
              <Link href="/parallel-ai-agents">
                Parallel agents deep dive
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        }
      />

      <SectionShell eyebrow="Six steps" title="From clone to commit," titleMuted="one agent at a time.">
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 min-[700px]:grid-cols-2 min-[700px]:divide-y-0">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className={
                "flex flex-col gap-4 p-6 sm:p-8 border-dashed border-white/15 " +
                (i % 2 > 0 ? "min-[700px]:border-l " : "") +
                (i >= 2 ? "min-[700px]:border-t " : "")
              }
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/40">
                {step.num}
              </span>
              <h3 className="font-pixel text-[20px] leading-[1.1] tracking-[-0.02em] text-white">
                {step.title}
              </h3>
              <p className="text-[14px] font-light leading-[1.6] text-white/60">{step.body}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell eyebrow="Under the hood" title="What ships in the binary.">
        <div className="divide-y divide-dashed divide-white/15">
          {underTheHood.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-1 gap-2 px-6 py-5 sm:grid-cols-[200px_1fr] sm:gap-6 sm:px-10 sm:py-6 lg:px-14"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                {label}
              </span>
              <span className="text-[14px] font-light leading-[1.6] text-white/70">{value}</span>
            </div>
          ))}
        </div>
      </SectionShell>
    </main>
  );
}
