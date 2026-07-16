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

type Row = {
  label: string;
  tempest: string;
  conductor: string;
  tempestYes: boolean;
  conductorYes: boolean | null; // null = unknown
};

const rows: Row[] = [
  { label: "Shared repository context",  tempest: "Yes — indexed once",    conductor: "Per-agent",          tempestYes: true,  conductorYes: false },
  { label: "Token efficiency",           tempest: "Up to 64% fewer",       conductor: "See documentation",  tempestYes: true,  conductorYes: null  },
  { label: "Fewer tool calls",           tempest: "Up to 58% fewer",       conductor: "See documentation",  tempestYes: true,  conductorYes: null  },
  { label: "Knowledge graph",            tempest: "Local, per project",     conductor: "See documentation",  tempestYes: true,  conductorYes: null  },
  { label: "Git worktree isolation",     tempest: "Per agent session",      conductor: "Implementation differs", tempestYes: true, conductorYes: null },
  { label: "Parallel agents",           tempest: "Unlimited",              conductor: "Supported",          tempestYes: true,  conductorYes: true  },
  { label: "Local-first",               tempest: "Fully local",            conductor: "See documentation",  tempestYes: true,  conductorYes: null  },
  { label: "Open source",               tempest: "Apache 2.0",             conductor: "See documentation",  tempestYes: true,  conductorYes: null  },
];

const features = [
  {
    icon: Coins,
    title: "Index once, share everywhere",
    body: "Tempest builds a local knowledge graph of your repository on first run. Every agent session draws from that graph instead of rediscovering files independently. That single shared index is why token usage drops by up to 64% and tool calls drop by up to 58% — the work is done once, not once per agent.",
  },
  {
    icon: GitBranch,
    title: "Isolated execution, shared understanding",
    body: "Repository understanding is shared. Execution is not. Each agent session runs on its own git worktree — a separate working directory linked to your repo. Agents never write to the same branch, so there are no merge conflicts and no coordination overhead between running sessions.",
  },
  {
    icon: Layers,
    title: "Any agent, in parallel",
    body: "Claude Code, Aider, OpenCode, Gemini CLI, Cline — run them all at once. Each gets the same repository context from the shared index, each executes on its own isolated branch. Everything runs locally; your code never leaves your machine.",
  },
];

function Checkmark() {
  return (
    <span className="text-foreground font-medium text-sm">✓</span>
  );
}

function Cross() {
  return (
    <span className="text-muted-foreground text-sm">✕</span>
  );
}

function Unknown() {
  return (
    <span className="text-muted-foreground text-sm">—</span>
  );
}

export default function TempestVsConductorPage() {
  return (
    <main>
      {/* Hero */}
      <Container>
        <section className="flex flex-col pt-10 pb-10 min-[1000px]:pb-12">
          <p className="text-sm text-muted-foreground font-semibold mb-4">
            CONDUCTOR ALTERNATIVE
          </p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">
              The token-efficient alternative to Conductor.
            </span>
            <br />
            <span className="text-muted-foreground">
              One index. Every agent benefits.
            </span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Tempest indexes your repository once and shares that understanding
            across every running AI agent. The result is up to 64% fewer tokens
            consumed and up to 58% fewer tool calls — without changing how you
            work.
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

      {/* Comparison table */}
      <Container className="pb-20">
        <p className="text-sm text-muted-foreground font-semibold mb-4">
          TEMPEST VS CONDUCTOR BUILD
        </p>

        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">
                  Feature
                </th>
                <th className="text-left px-5 py-3.5 font-medium">
                  Tempest
                </th>
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">
                  Conductor
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.label}
                  className={i < rows.length - 1 ? "border-b border-foreground/[0.08]" : ""}
                >
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {row.label}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <Checkmark />
                      <span className="text-foreground">{row.tempest}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      {row.conductorYes === true ? (
                        <Checkmark />
                      ) : row.conductorYes === false ? (
                        <Cross />
                      ) : (
                        <Unknown />
                      )}
                      <span className="text-muted-foreground">{row.conductor}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Where Conductor&apos;s implementation is unverified, we say so.
          Rows marked — reflect documentation gaps, not confirmed weaknesses.
        </p>
      </Container>

      {/* Architecture explanation */}
      <Container className="pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8 mb-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">
              WHY THE NUMBERS HOLD
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
              The efficiency gap between Tempest and other multi-agent AI IDEs
              comes from a single architectural decision: where repository
              understanding lives, and who builds it.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-4">
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
