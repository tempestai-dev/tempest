import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export const metadata: Metadata = {
  title: "Token Intelligence — Cut AI Agent Token Costs by Up to 86%",
  description:
    "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 86% fewer tokens, 92% fewer tool calls.",
  alternates: { canonical: `${SITE_URL}/token-intelligence` },
  openGraph: {
    title: "Token Intelligence — Cut AI Agent Token Costs by Up to 86%",
    description:
      "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 86% fewer tokens, 92% fewer tool calls.",
    type: "website",
    url: `${SITE_URL}/token-intelligence`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Token Intelligence — Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Intelligence — Cut AI Agent Token Costs by Up to 86%",
    description:
      "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 86% fewer tokens, 92% fewer tool calls.",
    images: ["/og-image.webp"],
  },
};

const stats = [
  { number: "86%", label: "fewer context tokens across parallel sessions" },
  { number: "92%", label: "fewer tool calls per agent session on indexed codebases" },
];

const sections: { eyebrow: string; title?: React.ReactNode; titleMuted?: React.ReactNode; body: React.ReactNode }[] = [
  {
    eyebrow: "The redundancy problem",
    title: "Five agents reading five copies of the same file.",
    body: (
      <>
        <p>
          Every AI coding agent reads files to understand the codebase it&apos;s working in. It
          reads the files directly relevant to its task, plus the supporting context — imports, type
          definitions, shared utilities, configuration. Each read costs tokens.
        </p>
        <p className="mt-4 text-white/60">
          In five parallel sessions working on the same repository, this happens five times in
          parallel. Three agents all need to understand the same core module? That module gets
          sent to three separate model contexts, billed three times. The redundancy compounds as
          you add more sessions.
        </p>
      </>
    ),
  },
  {
    eyebrow: "How it works",
    title: "One local knowledge graph.",
    titleMuted: "Every agent, one query.",
    body: (
      <>
        <p>
          Token Intelligence is powered by Atlas — a local, offline semantic index of your project.
          Atlas builds a graph of every symbol in your codebase: functions, types, classes, and the
          relationships between them — who calls what, what imports what, what depends on what.
        </p>
        <p className="mt-4 text-white/60">
          When Token Intelligence is enabled, Tempest injects an Atlas MCP server into every agent
          session. Agents query the graph directly for symbol definitions, call chains, and
          cross-file relationships. A query that would otherwise require reading an entire file
          returns in milliseconds, using a fraction of the tokens.
        </p>
        <p className="mt-4 text-white/60">
          The index is built once and kept current by a file watcher. When a file changes, only
          that file is re-indexed — the rest of the graph is untouched. The entire process runs
          locally on your machine. Your code never leaves.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Local-only",
    title: "Built from your files.",
    titleMuted: "Never leaves your machine.",
    body: (
      <p>
        The knowledge graph is built from your files, stored on your machine, and never transmitted
        to any server. This is not only a privacy guarantee — it means the index is always current.
        There is no propagation delay, no cache invalidation lag from a remote service, no stale
        data. The graph reflects your codebase as it is right now.
      </p>
    ),
  },
  {
    eyebrow: "Economics",
    title: "Parallel becomes affordable.",
    body: (
      <>
        <p>
          Without Token Intelligence, running five agents costs roughly five times what running one
          agent costs in tokens — because each agent does the same foundational reading
          independently. With Token Intelligence, that foundational reading happens once and the
          cost is shared. The more sessions you run, and the more they work in the same codebase,
          the larger the savings.
        </p>
        <p className="mt-4 text-white/60">
          This makes parallel agents economically viable for a much wider range of work. When the
          token cost ceiling is high, you ration parallelism. When the ceiling is lower, you use it
          freely. Token Intelligence moves the ceiling.
        </p>
      </>
    ),
  },
];

const supportedTools = [
  "Claude Code (.mcp.json)",
  "Cline (.mcp.json)",
  "Cursor (.cursor/mcp.json)",
  "Gemini CLI (.gemini/settings.json)",
  "Kiro / AWS Q (.kiro/settings/mcp.json)",
  "opencode (opencode.jsonc)",
  "Roo / Zed / Windsurf (.mcp.json)",
];

export default function TokenIntelligencePage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Token Intelligence — Cut AI Agent Token Costs by Up to 86%",
            description:
              "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 86% fewer tokens, 92% fewer tool calls.",
            url: `${SITE_URL}/token-intelligence`,
            author: { "@type": "Organization", name: "Tempest", url: SITE_URL },
            publisher: {
              "@type": "Organization",
              name: "Tempest",
              url: SITE_URL,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.webp`, width: 1280, height: 640 },
            },
            image: { "@type": "ImageObject", url: `${SITE_URL}/og-image.webp`, width: 1280, height: 640 },
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
              { "@type": "ListItem", position: 2, name: "Token Intelligence", item: `${SITE_URL}/token-intelligence` },
            ],
          }),
        }}
      />

      <PageHero
        eyebrow="Token Intelligence"
        headline="Index your codebase once."
        headlineMuted="Every parallel agent benefits."
        subhead="When five agents read the same files independently, you pay five times. Tempest builds a local semantic graph of your codebase and shares it across every parallel session — so the work happens once."
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
                How parallel agents work
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        }
      />

      <SectionShell eyebrow="The savings">
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {stats.map(({ number, label }) => (
            <div key={number} className="flex flex-col gap-3 p-8 sm:p-10">
              <p className="font-pixel text-[56px] leading-none tracking-[-0.02em] text-white sm:text-[72px]">
                {number}
              </p>
              <p className="text-[14px] font-light leading-[1.6] text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {sections.map(({ eyebrow, title, titleMuted, body }) => (
        <SectionShell key={eyebrow} eyebrow={eyebrow} title={title} titleMuted={titleMuted}>
          <div className="px-6 py-10 text-[15px] font-light leading-[1.7] text-white/80 sm:px-10 sm:py-12 lg:px-14">
            {body}
          </div>
        </SectionShell>
      ))}

      <SectionShell
        eyebrow="Setup"
        title="One toggle."
        titleMuted="No configuration."
        aside={
          <p>
            Enable Token Intelligence in <strong className="text-white">Settings → Token
            Intelligence</strong>. Tempest writes the MCP configuration for every supported tool.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-2 px-6 py-10 sm:grid-cols-2 sm:px-10 sm:py-12 lg:px-14">
          {supportedTools.map((tool) => (
            <div
              key={tool}
              className="flex items-center gap-2 border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 font-mono text-[12px] text-white/70"
            >
              <span className="size-1 rounded-full bg-white/40" />
              {tool}
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell eyebrow="Further reading">
        <div className="flex flex-col gap-3 px-6 py-8 sm:px-10 sm:py-10 lg:px-14">
          <Link
            href="/blog/token-intelligence-eliminating-redundant-reads"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            Token Intelligence: Eliminating Redundant File Reads Across Agent Sessions
          </Link>
          <Link
            href="/blog/why-parallel-agents-change-everything"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            Why Parallel Agents Change Everything
          </Link>
        </div>
      </SectionShell>
    </main>
  );
}
