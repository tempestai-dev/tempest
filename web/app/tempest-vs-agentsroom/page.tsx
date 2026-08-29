import type { Metadata } from "next";
import Link from "next/link";
import { Coins, GitBranch, Lock } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
  description:
    "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 64%.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-agentsroom` },
  openGraph: {
    title: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
    description:
      "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 64%.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-agentsroom`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest vs AgentsRoom" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development",
    description:
      "Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 64%.",
    images: ["/og-image.png"],
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

type Row = {
  label: string;
  tempest: string;
  other: string;
  tempestYes: boolean | null;
  otherYes: boolean | null;
};

const rows: Row[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",          tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 64% fewer",                               other: "I did not find equivalent claims",                  tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 58% fewer",                               other: "I did not find equivalent claims",                  tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "—",                                                tempestYes: true,  otherYes: null  },
  { label: "Parallel agents",          tempest: "Unlimited",                                     other: "Yes — multi-project cockpit view",                  tempestYes: true,  otherYes: true  },
  { label: "Specialist agent roles",   tempest: "—",                                             other: "Yes — 14 specialist roles",                        tempestYes: null,  otherYes: true  },
  { label: "Windows support",          tempest: "Yes",                                           other: "Yes",                                              tempestYes: true,  otherYes: true  },
  { label: "macOS support",            tempest: "Yes",                                           other: "Yes",                                              tempestYes: true,  otherYes: true  },
  { label: "Mobile companion",         tempest: "No",                                            other: "Yes — real-time sync with desktop",                 tempestYes: false, otherYes: true  },
  { label: "Voice dictation",          tempest: "No",                                            other: "Yes",                                              tempestYes: false, otherYes: true  },
  { label: "Screenshot / sketch",      tempest: "No",                                            other: "Yes",                                              tempestYes: false, otherYes: true  },
  { label: "Prompt / skills library",  tempest: "Yes — built-in + custom",                       other: "—",                                                tempestYes: true,  otherYes: null  },
  { label: "No account required",      tempest: "Yes — fully local",                             other: "API key required per provider",                    tempestYes: true,  otherYes: null  },
  { label: "License",                  tempest: "Apache 2.0",                                    other: "I did not find a public license",                  tempestYes: true,  otherYes: null  },
  { label: "Price",                    tempest: "Free — unlimited projects",                      other: "—",                                                tempestYes: true,  otherYes: null  },
];

const features = [
  {
    icon: Coins,
    title: "Free means all your spend goes to the API",
    body: "Tempest has no project limit and no subscription — the only cost is the model API you already have. The shared knowledge graph then cuts that API cost by up to 64%.",
  },
  {
    icon: GitBranch,
    title: "Isolated branches, not just isolated projects",
    body: "AgentsRoom manages multiple projects in a dashboard view. Tempest isolates each agent session in its own git worktree and branch within a project — three agents writing in the same codebase never touch each other's files.",
  },
  {
    icon: Lock,
    title: "Apache 2.0 vs no public license found",
    body: "We checked AgentsRoom's site and GitHub and did not find a public software license. Tempest is Apache 2.0: fork it, audit the source, ship a modified version commercially. You know exactly what you're running.",
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

export default function TempestVsAgentsRoomPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'Tempest vs AgentsRoom — Free Open-Source Multi-Agent Development',
            description: 'Both support Windows and parallel agents. Tempest adds Apache 2.0, no project limits, and a shared knowledge graph that cuts token usage by up to 64%.',
            url: `${SITE_URL}/tempest-vs-agentsroom`,
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
              { '@type': 'ListItem', position: 2, name: 'Tempest vs AgentsRoom', item: `${SITE_URL}/tempest-vs-agentsroom` },
            ],
          }),
        }}
      />
      <Container>
        <section className="flex flex-col pt-10 pb-10 min-[1000px]:pb-12">
          <p className="text-sm text-muted-foreground font-semibold mb-4">TOKEN INTELLIGENCE · AGENTSROOM ALTERNATIVE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">More parallel agents means more tokens.</span>
            <br />
            <span className="text-muted-foreground">Token Intelligence means it doesn&apos;t have to.</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Token Intelligence is Tempest&apos;s core feature: a local knowledge graph indexed once
            and shared across every parallel agent session — up to 64% fewer tokens, up to 58%
            fewer tool calls. The more agents you run in parallel, the more you save. AgentsRoom
            has no documented equivalent. AgentsRoom wins on mobile, voice, sketch annotation,
            and 14 specialist roles. Tempest wins on token efficiency, git isolation, Apache 2.0,
            and no project limits.
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
        <p className="text-sm text-muted-foreground font-semibold mb-4">TEMPEST VS AGENTSROOM</p>
        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Feature</th>
                <th className="text-left px-5 py-3.5 font-medium">Tempest</th>
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">AgentsRoom</th>
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
          AgentsRoom details based on public information at agentsroom.dev, reviewed 2026-07-25.
          If anything is wrong or outdated, open an issue on our GitHub and we will fix it.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK AGENTSROOM</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick AgentsRoom if you want to manage agents across multiple projects from one
          dashboard, need a mobile companion to check on runs from your phone, want voice
          dictation or sketch annotation, or value the 14 built-in specialist role presets.
          It is the better choice for overseeing a fleet of agents simultaneously.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK TEMPEST</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Tempest if your API bill is the constraint. Without Token Intelligence, every
          agent reads your repository from scratch — and that cost multiplies with every
          parallel session you add. Token Intelligence indexes your codebase once. Every agent
          then queries the shared graph instead of re-reading files. Up to 64% fewer tokens.
          Up to 58% fewer tool calls. That is the number that moves your monthly bill, and no
          other tool in this category has a documented equivalent.
        </p>
      </Container>

      <Container className="pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8 mb-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">TOKEN INTELLIGENCE</p>
            <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
              <span className="text-foreground">Every agent you add shouldn&apos;t cost as much as the last.</span>{" "}
              <span className="text-muted-foreground">Token Intelligence makes sure it doesn&apos;t.</span>
            </h2>
          </div>
          <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
            <p className="text-base text-muted-foreground leading-relaxed">
              AgentsRoom is built to oversee agents across projects from any device.
              Tempest is built to run agents as efficiently as possible in one codebase.
              If deep local work is the job, the token savings are real.
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
          href="/blog/why-parallel-agents-change-everything"
          className="text-sm text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
        >
          Why Parallel Agents Change Everything →
        </Link>
      </Container>

      <Container className="pb-24">
        <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] flex flex-col items-center text-center px-8 py-16 gap-6">
          <p className="text-sm text-muted-foreground font-semibold">AGENTSROOM ALTERNATIVE — FREE AND OPEN SOURCE</p>

          <h2 className="text-3xl min-[1000px]:text-4xl font-normal text-foreground leading-snug max-w-xl">
            64% fewer tokens.{" "}
            <span className="text-muted-foreground">Every parallel session. Free.</span>
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
