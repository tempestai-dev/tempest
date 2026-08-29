import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Token Intelligence — Cut AI Agent Token Costs by Up to 64%",
  description:
    "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 64% fewer tokens, 58% fewer tool calls.",
  alternates: { canonical: `${SITE_URL}/token-intelligence` },
  openGraph: {
    title: "Token Intelligence — Cut AI Agent Token Costs by Up to 64%",
    description:
      "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 64% fewer tokens, 58% fewer tool calls.",
    type: "website",
    url: `${SITE_URL}/token-intelligence`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Token Intelligence — Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Intelligence — Cut AI Agent Token Costs by Up to 64%",
    description:
      "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 64% fewer tokens, 58% fewer tool calls.",
    images: ["/og-image.png"],
  },
}

export default function TokenIntelligencePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Token Intelligence — Cut AI Agent Token Costs by Up to 64%",
            description:
              "Tempest builds a local code-knowledge graph shared across all parallel agent sessions. Agents query the graph instead of re-reading files — up to 64% fewer tokens, 58% fewer tool calls.",
            url: `${SITE_URL}/token-intelligence`,
            author: { "@type": "Organization", name: "Tempest", url: SITE_URL },
            publisher: {
              "@type": "Organization",
              name: "Tempest",
              url: SITE_URL,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.png`, width: 1280, height: 640 },
            },
            image: { "@type": "ImageObject", url: `${SITE_URL}/og-image.png`, width: 1280, height: 640 },
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

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">TOKEN INTELLIGENCE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">Index your codebase once.</span>{" "}
            <span className="text-muted-foreground">Every agent session benefits.</span>
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-12 max-w-xl">
            When five agents read the same files independently, you pay five times. Token Intelligence builds a local semantic graph of your codebase and shares it across every parallel session — so the work happens once.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-14">
            <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-5">
              <p className="text-3xl font-light text-foreground">64%</p>
              <p className="text-sm text-muted-foreground mt-1.5">reduction in context token consumption across parallel sessions</p>
            </div>
            <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-5">
              <p className="text-3xl font-light text-foreground">58%</p>
              <p className="text-sm text-muted-foreground mt-1.5">fewer tool calls per agent session on indexed codebases</p>
            </div>
          </div>

          <div className="flex flex-col gap-14">

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">The redundancy problem</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Every AI coding agent reads files to understand the codebase it's working in. It reads the files directly relevant to its task, plus the supporting context — imports, type definitions, shared utilities, configuration. Each read costs tokens.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                In five parallel sessions working on the same repository, this happens five times in parallel. Three agents all need to understand the same core module? That module gets sent to three separate model contexts, billed three times. The redundancy compounds as you add more sessions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">How Token Intelligence works</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Token Intelligence is powered by Atlas — a local, offline semantic index of your project. Atlas builds a graph of every symbol in your codebase: functions, types, classes, and the relationships between them — who calls what, what imports what, what depends on what.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                When Token Intelligence is enabled, Tempest injects an Atlas MCP server into every agent session. Agents query the graph directly for symbol definitions, call chains, and cross-file relationships. A query that would otherwise require reading an entire file returns in milliseconds, using a fraction of the tokens.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                The index is built once and kept current by a file watcher. When a file changes, only that file is re-indexed — the rest of the graph is untouched. The entire process runs locally on your machine. Your code never leaves.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Setup: one toggle, no configuration</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Enable Token Intelligence in <strong className="text-foreground">Settings → Token Intelligence</strong>. On first open of a project, Tempest asks whether to index it. Indexing runs in the background; a progress toast in the corner tracks it.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                Once indexed, every agent session in that project gets the Atlas MCP server injected automatically. Tempest writes the MCP configuration file for each tool it supports:
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  "Claude Code (.mcp.json)",
                  "Cline (.mcp.json)",
                  "Cursor (.cursor/mcp.json)",
                  "Gemini CLI (.gemini/settings.json)",
                  "Kiro / AWS Q (.kiro/settings/mcp.json)",
                  "opencode (opencode.jsonc)",
                  "Roo / Zed / Windsurf (.mcp.json)",
                ].map((tool) => (
                  <div key={tool} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30 shrink-0" />
                    {tool}
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                All generated config files are gitignored automatically. The index lives at <code className="text-foreground font-mono text-xs bg-foreground/[0.06] px-1.5 py-0.5 rounded">{`<project>/.tempest/atlas/`}</code>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Why local-only matters</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                The knowledge graph is built from your files, stored on your machine, and never transmitted to any server. This is not only a privacy guarantee — it means the index is always current. There is no propagation delay, no cache invalidation lag from a remote service, no stale data. The graph reflects your codebase as it is right now.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">The economics of parallel agents with Token Intelligence</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Without Token Intelligence, running five agents costs roughly five times what running one agent costs in tokens — because each agent does the same foundational reading independently. With Token Intelligence, that foundational reading happens once and the cost is shared. The more sessions you run, and the more they work in the same codebase, the larger the savings.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                This makes parallel agents economically viable for a much wider range of work. When the token cost ceiling is high, you ration parallelism. When the ceiling is lower, you use it freely. Token Intelligence moves the ceiling.
              </p>
            </section>

          </div>

          <div className="mt-16 flex flex-wrap gap-3">
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
              How parallel agents work
            </Link>
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/[0.08]">
            <p className="text-sm text-muted-foreground font-semibold mb-4">FURTHER READING</p>
            <div className="flex flex-col gap-3">
              <Link href="/blog/token-intelligence-eliminating-redundant-reads" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                Token Intelligence: Eliminating Redundant File Reads Across Agent Sessions
              </Link>
              <Link href="/blog/why-parallel-agents-change-everything" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                Why Parallel Agents Change Everything
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  )
}
