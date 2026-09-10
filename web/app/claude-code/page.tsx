import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export const metadata: Metadata = {
  title: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
  description:
    "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 86% across sessions.",
  alternates: { canonical: `${SITE_URL}/claude-code` },
  openGraph: {
    title: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
    description:
      "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 86% across sessions.",
    type: "website",
    url: `${SITE_URL}/claude-code`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Run Claude Code in Parallel — Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
    description:
      "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 86% across sessions.",
    images: ["/og-image.webp"],
  },
};

const sections: {
  eyebrow: string;
  title?: React.ReactNode;
  titleMuted?: React.ReactNode;
  body: React.ReactNode;
}[] = [
  {
    eyebrow: "The problem",
    title: "Two terminals, same repo.",
    titleMuted: "One merge conflict away from a stall.",
    body: (
      <>
        <p>
          Running two Claude Code sessions in the same working directory is asking for trouble.
          Both agents read the same files and write to the same paths. When they conflict, you are
          untangling a merge mess in the middle of an automated run.
        </p>
        <p className="mt-4 text-white/60">
          The workaround — running sessions one at a time — erases the benefit. Claude Code is
          fast, but your time is finite. Sequential sessions waste the most valuable resource:
          your attention is in one place while Claude Code works in one other place, instead of
          five.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Isolation",
    title: "One worktree per session.",
    body: (
      <>
        <p>
          Tempest creates a dedicated git worktree for each Claude Code session. Each worktree is a
          separate working directory linked to your repository, with its own branch. Claude Code in
          tab 1 and Claude Code in tab 2 are in completely separate directories. They cannot read
          each other&apos;s in-progress changes, and they cannot produce merge conflicts.
        </p>
        <p className="mt-4 text-white/60">
          Creating, managing, and cleaning up worktrees is handled automatically. Open a session
          tab — worktree created. Close it — worktree persists. The branch is ready to review and
          merge whenever you are.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Token Intelligence",
    title: "Claude Code queries the graph.",
    titleMuted: "Not the whole file.",
    body: (
      <>
        <p>
          Every Claude Code session reads your codebase to understand what it&apos;s working with.
          In five parallel sessions, that foundational reading happens five times — you pay for
          each one. Token Intelligence changes this.
        </p>
        <p className="mt-4 text-white/60">
          When you enable Token Intelligence, Tempest writes an Atlas MCP configuration file for
          Claude Code automatically. Claude Code picks up the Atlas MCP server and queries the
          local code-knowledge graph instead of reading files from scratch. Symbol definitions,
          call chains, import trees — all answered from the graph in milliseconds, at a fraction
          of the token cost.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Session continuity",
    title: "Close a Claude Code tab.",
    titleMuted: "Reopen it. Full context intact.",
    body: (
      <>
        <p>
          Claude Code sessions in Tempest persist when you close the tab. The full conversation
          history is saved, the branch is unchanged, and the worktree is exactly as Claude Code
          left it. Reopen the tab and Claude Code picks up where it stopped — no re-orientation,
          no re-reading the task.
        </p>
        <p className="mt-4 text-white/60">
          This matters when you are running multiple sessions and reviewing them one by one. Each
          session you return to is already in context. You review the diff, ship or discard, and
          move to the next.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Getting started",
    title: "Two clicks to a parallel Claude Code session.",
    body: (
      <>
        <p>
          Download Tempest, open your project, and click the + tab to start a new session. Select
          Claude Code. Tempest creates the worktree, starts the session, and Claude Code is ready.
          Open more tabs for more sessions.
        </p>
        <p className="mt-4 text-white/60">
          To enable Token Intelligence: go to <strong className="text-white">Settings → Token
          Intelligence</strong>, turn it on, and index your project. Tempest writes the Atlas MCP
          config for Claude Code automatically. From that point every Claude Code session in that
          project uses the graph.
        </p>
      </>
    ),
  },
];

const useCases = [
  "Run Claude Code on five different features simultaneously — review and ship when each finishes.",
  "Try three approaches to the same problem in parallel — all isolated, all reviewable, pick the best.",
  "Run a bug-fix session and a feature session simultaneously — one doesn't block the other.",
  "Use Token Intelligence to make five sessions cost significantly less than five times one session.",
];

const stats = [
  { number: "86%", label: "fewer context tokens across parallel Claude Code sessions" },
  { number: "92%", label: "fewer tool calls per Claude Code session" },
];

export default function ClaudeCodePage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
            description:
              "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 86% across sessions.",
            url: `${SITE_URL}/claude-code`,
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
              { "@type": "ListItem", position: 2, name: "Claude Code", item: `${SITE_URL}/claude-code` },
            ],
          }),
        }}
      />

      <PageHero
        eyebrow="Claude Code + Tempest"
        headline="Run multiple Claude Code sessions at once."
        headlineMuted="Each on its own branch. None colliding."
        subhead="Claude Code is the most capable AI coding agent available. Tempest is the environment designed to run multiple sessions in parallel — without merge conflicts, without losing context, and with up to 86% fewer tokens."
        actions={
          <>
            <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
              <Link href="/download">
                Download Now
                <Download data-icon="inline-end" />
              </Link>
            </Button>
            <Button
              asChild
              compact
              mono
              variant="secondary"
              className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
            >
              <Link href="/token-intelligence">
                How Token Intelligence works
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        }
      />

      {sections.slice(0, 3).map(({ eyebrow, title, titleMuted, body }) => (
        <SectionShell key={eyebrow} eyebrow={eyebrow} title={title} titleMuted={titleMuted}>
          <div className="px-6 py-10 text-[15px] font-light leading-[1.7] text-white/80 sm:px-10 sm:py-12 lg:px-14">
            {body}
          </div>
        </SectionShell>
      ))}

      <SectionShell eyebrow="The numbers">
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {stats.map(({ number, label }) => (
            <div key={number} className="flex flex-col gap-3 p-8 sm:p-10">
              <p className="font-pixel text-[56px] leading-none tracking-[-0.02em] text-white sm:text-[64px]">
                {number}
              </p>
              <p className="text-[14px] font-light leading-[1.6] text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {sections.slice(3).map(({ eyebrow, title, titleMuted, body }) => (
        <SectionShell key={eyebrow} eyebrow={eyebrow} title={title} titleMuted={titleMuted}>
          <div className="px-6 py-10 text-[15px] font-light leading-[1.7] text-white/80 sm:px-10 sm:py-12 lg:px-14">
            {body}
          </div>
        </SectionShell>
      ))}

      <SectionShell eyebrow="What this enables" title="What five parallel Claude Codes look like.">
        <ul className="flex flex-col gap-4 px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
          {useCases.map((c) => (
            <li key={c} className="flex items-start gap-3 text-[14px] font-light leading-[1.6] text-white/70">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-white/40" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell eyebrow="Further reading">
        <div className="flex flex-col gap-3 px-6 py-8 sm:px-10 sm:py-10 lg:px-14">
          <Link
            href="/blog/why-parallel-agents-change-everything"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            Why Parallel Agents Change Everything
          </Link>
          <Link
            href="/blog/token-intelligence-eliminating-redundant-reads"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            Token Intelligence: Eliminating Redundant File Reads
          </Link>
          <Link
            href="/blog/the-case-against-context-switching"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            The Case Against Context Switching Between AI Agents
          </Link>
        </div>
      </SectionShell>
    </main>
  );
}
