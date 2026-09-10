import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { CompareVs, type CompareRow, type CompareFeature } from "@/components/landing/compare-vs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
  description:
    "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 86%.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-agentsroom` },
  openGraph: {
    title: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
    description:
      "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 86%.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-agentsroom`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest vs AgentsRoom" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
    description:
      "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 86%.",
    images: ["/og-image.webp"],
  },
  keywords: [
    "agentsroom alternative",
    "agentsroom.dev alternative",
    "agentsroom vs tempest",
    "free multi-agent IDE",
    "open source AI development",
    "parallel AI agents free",
  ],
};

const rows: CompareRow[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",          tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 86% fewer",                               other: "I did not find equivalent claims",                  tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 92% fewer",                               other: "I did not find equivalent claims",                  tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "—",                                                 tempestYes: true,  otherYes: null  },
  { label: "Parallel agents",           tempest: "Unlimited",                                     other: "Yes — multi-project cockpit view",                  tempestYes: true,  otherYes: true  },
  { label: "Specialist agent roles",    tempest: "—",                                             other: "Yes — 14 specialist roles",                         tempestYes: null,  otherYes: true  },
  { label: "Windows support",           tempest: "Yes",                                           other: "Yes",                                               tempestYes: true,  otherYes: true  },
  { label: "macOS support",             tempest: "Yes",                                           other: "Yes",                                               tempestYes: true,  otherYes: true  },
  { label: "Mobile companion",          tempest: "No",                                            other: "Yes — real-time sync with desktop",                 tempestYes: false, otherYes: true  },
  { label: "Voice dictation",           tempest: "No",                                            other: "Yes",                                               tempestYes: false, otherYes: true  },
  { label: "Screenshot / sketch",       tempest: "No",                                            other: "Yes",                                               tempestYes: false, otherYes: true  },
  { label: "Prompt / skills library",   tempest: "Yes — built-in + custom",                       other: "—",                                                 tempestYes: true,  otherYes: null  },
  { label: "No account required",       tempest: "Yes — fully local",                             other: "API key required per provider",                     tempestYes: true,  otherYes: null  },
  { label: "License",                   tempest: "Apache 2.0",                                    other: "I did not find a public license",                   tempestYes: true,  otherYes: null  },
  { label: "Price",                     tempest: "Free — unlimited projects",                     other: "—",                                                 tempestYes: true,  otherYes: null  },
];

const features: CompareFeature[] = [
  {
    title: "Free means all your spend goes to the API",
    body: "Tempest has no project limit and no subscription — the only cost is the model API you already have. The shared knowledge graph then cuts that API cost by up to 86%.",
  },
  {
    title: "Isolated branches, not just isolated projects",
    body: "AgentsRoom manages multiple projects in a dashboard view. Tempest isolates each agent session in its own git worktree and branch within a project — three agents writing in the same codebase never touch each other's files.",
  },
  {
    title: "Apache 2.0 vs no public license found",
    body: "We checked AgentsRoom's site and GitHub and did not find a public software license. Tempest is Apache 2.0: fork it, audit the source, ship a modified version commercially. You know exactly what you're running.",
  },
];

export default function TempestVsAgentsRoomPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
            description:
              "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 86%.",
            url: `${SITE_URL}/tempest-vs-agentsroom`,
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
              { "@type": "ListItem", position: 2, name: "Tempest vs AgentsRoom", item: `${SITE_URL}/tempest-vs-agentsroom` },
            ],
          }),
        }}
      />

      <CompareVs
        eyebrow="Token Intelligence · AgentsRoom alternative"
        headline="More parallel agents means more tokens."
        headlineMuted="Token Intelligence means it doesn't have to."
        subhead="Token Intelligence is Tempest's core feature: a local knowledge graph indexed once and shared across every parallel agent session — up to 86% fewer tokens, up to 92% fewer tool calls. AgentsRoom wins on mobile, voice, sketch annotation, and 14 specialist roles. Tempest wins on token efficiency, git isolation, Apache 2.0, and no project limits."
        competitorName="AgentsRoom"
        rows={rows}
        sourcedFrom="AgentsRoom details based on public information at agentsroom.dev, reviewed 2026-07-25. If anything is wrong or outdated, open an issue on our GitHub and we will fix it."
        whenTheirsTitle="Managing agents across projects. Mobile companion."
        whenTheirsBody="Pick AgentsRoom if you want to manage agents across multiple projects from one dashboard, need a mobile companion to check on runs from your phone, want voice dictation or sketch annotation, or value the 14 built-in specialist role presets."
        whenTempestTitle="Your API bill is the constraint."
        whenTempestBody="Without Token Intelligence, every agent reads your repository from scratch — and that cost multiplies with every parallel session you add. Token Intelligence indexes your codebase once. Every agent then queries the shared graph instead of re-reading files. That is the number that moves your monthly bill."
        featureSectionEyebrow="Token Intelligence"
        featureSectionTitle="Every agent you add shouldn't cost as much as the last."
        featureSectionTitleMuted="Token Intelligence makes sure it doesn't."
        featureSectionAside="AgentsRoom is built to oversee agents across projects from any device. Tempest is built to run agents as efficiently as possible in one codebase. If deep local work is the job, the token savings are real."
        features={features}
        furtherReading={[
          { href: "/blog/why-parallel-agents-change-everything", label: "Why Parallel Agents Change Everything" },
        ]}
        ctaHeadline="86% fewer tokens."
        ctaHeadlineMuted="Every parallel session. Free."
      />
    </main>
  );
}
