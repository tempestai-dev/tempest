import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { CompareVs, type CompareRow, type CompareFeature } from "@/components/landing/compare-vs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
  description:
    "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 86%.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-superset` },
  openGraph: {
    title: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
    description:
      "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 86%.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-superset`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest vs Superset" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
    description:
      "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 86%.",
    images: ["/og-image.webp"],
  },
  keywords: [
    "superset alternative",
    "superset.sh alternative",
    "superset vs tempest",
    "multi-agent coding",
    "parallel AI agents",
    "token-efficient AI development",
  ],
};

const rows: CompareRow[] = [
  { label: "Shared knowledge graph",  tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",       tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",        tempest: "Up to 86% fewer",                               other: "I did not find equivalent claims",               tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",        tempest: "Up to 92% fewer",                               other: "I did not find equivalent claims",               tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",  tempest: "Per agent session",                             other: "Yes — isolated per workspace",                   tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",         tempest: "Unlimited",                                     other: "Yes — 10+ parallel agents",                      tempestYes: true,  otherYes: true  },
  { label: "Windows binaries",        tempest: "Yes",                                           other: "No — macOS only (Windows/Linux coming soon)",    tempestYes: true,  otherYes: false },
  { label: "Remote workspaces",       tempest: "No",                                            other: "Yes — Pro tier, beta",                           tempestYes: false, otherYes: true  },
  { label: "Recurring automations",   tempest: "No",                                            other: "Yes — schedule recurring agent runs",            tempestYes: false, otherYes: true  },
  { label: "MCP server",              tempest: "No",                                            other: "Yes — 27 tools included",                        tempestYes: false, otherYes: true  },
  { label: "License",                 tempest: "Apache 2.0",                                    other: "Elastic License 2.0 (source-available)",         tempestYes: true,  otherYes: null  },
  { label: "Price",                   tempest: "Free",                                          other: "Free (local); Pro $15/user/month",               tempestYes: true,  otherYes: null  },
];

const features: CompareFeature[] = [
  {
    title: "One index, every agent benefits",
    body: "Tempest builds a local knowledge graph of your repository once. Every parallel agent draws from that shared index instead of re-reading files independently. That is where the token reduction comes from — the work is done once, not once per agent.",
  },
  {
    title: "Windows support today",
    body: "Superset ships macOS binaries, with Windows and Linux marked as coming soon. Tempest has native Windows binaries available now. If your team develops on Windows, that is a hard blocker for Superset.",
  },
  {
    title: "Apache 2.0, not source-available",
    body: "Superset is licensed under Elastic License 2.0 — source-available with restrictions on competing services. Tempest is Apache 2.0: use it, fork it, ship a modified version commercially. No restrictions.",
  },
];

export default function TempestVsSupersetPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
            description:
              "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 86%.",
            url: `${SITE_URL}/tempest-vs-superset`,
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
              { "@type": "ListItem", position: 2, name: "Tempest vs Superset", item: `${SITE_URL}/tempest-vs-superset` },
            ],
          }),
        }}
      />

      <CompareVs
        eyebrow="Token Intelligence · Superset alternative"
        headline="Every agent reads your repo from scratch."
        headlineMuted="Token Intelligence means they don't have to."
        subhead="Token Intelligence is Tempest's core feature: a local knowledge graph built once and shared across every parallel agent session — up to 86% fewer tokens, up to 92% fewer tool calls. Superset ships remote workspaces, automations, and 27 MCP tools that Tempest doesn't — but none of those reduce what you pay per agent run. Tempest also runs on Windows today."
        competitorName="Superset"
        rows={rows}
        sourcedFrom="Superset details based on public docs at superset.sh, reviewed 2026-07-25. If anything is wrong or outdated, open an issue on our GitHub and we will fix it."
        whenTheirsTitle="macOS, remote workspaces, and 27 MCP tools."
        whenTheirsBody="Pick Superset if you are on macOS and want the fuller platform: remote workspaces (Pro tier, beta), recurring automations, 27 MCP tools, and a diff review dashboard. It is a more ambitious product than Tempest today, and that shows in the feature list."
        whenTempestTitle="API bill is the constraint. Windows is the platform."
        whenTempestBody="Every agent you run normally pays the full cost of reading your repository — file by file, tool call by tool call. Token Intelligence builds a local knowledge graph once and every parallel agent draws from it instead. Up to 86% fewer tokens, up to 92% fewer tool calls. Windows binaries today, Apache 2.0 — not ELv2."
        featureSectionEyebrow="Why the token numbers hold"
        featureSectionTitle="Token Intelligence."
        featureSectionTitleMuted="Index once. Every agent pays less."
        featureSectionAside="Most multi-agent tools let each agent discover the repository independently. Tempest indexes it once and shares that index. The difference is where the context work happens — and who pays for it."
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
