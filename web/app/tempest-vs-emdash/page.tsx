import type { Metadata } from "next";
import Link from "next/link";
import { Coins, HardDrive, GitBranch } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
  description:
    "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 64% across parallel sessions. Emdash leads on integrations.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-emdash` },
  openGraph: {
    title: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
    description:
      "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 64% across parallel sessions. Emdash leads on integrations.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-emdash`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest vs Emdash" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents",
    description:
      "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 64% across parallel sessions. Emdash leads on integrations.",
    images: ["/og-image.png"],
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

type Row = {
  label: string;
  tempest: string;
  other: string;
  tempestYes: boolean | null;
  otherYes: boolean | null;
};

const rows: Row[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",         tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 64% fewer",                               other: "I did not find equivalent claims",                 tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 58% fewer",                               other: "I did not find equivalent claims",                 tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",          tempest: "Unlimited",                                     other: "Yes — 25+ agents supported",                      tempestYes: true,  otherYes: true  },
  { label: "Windows support",          tempest: "Yes",                                           other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "macOS support",            tempest: "Yes",                                           other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "Linux support",            tempest: "Build from source today",                       other: "Yes",                                             tempestYes: null,  otherYes: true  },
  { label: "SSH / remote execution",   tempest: "No",                                            other: "Yes — run agents on remote machines via SSH",     tempestYes: false, otherYes: true  },
  { label: "Built-in browser preview", tempest: "Yes — live dev server preview",                other: "Yes",                                             tempestYes: true,  otherYes: true  },
  { label: "File editor",              tempest: "No",                                            other: "Yes — with search and recovery",                  tempestYes: false, otherYes: true  },
  { label: "CI monitoring",            tempest: "No",                                            other: "Yes",                                             tempestYes: false, otherYes: true  },
  { label: "PR inspection",            tempest: "Stage, commit, push built-in",                  other: "Yes — PR inspection interface",                   tempestYes: null,  otherYes: true  },
  { label: "Issue tracker integration",tempest: "No",                                            other: "Yes — Linear, Jira, GitHub, Notion, Asana",      tempestYes: false, otherYes: true  },
  { label: "Recurring agent runs",     tempest: "No",                                            other: "Yes",                                             tempestYes: false, otherYes: true  },
  { label: "Prompt library",           tempest: "Yes — built-in + custom",                       other: "—",                                               tempestYes: true,  otherYes: null  },
  { label: "License",                  tempest: "Apache 2.0",                                    other: "Open source (specific license on GitHub)",        tempestYes: null,  otherYes: null  },
  { label: "Price",                    tempest: "Free",                                          other: "Free",                                            tempestYes: true,  otherYes: true  },
];

const features = [
  {
    icon: Coins,
    title: "The one thing Emdash doesn't have",
    body: "Emdash is genuinely feature-rich. But each agent session still reads your repository independently. Tempest builds one shared knowledge graph and every session draws from it — that's where the 64% token reduction comes from. It compounds as you add parallel agents.",
  },
  {
    icon: GitBranch,
    title: "Both local-first, different defaults",
    body: "Emdash runs locally and adds SSH remote execution as an option. Tempest is local-only by design — no remote path means there's nothing to configure, nothing to secure, nothing to connect. For teams that stay on-machine, that's fewer moving parts.",
  },
  {
    icon: HardDrive,
    title: "Nothing leaves your machine",
    body: "Tempest has no outbound path for your code. The knowledge graph, your sessions, and every agent interaction stay on your local disk. It's not a policy — it's the architecture.",
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

export default function TempestVsEmdashPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'Tempest vs Emdash — Shared Knowledge Graph for Parallel AI Agents',
            description: "Both local-first, free, open source. Tempest's shared knowledge graph cuts token usage by up to 64% across parallel sessions. Emdash leads on integrations.",
            url: `${SITE_URL}/tempest-vs-emdash`,
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
              { '@type': 'ListItem', position: 2, name: 'Tempest vs Emdash', item: `${SITE_URL}/tempest-vs-emdash` },
            ],
          }),
        }}
      />
      <Container>
        <section className="flex flex-col pt-10 pb-10 min-[1000px]:pb-12">
          <p className="text-sm text-muted-foreground font-semibold mb-4">TOKEN INTELLIGENCE · EMDASH ALTERNATIVE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">Six agents. Six full context loads.</span>
            <br />
            <span className="text-muted-foreground">Or one index, six efficient agents.</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Token Intelligence is Tempest&apos;s core feature: a local knowledge graph built once,
            shared across every parallel agent session — up to 64% fewer tokens, up to 58%
            fewer tool calls. Every agent you add benefits from the same index instead of
            reading your codebase from scratch. Emdash has no documented equivalent. Both
            tools are free, open-source, and local-first — Emdash pulls ahead on SSH remote
            execution, CI monitoring, file editing, issue tracker integration, and scheduling.
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
        <p className="text-sm text-muted-foreground font-semibold mb-4">TEMPEST VS EMDASH</p>
        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Feature</th>
                <th className="text-left px-5 py-3.5 font-medium">Tempest</th>
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Emdash</th>
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
          Emdash details based on public docs at emdash.ai, reviewed 2026-07-25.
          If anything is wrong or outdated, open an issue on our GitHub and we will fix it.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK EMDASH</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Emdash if you want the fuller development environment: a file editor, CI
          monitoring, PR inspection, issue tracker integrations with Linear and Jira, SSH
          remote execution on a dev box, and scheduled recurring agent runs. It ships more
          surface area than Tempest in almost every direction.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK TEMPEST</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Tempest if your API bill is the constraint. Without Token Intelligence, every
          agent you run in parallel pays the full file-read cost independently — that cost
          scales linearly with session count. Token Intelligence indexes your repository once.
          Every agent draws from that shared graph instead. The result: up to 64% fewer tokens
          and up to 58% fewer tool calls, compounding across every session you run in parallel.
          If getting more done for less is the job, that is what Token Intelligence is built for.
        </p>
      </Container>

      <Container className="pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8 mb-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">TOKEN INTELLIGENCE</p>
            <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
              <span className="text-foreground">More agents shouldn&apos;t mean more tokens per agent.</span>{" "}
              <span className="text-muted-foreground">A shared index breaks that relationship.</span>
            </h2>
          </div>
          <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
            <p className="text-base text-muted-foreground leading-relaxed">
              Supporting 25+ agents is impressive. But if each agent reads your codebase from
              scratch, the token cost scales with session count. A shared index breaks
              that relationship.
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
          <p className="text-sm text-muted-foreground font-semibold">EMDASH ALTERNATIVE — LOCAL-FIRST, APACHE 2.0</p>
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
