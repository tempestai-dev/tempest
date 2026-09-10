import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { CompareVs, type CompareRow, type CompareFeature } from "@/components/landing/compare-vs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
  description:
    "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 86%.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-paseo` },
  openGraph: {
    title: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
    description:
      "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 86%.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-paseo`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest vs Paseo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
    description:
      "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 86%.",
    images: ["/og-image.webp"],
  },
  keywords: [
    "paseo alternative",
    "paseo.sh alternative",
    "paseo vs tempest",
    "multi-agent development",
    "local AI agents Windows",
    "token-efficient AI development",
  ],
};

const rows: CompareRow[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",           tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 86% fewer",                               other: "I did not find equivalent claims",                   tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 92% fewer",                               other: "I did not find equivalent claims",                   tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "Yes",                                                tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",           tempest: "Unlimited",                                     other: "Yes — 34+ agents supported",                         tempestYes: true,  otherYes: true  },
  { label: "Windows support",           tempest: "Yes",                                           other: "I did not find a Windows desktop app",               tempestYes: true,  otherYes: null  },
  { label: "macOS support",             tempest: "Yes",                                           other: "Yes",                                                tempestYes: true,  otherYes: true  },
  { label: "Linux support",             tempest: "Build from source today",                       other: "Yes",                                                tempestYes: null,  otherYes: true  },
  { label: "Mobile (iOS / Android)",    tempest: "No",                                            other: "Yes — iOS App Store and Google Play",                tempestYes: false, otherYes: true  },
  { label: "Web client",                tempest: "No",                                            other: "Yes",                                                tempestYes: false, otherYes: true  },
  { label: "CLI client",                tempest: "No",                                            other: "Yes",                                                tempestYes: false, otherYes: true  },
  { label: "Remote access / relay",     tempest: "No",                                            other: "Yes — E2E encrypted relay, Tailscale, Cloudflare",   tempestYes: false, otherYes: true  },
  { label: "Cron / scheduled runs",     tempest: "No",                                            other: "Yes — via CLI",                                      tempestYes: false, otherYes: true  },
  { label: "Local-first voice",         tempest: "No",                                            other: "Yes — runs entirely on-device",                      tempestYes: false, otherYes: true  },
  { label: "Background daemon",         tempest: "No — desktop app only",                         other: "Optional — can also run headless via CLI",           tempestYes: true,  otherYes: null  },
  { label: "No account required",       tempest: "Yes — fully local",                             other: "Provider credentials only",                          tempestYes: true,  otherYes: true  },
  { label: "License",                   tempest: "Apache 2.0",                                    other: "Open source (specific license on GitHub)",           tempestYes: null,  otherYes: null  },
  { label: "Price",                     tempest: "Free",                                          other: "Free",                                               tempestYes: true,  otherYes: true  },
];

const features: CompareFeature[] = [
  {
    title: "The token gap is the real differentiator",
    body: "Paseo is genuinely impressive — remote access, mobile, voice, scheduling, 34+ agents. But each agent session still reads your repository from scratch. Tempest's shared knowledge graph means that cost is paid once, not once per session. It compounds with every agent you add.",
  },
  {
    title: "Windows binaries, no daemon",
    body: "Paseo's desktop app targets macOS. Tempest ships native Windows binaries now. And unlike Paseo's daemon-based architecture (optional but needed for multi-client access), Tempest is just a desktop app — open it, close it, nothing running in the background.",
  },
  {
    title: "Both free. One structural advantage.",
    body: "Both tools are free and open source. The architectural difference is the shared knowledge graph — it is not a feature you can toggle on in Paseo. If token cost is your constraint, that is the one gap between them.",
  },
];

export default function TempestVsPaseoPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
            description:
              "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 86%.",
            url: `${SITE_URL}/tempest-vs-paseo`,
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
              { "@type": "ListItem", position: 2, name: "Tempest vs Paseo", item: `${SITE_URL}/tempest-vs-paseo` },
            ],
          }),
        }}
      />

      <CompareVs
        eyebrow="Token Intelligence · Paseo alternative"
        headline="Paseo covers every device."
        headlineMuted="Token Intelligence covers the token cost."
        subhead="Token Intelligence is Tempest's core feature: a local knowledge graph built once, shared across every parallel agent session — up to 86% fewer tokens, up to 92% fewer tool calls. Paseo is a genuinely impressive tool: mobile apps, a web client, CLI, local-first voice, E2E encrypted relay, cron scheduling, and 34+ agents. Both are free. The question is whether reach or token efficiency is the constraint you need to solve."
        competitorName="Paseo"
        rows={rows}
        sourcedFrom="Paseo details based on public information at paseo.sh, reviewed 2026-07-25. If anything is wrong or outdated, open an issue on our GitHub and we will fix it."
        whenTheirsTitle="Agents from anywhere: phone, tablet, browser, CLI."
        whenTheirsBody="Pick Paseo if you need agents accessible from anywhere — a phone, tablet, browser, or CLI. Its multi-client architecture with E2E encrypted relay, Tailscale support, local-first voice, and cron scheduling is built for exactly those workflows."
        whenTempestTitle="Your API bill and your desktop are the constraints."
        whenTempestBody="Without Token Intelligence, every parallel agent session pays the full cost of reading your repository independently. Token Intelligence indexes it once — every agent then queries the shared graph instead of re-reading files. Up to 86% fewer tokens, up to 92% fewer tool calls. Native Windows binaries and no background daemon."
        featureSectionEyebrow="Token Intelligence"
        featureSectionTitle="Both free. One shared index."
        featureSectionTitleMuted="That is the number that moves your bill."
        featureSectionAside="Paseo bets on reach — any device, anywhere. Tempest bets on efficiency — the lowest possible token cost per session, on the machine you already own."
        features={features}
        furtherReading={[
          { href: "/blog/the-case-against-context-switching", label: "The Case Against Context Switching Between AI Agents" },
        ]}
        ctaHeadline="86% fewer tokens."
        ctaHeadlineMuted="Every parallel session. Free."
      />
    </main>
  );
}
