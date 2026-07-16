import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, Coins, Layers } from "lucide-react";
import { Container } from "@/components/layout/container";

export const metadata: Metadata = {
  metadataBase: new URL("https://tempestai.dev"),
  title: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
  description:
    "Evaluating Conductor alternatives? Tempest indexes your repository once and shares that context across every agent — up to 64% fewer tokens, up to 58% fewer tool calls, with full git worktree isolation per agent.",
  alternates: {
    canonical: "https://tempestai.dev/tempest-vs-conductor",
  },
  openGraph: {
    title: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
    description:
      "Evaluating Conductor alternatives? Tempest indexes your repository once and shares that context across every agent — up to 64% fewer tokens, up to 58% fewer tool calls, with full git worktree isolation per agent.",
    type: "website",
    url: "https://tempestai.dev/tempest-vs-conductor",
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest vs Conductor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
    description:
      "Evaluating Conductor alternatives? Tempest indexes your repository once and shares that context across every agent — up to 64% fewer tokens, up to 58% fewer tool calls, with full git worktree isolation per agent.",
    images: ["/og-image.png"],
  },
  keywords: [
    "conductor alternative",
    "conductor build alternative",
    "conductor vs tempest",
    "conductor alternatives",
    "token-efficient AI IDE",
    "multi-agent coding",
    "AI development environment",
    "parallel AI agents",
    "shared repository context",
  ],
};

const features = [
  {
    icon: Coins,
    title: "Shared repository knowledge graph",
    body: "Tempest indexes your codebase once and shares that understanding across every running agent. Agents pull from the graph instead of rediscovering files themselves — up to 64% less context consumed, up to 58% fewer tool calls.",
  },
  {
    icon: GitBranch,
    title: "Isolated git worktrees per agent",
    body: "Every agent session runs on its own git worktree — a separate working directory linked to your repo. Agents share repository understanding but never touch each other's files. No merge conflicts mid-run, no coordination overhead.",
  },
  {
    icon: Layers,
    title: "Parallel execution, locally",
    body: "Run Claude Code, Aider, OpenCode, Gemini CLI, or any terminal-based agent in parallel. All agents report live status from a single interface. Everything runs on your machine — your code never leaves it.",
  },
];

const comparisonRows: {
  label: string;
  tempest: string;
  conductor: string;
}[] = [
  {
    label: "Repository indexing",
    tempest: "Local knowledge graph — indexed once, shared across all agents",
    conductor: "See documentation",
  },
  {
    label: "Context reuse across agents",
    tempest: "Agents draw from a shared index — no redundant file reads",
    conductor: "Implementation differs",
  },
  {
    label: "Token efficiency",
    tempest: "Up to 64% fewer tokens per agent session",
    conductor: "See documentation",
  },
  {
    label: "Agent isolation",
    tempest: "Each agent runs in its own git worktree",
    conductor: "Implementation differs",
  },
  {
    label: "Multi-agent development",
    tempest: "Parallel sessions with shared knowledge, isolated execution",
    conductor: "Supported — implementation differs",
  },
  {
    label: "Runs locally",
    tempest: "Fully local — no cloud dependency",
    conductor: "See documentation",
  },
  {
    label: "Open source",
    tempest: "Yes — Apache 2.0",
    conductor: "See documentation",
  },
];

export default function TempestVsConductorPage() {
  return (
    <main>
      {/* Hero */}
      <Container>
        <section className="flex flex-col pt-10 pb-8 min-[1000px]:pb-16">
          <p className="text-sm text-muted-foreground font-semibold mb-4">
            CONDUCTOR VS TEMPEST
          </p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">
              The token-efficient Conductor alternative for multi-agent development.
            </span>
            <br />
            <span className="text-muted-foreground">
              One shared knowledge graph. Every agent isolated.
            </span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Running multiple AI agents becomes expensive when every agent
            independently rebuilds its understanding of your codebase. Tempest
            indexes your repository once and shares that understanding across
            every agent — reducing token usage by up to 64% and tool calls by
            up to 58%, while keeping each agent's execution fully isolated on
            its own git branch.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/download"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download free
            </Link>
            <a
              href="https://github.com/tempestai-dev/tempest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </section>
      </Container>

      {/* Architecture difference */}
      <Container className="mt-4 pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">
              THE ARCHITECTURAL DIFFERENCE
            </p>
            <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
              <span className="text-foreground">
                Context is the cost. Tempest pays it once.
              </span>
              <br className="hidden min-[700px]:block" />
              {" "}
              <span className="text-muted-foreground">
                Every agent in parallel. Zero redundant reads.
              </span>
            </h2>
          </div>
          <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
            <p className="text-base text-muted-foreground leading-relaxed">
              Both Tempest and Conductor are AI development environments built
              for multi-agent coding. Where they differ is in how repository
              understanding is built and shared — and that difference compounds
              with every agent and every token.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-4 mt-8">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded bg-foreground/[0.06] p-6 flex flex-col gap-6"
            >
              <div className="w-9 h-9 rounded-md bg-foreground/[0.08] border border-foreground/[0.1] flex items-center justify-center">
                <Icon size={16} className="text-foreground" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="text-sm text-foreground leading-snug">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>

      {/* Comparison table */}
      <Container className="pb-20">
        <p className="text-sm text-muted-foreground font-semibold mb-4">
          CONDUCTOR BUILD ALTERNATIVE — FEATURE COMPARISON
        </p>
        <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug mb-2">
          Side by side
        </h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-xl">
          Where we cannot confidently compare, we say so. The goal is clarity,
          not competitive scoring.
        </p>

        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-4 text-muted-foreground font-medium w-1/3">
                  Feature
                </th>
                <th className="text-left px-5 py-4 font-medium w-1/3">
                  Tempest
                </th>
                <th className="text-left px-5 py-4 text-muted-foreground font-medium w-1/3">
                  Conductor
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i < comparisonRows.length - 1
                      ? "border-b border-foreground/[0.08]"
                      : ""
                  }
                >
                  <td className="px-5 py-4 text-muted-foreground align-top">
                    {row.label}
                  </td>
                  <td className="px-5 py-4 align-top text-foreground leading-snug">
                    {row.tempest}
                  </td>
                  <td className="px-5 py-4 align-top text-muted-foreground leading-snug">
                    {row.conductor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      {/* CTA */}
      <Container className="pb-24">
        <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] flex flex-col items-center text-center px-8 py-16 gap-6">
          <p className="text-sm text-muted-foreground font-semibold">
            CONDUCTOR ALTERNATIVE — FREE AND OPEN SOURCE
          </p>
          <h2 className="text-3xl min-[1000px]:text-4xl font-normal text-foreground leading-snug max-w-xl">
            Index your repository once.{" "}
            <span className="text-muted-foreground">
              Run every agent for less.
            </span>
          </h2>
          <Link
            href="/download"
            className="bg-foreground text-background rounded-full px-5 h-[41px] flex items-center text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Download Tempest free
          </Link>
          <p className="text-xs text-muted-foreground">
            Runs entirely on your machine — your code never leaves it.
            Free and open source under Apache 2.0.
          </p>
        </div>
      </Container>
    </main>
  );
}
