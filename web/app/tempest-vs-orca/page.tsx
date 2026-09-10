import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Database, Shield } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SITE_URL } from '@/lib/constants/site'

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

type Row = {
  label: string;
  tempest: string;
  other: string;
  tempestYes: boolean | null;
  otherYes: boolean | null;
};

const rows: Row[] = [
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

const features = [
  {
    icon: Coins,
    title: "The one thing Orca doesn't have",
    body: "Orca is a serious ADE — 27+ agents, remote worktrees, an embedded browser. But every agent session still reads your repository from scratch. Tempest indexes your codebase once and every session draws from that shared graph. That's where the 86% token reduction comes from, and it compounds with every parallel agent.",
  },
  {
    icon: Database,
    title: "Isolated Postgres per session",
    body: "Parallel agents that touch a database corrupt each other's state. Tempest spins up an isolated Postgres branch per session so migrations, seed data, and destructive queries stay in their own lane. Orca does not ship database branching.",
  },
  {
    icon: Shield,
    title: "OS-level sandbox on every platform",
    body: "Hephaestus wraps each agent process in Job Objects on Windows, sandbox-exec on macOS, and bubblewrap on Linux. Rogue commands are contained by the OS, not by the app. Orca relies on git worktree isolation alone.",
  },
];

function Checkmark() {
  return <span className="text-foreground font-medium text-sm">&#10003;</span>;
}
function Cross() {
  return <span className="text-muted-foreground text-sm">&#10007;</span>;
}
function Unknown() {
  return <span className="text-muted-foreground text-sm">&mdash;</span>;
}

export default function TempestVsOrcaPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'Tempest vs Orca — Shared Knowledge Graph + Database Branches',
            description: "Both open-source ADEs on Windows, macOS, Linux with mobile companions. Tempest adds a shared knowledge graph that cuts token usage by up to 86%, plus database branches and OS-level sandboxing.",
            url: `${SITE_URL}/tempest-vs-orca`,
            author: { '@type': 'Organization', name: 'Tempest', url: SITE_URL },
            publisher: {
              '@type': 'Organization', name: 'Tempest', url: SITE_URL,
              logo: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.webp`, width: 1280, height: 640 },
            },
            image: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.webp`, width: 1280, height: 640 },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
              { '@type': 'ListItem', position: 2, name: 'Tempest vs Orca', item: `${SITE_URL}/tempest-vs-orca` },
            ],
          }),
        }}
      />
      <Container>
        <section className="flex flex-col pt-10 pb-10 min-[1000px]:pb-12">
          <p className="text-sm text-muted-foreground font-semibold mb-4">TOKEN INTELLIGENCE &middot; ORCA ALTERNATIVE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">Orca gives you 27 agents.</span>
            <br />
            <span className="text-muted-foreground">Each one still reads your repo from scratch.</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Orca is the closest analog to Tempest &mdash; open source, cross-platform, mobile
            companion, dozens of CLI agents in isolated worktrees. Tempest adds three things
            Orca does not: a shared code-knowledge graph that cuts token usage by up to 86%
            and tool calls by up to 92%, an isolated Postgres branch per session, and OS-level
            sandboxing via Hephaestus. If your bottleneck is API cost or data safety, that is
            the difference.
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

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">TEMPEST VS ORCA</p>
        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Feature</th>
                <th className="text-left px-5 py-3.5 font-medium">Tempest</th>
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Orca</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label} className={i < rows.length - 1 ? "border-b border-foreground/[0.08]" : ""}>
                  <td className="px-5 py-3.5 text-muted-foreground">{row.label}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      {row.tempestYes === true ? <Checkmark /> : row.tempestYes === false ? <Cross /> : <Unknown />}
                      <span className="text-foreground">{row.tempest}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      {row.otherYes === true ? <Checkmark /> : row.otherYes === false ? <Cross /> : <Unknown />}
                      <span className="text-muted-foreground">{row.other}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Orca details based on public information at onorca.dev, reviewed 2026-09-10.
          If anything is wrong or outdated, open an issue on our GitHub and we will fix it.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK ORCA</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Orca if remote SSH worktrees, an embedded Chromium browser with design mode,
          and native GitHub / Linear integrations are the features that unblock your team.
          Orca ships a broader integration surface and a more mature browser story than
          Tempest today.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK TEMPEST</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Tempest if your constraint is API bill, data safety, or both. Every parallel
          agent in Orca pays the full file-read cost independently &mdash; that scales linearly
          with session count. Tempest indexes your repository once, every agent draws from
          the shared graph, and the isolated Postgres branch per session plus OS-level sandbox
          mean a runaway agent cannot touch your other work. Up to 86% fewer tokens, up to
          92% fewer tool calls, compounding across every session.
        </p>
      </Container>

      <Container className="pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8 mb-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">TOKEN INTELLIGENCE + ISOLATION</p>
            <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
              <span className="text-foreground">27 agents is impressive.</span>{" "}
              <span className="text-muted-foreground">27 agents that don&apos;t step on each other is the actual product.</span>
            </h2>
          </div>
          <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
            <p className="text-base text-muted-foreground leading-relaxed">
              A worktree keeps files apart. A shared knowledge graph keeps token cost flat.
              A Postgres branch keeps data apart. A sandbox keeps the OS apart. Tempest ships
              all four in one binary.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded bg-foreground/[0.06] p-6 flex flex-col gap-6">
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

      <Container className="pb-12">
        <p className="text-sm text-muted-foreground font-semibold mb-4">FURTHER READING</p>
        <Link
          href="/blog/token-intelligence-eliminating-redundant-reads"
          className="text-sm text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
        >
          Token Intelligence: Eliminating Redundant File Reads &rarr;
        </Link>
      </Container>

      <Container className="pb-24">
        <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] flex flex-col items-center text-center px-8 py-16 gap-6">
          <p className="text-sm text-muted-foreground font-semibold">ORCA ALTERNATIVE &mdash; TOKEN-EFFICIENT, APACHE 2.0</p>
          <h2 className="text-3xl min-[1000px]:text-4xl font-normal text-foreground leading-snug max-w-xl">
            86% fewer tokens.{" "}
            <span className="text-muted-foreground">Every parallel session.</span>
          </h2>
          <Link
            href="/download"
            className="bg-foreground text-background rounded-full px-5 h-[41px] flex items-center text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Download Tempest free
          </Link>
          <p className="text-xs text-muted-foreground">
            Runs entirely on your machine. Apache 2.0. No account required.
          </p>
        </div>
      </Container>
    </main>
  );
}
