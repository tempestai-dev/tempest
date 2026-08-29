import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

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
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "How Tempest Works" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How Tempest Works — Git Worktrees, Token Intelligence, Parallel Agents",
    description:
      "Tempest uses git worktrees for agent isolation and a local code-knowledge graph (Token Intelligence) to share context across sessions.",
    images: ["/og-image.png"],
  },
}

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
    body: "Atlas (the local code-knowledge graph) runs in the background on first open. It builds a semantic index of every symbol, import, and cross-file relationship in your project. Once indexed, every parallel session queries the graph instead of reading files from scratch — up to 64% fewer tokens across sessions.",
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
]

export default function HowItWorksPage() {
  return (
    <main>
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
              { "@type": "ListItem", position: 2, name: "How It Works", item: `${SITE_URL}/how-it-works` },
            ],
          }),
        }}
      />

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">HOW IT WORKS</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">Two primitives.</span>{" "}
            <span className="text-muted-foreground">Git worktrees for isolation. Token Intelligence for shared context.</span>
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-16 max-w-xl">
            Tempest is a Tauri desktop app — Rust backend, React frontend, native WebView. Everything runs on your machine. No cloud, no servers, no data leaving your environment.
          </p>

          <div className="flex flex-col gap-12">
            {steps.map((step) => (
              <div key={step.num} className="flex gap-6">
                <div className="shrink-0 w-8 pt-0.5">
                  <span className="text-sm text-muted-foreground/50 font-mono">{step.num}</span>
                </div>
                <div>
                  <h2 className="text-base font-medium text-foreground mb-2">{step.title}</h2>
                  <p className="text-base text-muted-foreground leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 p-6 rounded border border-foreground/[0.08] bg-foreground/[0.02]">
            <p className="text-sm font-medium text-foreground mb-3">Under the hood</p>
            <div className="flex flex-col gap-2.5">
              {[
                ["Framework", "Tauri 2.x — Rust backend, React + TypeScript frontend"],
                ["Terminal", "Native PTY sessions per agent, ANSI-compatible"],
                ["Isolation", "Git worktrees — separate working directories per session"],
                ["Token Intelligence", "Atlas local semantic code graph, MCP protocol"],
                ["Persistence", "JSON state file per workspace, survives restarts"],
                ["License", "Apache 2.0 — free for commercial use"],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[120px_1fr] gap-3 text-sm">
                  <span className="text-muted-foreground/60">{label}</span>
                  <span className="text-muted-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            <Link
              href="/download"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download free
            </Link>
            <Link
              href="/parallel-ai-agents"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-colors"
            >
              Parallel AI agents deep dive
            </Link>
          </div>
        </div>
      </Container>
    </main>
  )
}
