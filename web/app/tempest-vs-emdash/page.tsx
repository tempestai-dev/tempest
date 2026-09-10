import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { CompareVs, type CompareRow, type CompareFeature } from "@/components/landing/compare-vs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
  description:
    "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 86% across parallel sessions. Emdash leads on integrations.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-emdash` },
  openGraph: {
    title: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
    description:
      "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 86% across parallel sessions. Emdash leads on integrations.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-emdash`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest vs Emdash" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
    description:
      "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 86% across parallel sessions. Emdash leads on integrations.",
    images: ["/og-image.webp"],
  },
  keywords: [
    "emdash alternative",
    "emdash.ai alternative",
    "emdash vs tempest",
    "local AI development",
    "parallel AI agents",
    "token-efficient coding",
  ],
};

const rows: CompareRow[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",         tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 86% fewer",                               other: "I did not find equivalent claims",                 tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 92% fewer",                               other: "I did not find equivalent claims",                 tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",           tempest: "Unlimited",                                     other: "Yes — 25+ agents supported",                      tempestYes: true,  otherYes: true  },
  { label: "Windows support",           tempest: "Yes",                                           other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "macOS support",             tempest: "Yes",                                           other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "Linux support",             tempest: "Build from source today",                       other: "Yes",                                             tempestYes: null,  otherYes: true  },
  { label: "SSH / remote execution",    tempest: "No",                                            other: "Yes — run agents on remote machines via SSH",     tempestYes: false, otherYes: true  },
  { label: "Built-in browser preview",  tempest: "Yes — live dev server preview",                 other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "File editor",               tempest: "No",                                            other: "Yes — with search and recovery",                  tempestYes: false, otherYes: true  },
  { label: "CI monitoring",             tempest: "No",                                            other: "Yes",                                             tempestYes: false, otherYes: true  },
  { label: "PR inspection",             tempest: "Stage, commit, push built-in",                  other: "Yes — PR inspection interface",                   tempestYes: null,  otherYes: true  },
  { label: "Issue tracker integration", tempest: "No",                                            other: "Yes — Linear, Jira, GitHub, Notion, Asana",       tempestYes: false, otherYes: true  },
  { label: "Recurring agent runs",      tempest: "No",                                            other: "Yes",                                             tempestYes: false, otherYes: true  },
  { label: "Prompt library",            tempest: "Yes — built-in + custom",                       other: "—",                                               tempestYes: true,  otherYes: null  },
  { label: "License",                   tempest: "Apache 2.0",                                    other: "Open source (specific license on GitHub)",        tempestYes: null,  otherYes: null  },
  { label: "Price",                     tempest: "Free",                                          other: "Free",                                            tempestYes: true,  otherYes: true  },
];

const features: CompareFeature[] = [
  {
    title: "The one thing Emdash doesn't have",
    body: "Emdash is genuinely feature-rich. But each agent session still reads your repository independently. Tempest builds one shared knowledge graph and every session draws from it — that's where the 86% token reduction comes from. It compounds as you add parallel agents.",
  },
  {
    title: "Both local-first, different defaults",
    body: "Emdash runs locally and adds SSH remote execution as an option. Tempest is local-only by design — no remote path means there's nothing to configure, nothing to secure, nothing to connect. For teams that stay on-machine, that's fewer moving parts.",
  },
  {
    title: "Nothing leaves your machine",
    body: "Tempest has no outbound path for your code. The knowledge graph, your sessions, and every agent interaction stay on your local disk. It's not a policy — it's the architecture.",
  },
];

export default function TempestVsEmdashPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
            description:
              "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 86% across parallel sessions. Emdash leads on integrations.",
            url: `${SITE_URL}/tempest-vs-emdash`,
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
              { "@type": "ListItem", position: 2, name: "Tempest vs Emdash", item: `${SITE_URL}/tempest-vs-emdash` },
            ],
          }),
        }}
      />

      <CompareVs
        eyebrow="Token Intelligence · Emdash alternative"
        headline="Six agents. Six full context loads."
        headlineMuted="Or one index, six efficient agents."
        subhead="Token Intelligence is Tempest's core feature: a local knowledge graph built once, shared across every parallel agent session — up to 86% fewer tokens, up to 92% fewer tool calls. Emdash has no documented equivalent. Both tools are free, open-source, and local-first — Emdash pulls ahead on SSH remote execution, CI monitoring, file editing, issue tracker integration, and scheduling."
        competitorName="Emdash"
        rows={rows}
        sourcedFrom="Emdash details based on public docs at emdash.ai, reviewed 2026-07-25. If anything is wrong or outdated, open an issue on our GitHub and we will fix it."
        whenTheirsTitle="Full IDE surface: editor, CI, PRs, integrations."
        whenTheirsBody="Pick Emdash if you want the fuller development environment: a file editor, CI monitoring, PR inspection, issue tracker integrations with Linear and Jira, SSH remote execution on a dev box, and scheduled recurring agent runs. It ships more surface area than Tempest in almost every direction."
        whenTempestTitle="Your API bill is the constraint."
        whenTempestBody="Without Token Intelligence, every agent you run in parallel pays the full file-read cost independently — that cost scales linearly with session count. Token Intelligence indexes your repository once. Every agent draws from that shared graph instead. Up to 86% fewer tokens, up to 92% fewer tool calls."
        featureSectionEyebrow="Token Intelligence"
        featureSectionTitle="More agents shouldn't mean more tokens per agent."
        featureSectionTitleMuted="A shared index breaks that relationship."
        featureSectionAside="Supporting 25+ agents is impressive. But if each agent reads your codebase from scratch, the token cost scales with session count. A shared index breaks that relationship."
        features={features}
        furtherReading={[
          { href: "/blog/token-intelligence-eliminating-redundant-reads", label: "Token Intelligence: Eliminating Redundant File Reads" },
        ]}
        ctaHeadline="86% fewer tokens."
        ctaHeadlineMuted="Every parallel session."
      />
    </main>
  );
}
