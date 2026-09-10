import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { CompareVs, type CompareRow, type CompareFeature } from "@/components/landing/compare-vs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
  description:
    "Tempest indexes your repository once and shares it across every agent. Result: up to 86% fewer tokens, 92% fewer tool calls, full git worktree isolation.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-conductor` },
  openGraph: {
    title: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
    description:
      "Tempest indexes your repository once and shares it across every agent. Result: up to 86% fewer tokens, 92% fewer tool calls, full git worktree isolation.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-conductor`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest vs Conductor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
    description:
      "Tempest indexes your repository once and shares it across every agent. Result: up to 86% fewer tokens, 92% fewer tool calls, full git worktree isolation.",
    images: ["/og-image.webp"],
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

const rows: CompareRow[] = [
  { label: "Shared repository context",  tempest: "Yes — indexed once",    other: "Per-agent",              tempestYes: true, otherYes: false },
  { label: "Token efficiency",           tempest: "Up to 86% fewer",       other: "See documentation",      tempestYes: true, otherYes: null  },
  { label: "Fewer tool calls",           tempest: "Up to 92% fewer",       other: "See documentation",      tempestYes: true, otherYes: null  },
  { label: "Knowledge graph",            tempest: "Local, per project",     other: "See documentation",      tempestYes: true, otherYes: null  },
  { label: "Git worktree isolation",     tempest: "Per agent session",      other: "Implementation differs", tempestYes: true, otherYes: null  },
  { label: "Parallel agents",            tempest: "Unlimited",              other: "Supported",              tempestYes: true, otherYes: true  },
  { label: "Local-first",                tempest: "Fully local",            other: "See documentation",      tempestYes: true, otherYes: null  },
  { label: "Open source",                tempest: "Apache 2.0",             other: "See documentation",      tempestYes: true, otherYes: null  },
];

const features: CompareFeature[] = [
  {
    title: "Index once, share everywhere",
    body: "Tempest builds a local knowledge graph of your repository on first run. Every agent session draws from that graph instead of rediscovering files independently. That single shared index is why token usage drops by up to 86% and tool calls drop by up to 92% — the work is done once, not once per agent.",
  },
  {
    title: "Isolated execution, shared understanding",
    body: "Repository understanding is shared. Execution is not. Each agent session runs on its own git worktree — a separate working directory linked to your repo. Agents never write to the same branch, so there are no merge conflicts and no coordination overhead between running sessions.",
  },
  {
    title: "Any agent, in parallel",
    body: "Claude Code, Aider, OpenCode, Gemini CLI, Cline — run them all at once. Each gets the same repository context from the shared index, each executes on its own isolated branch. Everything runs locally; your code never leaves your machine.",
  },
];

export default function TempestVsConductorPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Tempest vs Conductor — Token-Efficient Multi-Agent Development",
            description:
              "Tempest indexes your repository once and shares it across every agent. Result: up to 86% fewer tokens, 92% fewer tool calls, full git worktree isolation.",
            url: `${SITE_URL}/tempest-vs-conductor`,
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
              { "@type": "ListItem", position: 2, name: "Tempest vs Conductor", item: `${SITE_URL}/tempest-vs-conductor` },
            ],
          }),
        }}
      />

      <CompareVs
        eyebrow="Conductor alternative"
        headline="The token-efficient alternative to Conductor."
        headlineMuted="One index. Every agent benefits."
        subhead="Tempest indexes your repository once and shares that understanding across every running AI agent. The result is up to 86% fewer tokens consumed and up to 92% fewer tool calls — without changing how you work."
        competitorName="Conductor"
        rows={rows}
        sourcedFrom="Where Conductor's implementation is unverified, we say so. Rows marked — reflect documentation gaps, not confirmed weaknesses."
        whenTheirsTitle="A specific orchestration model that fits your team."
        whenTheirsBody="Pick Conductor if its specific orchestration model fits your team's workflow and token cost is not a primary constraint. If you are already invested in its toolchain, Conductor may serve you well."
        whenTempestTitle="Your API bill is the constraint."
        whenTempestBody="Token Intelligence indexes your repository once and shares that index across every parallel agent session — up to 86% fewer tokens, up to 92% fewer tool calls. The savings compound as you add more sessions. Tempest is free, Apache 2.0, and runs entirely on your machine — your code never leaves it."
        featureSectionEyebrow="Why the numbers hold"
        featureSectionTitle="Context is the cost."
        featureSectionTitleMuted="Tempest pays it once. Every agent benefits."
        featureSectionAside="The efficiency gap between Tempest and other multi-agent AI IDEs comes from a single architectural decision: where repository understanding lives, and who builds it."
        features={features}
        furtherReading={[
          { href: "/blog/why-parallel-agents-change-everything", label: "Why Parallel Agents Change Everything" },
        ]}
        ctaHeadline="Index your repository once."
        ctaHeadlineMuted="Run every agent for less."
      />
    </main>
  );
}
