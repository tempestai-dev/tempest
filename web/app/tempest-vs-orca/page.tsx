import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { CompareVs, type CompareRow, type CompareFeature } from "@/components/landing/compare-vs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Orca — Shared Knowledge Graph + Database Branches",
  description:
    "Both open-source ADEs on Windows, macOS, Linux with mobile companions. Tempest adds a shared knowledge graph that cuts token usage by up to 86%, plus database branches and OS-level sandboxing.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-orca` },
  openGraph: {
    title: "Tempest vs Orca — Shared Knowledge Graph + Database Branches",
    description:
      "Both open-source ADEs on Windows, macOS, Linux with mobile companions. Tempest adds a shared knowledge graph that cuts token usage by up to 86%, plus database branches and OS-level sandboxing.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-orca`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest vs Orca" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Orca — Shared Knowledge Graph + Database Branches",
    description:
      "Both open-source ADEs on Windows, macOS, Linux with mobile companions. Tempest adds a shared knowledge graph that cuts token usage by up to 86%, plus database branches and OS-level sandboxing.",
    images: ["/og-image.webp"],
  },
  keywords: [
    "orca alternative",
    "onorca.dev alternative",
    "orca vs tempest",
    "agent development environment",
    "parallel AI agents",
    "token-efficient coding",
  ],
};

const rows: CompareRow[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",         tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 86% fewer",                               other: "I did not find equivalent claims",                 tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 92% fewer",                               other: "I did not find equivalent claims",                 tempestYes: true,  otherYes: null  },
  { label: "Database branches per session", tempest: "Isolated Postgres per agent",              other: "I did not find an equivalent",                     tempestYes: true,  otherYes: null  },
  { label: "OS-level sandbox",          tempest: "Hephaestus — Job Objects / sandbox-exec / bubblewrap", other: "I did not find equivalent isolation",     tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",           tempest: "Unlimited",                                     other: "Yes — 27+ agents supported",                      tempestYes: true,  otherYes: true  },
  { label: "Any CLI agent",             tempest: "Yes — Claude, Codex, Gemini, Aider, and more", other: "Yes — 27+ including Claude, Codex, Grok, Gemini",  tempestYes: true,  otherYes: true  },
  { label: "Windows support",           tempest: "Yes",                                           other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "macOS support",             tempest: "Yes",                                           other: "Yes (ARM64 and Intel)",                           tempestYes: true,  otherYes: true  },
  { label: "Linux support",             tempest: "Build from source today",                       other: "Yes",                                             tempestYes: null,  otherYes: true  },
  { label: "Mobile companion",          tempest: "Yes — iOS and Android",                         other: "Yes — iOS and Android",                           tempestYes: true,  otherYes: true  },
  { label: "Embedded browser",          tempest: "Live dev server preview",                       other: "Embedded Chromium with design mode",              tempestYes: true,  otherYes: true  },
  { label: "Remote / SSH worktrees",    tempest: "No",                                            other: "Yes",                                             tempestYes: false, otherYes: true  },
  { label: "GitHub / Linear integration", tempest: "Stage, commit, push built-in",                other: "Native integrations",                             tempestYes: null,  otherYes: true  },
  { label: "License",                   tempest: "Apache 2.0",                                    other: "MIT",                                             tempestYes: null,  otherYes: null  },
  { label: "Price",                     tempest: "Free",                                          other: "Free",                                            tempestYes: true,  otherYes: true  },
];

const features: CompareFeature[] = [
  {
    title: "The one thing Orca doesn't have",
    body: "Orca is a serious ADE — 27+ agents, remote worktrees, an embedded browser. But every agent session still reads your repository from scratch. Tempest indexes your codebase once and every session draws from that shared graph. That's where the 86% token reduction comes from, and it compounds with every parallel agent.",
  },
  {
    title: "Isolated Postgres per session",
    body: "Parallel agents that touch a database corrupt each other's state. Tempest spins up an isolated Postgres branch per session so migrations, seed data, and destructive queries stay in their own lane. Orca does not ship database branching.",
  },
  {
    title: "OS-level sandbox on every platform",
    body: "Hephaestus wraps each agent process in Job Objects on Windows, sandbox-exec on macOS, and bubblewrap on Linux. Rogue commands are contained by the OS, not by the app. Orca relies on git worktree isolation alone.",
  },
];

export default function TempestVsOrcaPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Tempest vs Orca — Shared Knowledge Graph + Database Branches",
            description:
              "Both open-source ADEs on Windows, macOS, Linux with mobile companions. Tempest adds a shared knowledge graph that cuts token usage by up to 86%, plus database branches and OS-level sandboxing.",
            url: `${SITE_URL}/tempest-vs-orca`,
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
              { "@type": "ListItem", position: 2, name: "Tempest vs Orca", item: `${SITE_URL}/tempest-vs-orca` },
            ],
          }),
        }}
      />

      <CompareVs
        eyebrow="Token Intelligence · Orca alternative"
        headline="Orca gives you 27 agents."
        headlineMuted="Each one still reads your repo from scratch."
        subhead="Orca is the closest analog to Tempest — open source, cross-platform, mobile companion, dozens of CLI agents in isolated worktrees. Tempest adds three things Orca does not: a shared code-knowledge graph that cuts token usage by up to 86% and tool calls by up to 92%, an isolated Postgres branch per session, and OS-level sandboxing via Hephaestus."
        competitorName="Orca"
        rows={rows}
        sourcedFrom="Orca details based on public information at onorca.dev, reviewed 2026-09-10. If anything is wrong or outdated, open an issue on our GitHub and we will fix it."
        whenTheirsTitle="Remote worktrees, embedded Chromium, native integrations."
        whenTheirsBody="Pick Orca if remote SSH worktrees, an embedded browser with design mode, and native GitHub / Linear integrations are the features that unblock your team. Orca ships a broader integration surface and a more mature browser story than Tempest today."
        whenTempestTitle="API bill, data safety, or both."
        whenTempestBody="Every parallel agent in Orca pays the full file-read cost independently — that scales linearly with session count. Tempest indexes your repository once, every agent draws from the shared graph, and the isolated Postgres branch per session plus OS-level sandbox mean a runaway agent cannot touch your other work. Up to 86% fewer tokens, up to 92% fewer tool calls, compounding across every session."
        featureSectionEyebrow="Token Intelligence + isolation"
        featureSectionTitle="27 agents is impressive."
        featureSectionTitleMuted="27 agents that don't step on each other is the actual product."
        featureSectionAside="A worktree keeps files apart. A shared knowledge graph keeps token cost flat. A Postgres branch keeps data apart. A sandbox keeps the OS apart. Tempest ships all four in one binary."
        features={features}
        furtherReading={[
          {
            href: "/blog/token-intelligence-eliminating-redundant-reads",
            label: "Token Intelligence: Eliminating Redundant File Reads",
          },
        ]}
        ctaHeadline="86% fewer tokens."
        ctaHeadlineMuted="Every parallel session."
      />
    </main>
  );
}
