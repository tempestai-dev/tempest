import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Monitor, GitBranch } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
  description:
    "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 64%.",
  alternates: { canonical: `${SITE_URL}/tempest-vs-paseo` },
  openGraph: {
    title: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
    description:
      "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 64%.",
    type: "website",
    url: `${SITE_URL}/tempest-vs-paseo`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest vs Paseo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development",
    description:
      "Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 64%.",
    images: ["/og-image.png"],
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

type Row = {
  label: string;
  tempest: string;
  other: string;
  tempestYes: boolean | null;
  otherYes: boolean | null;
};

const rows: Row[] = [
  { label: "Shared knowledge graph",    tempest: "Yes — indexed once, shared across all agents",  other: "I did not find an equivalent documented",           tempestYes: true,  otherYes: null  },
  { label: "Token efficiency",          tempest: "Up to 64% fewer",                               other: "I did not find equivalent claims",                   tempestYes: true,  otherYes: null  },
  { label: "Fewer tool calls",          tempest: "Up to 58% fewer",                               other: "I did not find equivalent claims",                   tempestYes: true,  otherYes: null  },
  { label: "Git worktree isolation",    tempest: "Per agent session",                             other: "Yes",                                               tempestYes: true,  otherYes: true  },
  { label: "Parallel agents",          tempest: "Unlimited",                                     other: "Yes — 34+ agents supported",                        tempestYes: true,  otherYes: true  },
  { label: "Windows support",          tempest: "Yes",                                           other: "I did not find a Windows desktop app",              tempestYes: true,  otherYes: null  },
  { label: "macOS support",            tempest: "Yes",                                           other: "Yes",                                               tempestYes: true,  otherYes: true  },
  { label: "Linux support",            tempest: "Build from source today",                       other: "Yes",                                               tempestYes: null,  otherYes: true  },
  { label: "Mobile (iOS / Android)",   tempest: "No",                                            other: "Yes — iOS App Store and Google Play",               tempestYes: false, otherYes: true  },
  { label: "Web client",               tempest: "No",                                            other: "Yes",                                               tempestYes: false, otherYes: true  },
  { label: "CLI client",               tempest: "No",                                            other: "Yes",                                               tempestYes: false, otherYes: true  },
  { label: "Remote access / relay",    tempest: "No",                                            other: "Yes — E2E encrypted relay, Tailscale, Cloudflare",  tempestYes: false, otherYes: true  },
  { label: "Cron / scheduled runs",    tempest: "No",                                            other: "Yes — via CLI",                                     tempestYes: false, otherYes: true  },
  { label: "Local-first voice",        tempest: "No",                                            other: "Yes — runs entirely on-device",                     tempestYes: false, otherYes: true  },
  { label: "Background daemon",        tempest: "No — desktop app only",                         other: "Optional — can also run headless via CLI",          tempestYes: true,  otherYes: null  },
  { label: "No account required",      tempest: "Yes — fully local",                             other: "Provider credentials only",                         tempestYes: true,  otherYes: true  },
  { label: "License",                  tempest: "Apache 2.0",                                    other: "Open source (specific license on GitHub)",          tempestYes: null,  otherYes: null  },
  { label: "Price",                    tempest: "Free",                                          other: "Free",                                              tempestYes: true,  otherYes: true  },
];

const features = [
  {
    icon: Coins,
    title: "The token gap is the real differentiator",
    body: "Paseo is genuinely impressive — remote access, mobile, voice, scheduling, 34+ agents. But each agent session still reads your repository from scratch. Tempest's shared knowledge graph means that cost is paid once, not once per session. It compounds with every agent you add.",
  },
  {
    icon: Monitor,
    title: "Windows binaries, no daemon",
    body: "Paseo's desktop app targets macOS. Tempest ships native Windows binaries now. And unlike Paseo's daemon-based architecture (optional but needed for multi-client access), Tempest is just a desktop app — open it, close it, nothing running in the background.",
  },
  {
    icon: GitBranch,
    title: "Both free. One structural advantage.",
    body: "Both tools are free and open source. The architectural difference is the shared knowledge graph — it is not a feature you can toggle on in Paseo. If token cost is your constraint, that is the one gap between them.",
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

export default function TempestVsPaseoPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'Tempest vs Paseo — Local-First Token-Efficient Multi-Agent Development',
            description: 'Paseo covers every device. Tempest cuts token cost — Windows-native, daemon-free, with a shared knowledge graph reducing usage by up to 64%.',
            url: `${SITE_URL}/tempest-vs-paseo`,
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
              { '@type': 'ListItem', position: 2, name: 'Tempest vs Paseo', item: `${SITE_URL}/tempest-vs-paseo` },
            ],
          }),
        }}
      />
      <Container>
        <section className="flex flex-col pt-10 pb-10 min-[1000px]:pb-12">
          <p className="text-sm text-muted-foreground font-semibold mb-4">TOKEN INTELLIGENCE · PASEO ALTERNATIVE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="text-foreground">Paseo covers every device.</span>
            <br />
            <span className="text-muted-foreground">Token Intelligence covers the token cost.</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            Token Intelligence is Tempest&apos;s core feature: a local knowledge graph built once,
            shared across every parallel agent session — up to 64% fewer tokens, up to 58%
            fewer tool calls. That savings compounds as you run more agents in parallel. Paseo
            has no documented equivalent. Paseo is a genuinely impressive tool: mobile iOS and
            Android apps, a web client, CLI, local-first voice, E2E encrypted relay, cron
            scheduling, and 34+ agents. Both are free. The question is whether reach or
            token efficiency is the constraint you need to solve.
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
        <p className="text-sm text-muted-foreground font-semibold mb-4">TEMPEST VS PASEO</p>
        <div className="overflow-x-auto rounded border border-foreground/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.08]">
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Feature</th>
                <th className="text-left px-5 py-3.5 font-medium">Tempest</th>
                <th className="text-left px-5 py-3.5 text-muted-foreground font-medium">Paseo</th>
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
          Paseo details based on public information at paseo.sh, reviewed 2026-07-25.
          If anything is wrong or outdated, open an issue on our GitHub and we will fix it.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK PASEO</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Paseo if you need agents accessible from anywhere — a phone, tablet, browser,
          or CLI. Its multi-client architecture with E2E encrypted relay, Tailscale support,
          local-first voice, and cron scheduling is built for exactly those workflows. It also
          supports 34+ agents and runs on macOS and Linux.
        </p>
      </Container>

      <Container className="pb-16">
        <p className="text-sm text-muted-foreground font-semibold mb-4">WHEN TO PICK TEMPEST</p>
        <p className="text-base text-foreground max-w-2xl leading-relaxed">
          Pick Tempest if your API bill is the constraint. Without Token Intelligence, every
          parallel agent session pays the full cost of reading your repository independently.
          Token Intelligence indexes it once — every agent then queries the shared graph
          instead of re-reading files. Up to 64% fewer tokens. Up to 58% fewer tool calls.
          The reduction compounds with every session you add. Tempest also ships native Windows
          binaries and needs no background daemon — open it, close it, nothing else running.
        </p>
      </Container>

      <Container className="pb-20">
        <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8 mb-8">
          <div className="min-[700px]:w-2/3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground font-semibold">TOKEN INTELLIGENCE</p>
            <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
              <span className="text-foreground">Both free. One shared index.</span>{" "}
              <span className="text-muted-foreground">That is the number that moves your bill.</span>
            </h2>
          </div>
          <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
            <p className="text-base text-muted-foreground leading-relaxed">
              Paseo bets on reach — any device, anywhere. Tempest bets on efficiency — the
              lowest possible token cost per session, on the machine you already own.
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
          href="/blog/the-case-against-context-switching"
          className="text-sm text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
        >
          The Case Against Context Switching Between AI Agents →
        </Link>
      </Container>

      <Container className="pb-24">
        <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/[0.06] flex flex-col items-center text-center px-8 py-16 gap-6">
          <p className="text-sm text-muted-foreground font-semibold">PASEO ALTERNATIVE — LOCAL-FIRST, APACHE 2.0</p>
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
