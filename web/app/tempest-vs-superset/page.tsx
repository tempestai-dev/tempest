import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, Coins, Box } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
  description:
    "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 64%.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-superset` },
  openGraph: {
    title: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
    description:
      "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 64%.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-superset`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest vs Superset" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Superset — Local Multi-Agent Development, Token-Efficient",
    description:
      "Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 64%.",
    images: ["/og-image.png"],
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

type Row = {
  label: string;
  tempest: string;
  other: string;
  tempestYes: boolean;
  otherYes: boolean | null;
};

const rows: Row[] = [
  { label: "Shared knowledge graph",  tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",       tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",        tempest: "Up to 64% fewer",                               other: "I did not find equivalent claims",               tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",        tempest: "Up to 58% fewer",                               other: "I did not find equivalent claims",               tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",  tempest: "Per agent session",                             other: "Yes — isolated per workspace",                  tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",        tempest: "Unlimited",                                     other: "Yes — 10+ parallel agents",                     tempestYes: true,  otherYes: true  },
  { label: "Windows binaries",       tempest: "Yes",                                           other: "No — macOS only (Windows/Linux coming soon)",   tempestYes: true,  otherYes: false },
  { label: "Remote workspaces",      tempest: "No",                                            other: "Yes — Pro tier, beta",                          tempestYes: false, otherYes: true  },
  { label: "Recurring automations",  tempest: "No",                                            other: "Yes — schedule recurring agent runs",           tempestYes: false, otherYes: true  },
  { label: "MCP server",            tempest: "No",                                            other: "Yes — 27 tools included",                       tempestYes: false, otherYes: true  },
  { label: "License",               tempest: "Apache 2.0",                                    other: "Elastic License 2.0 (source-available)",        tempestYes: true,  otherYes: null  },
  { label: "Price",                 tempest: "Free",                                          other: "Free (local); Pro $15/user/month (remote, billing yearly)", tempestYes: true, otherYes: null },
];

const features = [
  {
    icon: Coins,
    title: "One index, every agent benefits",
    body: "Tempest builds a local knowledge graph of your repository once. Every parallel agent draws from that shared index instead of re-reading files independently. That is where the token reduction comes from — the work is done once, not once per agent.",
  },
  {
    icon: GitBranch,
    title: "Windows support today",
    body: "Superset ships macOS binaries, with Windows and Linux marked as coming soon. Tempest has native Windows binaries available now. If your team develops on Windows, that is a hard blocker for Superset.",
  },
  {
    icon: Box,
    title: "Apache 2.0, not source-available",
    body: "Superset is licensed under Elastic License 2.0 — source-available with restrictions on competing services. Tempest is Apache 2.0: use it, fork it, ship a modified version commercially. No restrictions.",
  },
];

function Checkmark() {
  return <span className="text-foreground font-medium text-sm">✓</span>;
}
function Cross() {
  return <span className="text-muted-foreground text-sm">✕</span>;
}
function Unknown() {
  return <span className="text-muted-foreground text-sm">—</span>;
}

export default function TempestVsSupersetPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'Tempest vs Superset — Local Multi-Agent Development, Token-Efficient',
            description: 'Superset is macOS-only and ELv2-licensed. Tempest is Apache 2.0, runs on Windows today, with a shared knowledge graph cutting token usage by up to 64%.',
            url: `${SITE_URL}/tempest-vs-superset`,
            author: { '@type': 'Organization', name: 'Tempest', url: SITE_URL },
            publisher: {
              '@type': 'Organization', name: 'Tempest', url: SITE_URL,
              logo: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.png`, width: 1280, height: 640 },
            },
            image: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.png`, width: 1280, height: 640 },
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
              { '@type': 'ListItem', position: 2, name: 'Tempest vs Superset', item: `${SITE_URL}/tempest-vs-superset` },
            ],
          }),
        }}
      />
      <Container>
        <section className="flex flex-col pt-10 pb-10 min-[1000px]:pb-12">
          <p className="text-sm text-muted-foreground font-semibold mb-4">TOKEN INTELLIGENCE · SUPERSET ALTERNATIVE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">Every agent reads your repo from scratch.</span>
            <br />
            <span className="text-muted-foreground">Token Intelligence means they don&apos;t have to.</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Token Intelligence is Tempest&apos;s core feature: a local knowledge graph built once
            and shared across every parallel agent session — up to 64% fewer tokens, up to 58%
            fewer tool calls. No other tool in this category documents an equivalent. Superset
            ships remote workspaces, automations, and 27 MCP tools that Tempest doesn&apos;t — but
            none of those reduce what you pay per agent run. Tempest also runs on Windows today;
            Superset lists it as coming soon.
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
        <p className="text-sm text-muted-foreground font-semibold mb-4">TEMPEST VS SUPERSET</p>
        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Feature</th>
                <th className="text-left px-5 py-3.5 font-medium">Tempest</th>
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Superset</th>
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
          Superset details based on public docs at superset.sh, reviewed 2026-07-25.
          If anything is wrong or outdated, open an issue on our GitHub and we will fix it.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK SUPERSET</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Superset if you are on macOS and want the fuller platform: remote workspaces
          (Pro tier, beta), recurring automations, 27 MCP tools, and a diff review dashboard.
          It is a more ambitious product than Tempest today, and that shows in the feature list.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK TEMPEST</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Tempest if your API bill is the constraint. Every agent you run normally pays
          the full cost of reading your repository — file by file, tool call by tool call.
          Token Intelligence builds a local knowledge graph once and every parallel agent draws
          from it instead. Up to 64% fewer tokens. Up to 58% fewer tool calls. The savings
          compound with every session you add. You also get Windows binaries today and
          Apache 2.0 — not ELv2.
        </p>
      </Container>

      <Container className="pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8 mb-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">WHY THE TOKEN NUMBERS HOLD</p>
            <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
              <span className="text-foreground">Token Intelligence.</span>{" "}
              <span className="text-muted-foreground">Index once. Every agent pays less.</span>
            </h2>
          </div>
          <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
            <p className="text-base text-muted-foreground leading-relaxed">
              Most multi-agent tools let each agent discover the repository independently.
              Tempest indexes it once and shares that index. The difference is where the
              context work happens — and who pays for it.
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
          Token Intelligence: Eliminating Redundant File Reads →
        </Link>
      </Container>

      <Container className="pb-24">
        <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] flex flex-col items-center text-center px-8 py-16 gap-6">
          <p className="text-sm text-muted-foreground font-semibold">SUPERSET ALTERNATIVE — FREE AND OPEN SOURCE</p>
          <h2 className="text-3xl min-[1000px]:text-4xl font-normal text-foreground leading-snug max-w-xl">
            64% fewer tokens.{" "}
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
