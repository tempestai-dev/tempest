import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export const metadata: Metadata = {
  title: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
  description:
    "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 86% fewer tokens with shared context. Free, open source.",
  alternates: { canonical: `${SITE_URL}/parallel-ai-agents` },
  openGraph: {
    title: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
    description:
      "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 86% fewer tokens with shared context.",
    type: "website",
    url: `${SITE_URL}/parallel-ai-agents`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Parallel AI Agents — Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
    description:
      "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 86% fewer tokens with shared context.",
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
    eyebrow: "The failure mode",
    title: "Two agents in one directory.",
    titleMuted: "Guaranteed collision.",
    body: (
      <>
        <p>
          Two agents in the same working directory will eventually collide. Agent A edits a file
          agent B is reading. Agent B commits something that conflicts with agent A&apos;s
          in-progress changes. You end up with a merge conflict in the middle of an automated run,
          both agents stopped, and a working directory in an unknown state.
        </p>
        <p className="mt-4 text-white/60">
          The common workaround is to run agents sequentially. One finishes, the next starts. But
          sequential execution erases the entire point. You have turned a parallelism tool into a
          slower version of one agent.
        </p>
      </>
    ),
  },
  {
    eyebrow: "The primitive",
    title: "Git worktrees, one per agent.",
    body: (
      <>
        <p>
          Git worktrees are separate checked-out working directories linked to the same repository.
          Each worktree has its own branch and its own file state. Changes in one do not affect any
          other until you explicitly merge.
        </p>
        <p className="mt-4 text-white/60">
          This is the correct way to isolate parallel agents. Each agent lives in its own worktree,
          works on its own branch, and cannot touch anything outside its directory. The blast
          radius of a bad agent run is zero: it cannot corrupt main, collide with another agent,
          or leave your working state broken.
        </p>
        <p className="mt-4 text-white/60">
          Tempest creates and manages these worktrees automatically. Open a session tab — worktree
          created. Close it — worktree persists. You never touch the Git worktree CLI directly.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Session continuity",
    title: "Close a tab.",
    titleMuted: "Reopen it. Same context.",
    body: (
      <>
        <p>
          When you run multiple agents in parallel, you are not watching all of them at once. You
          delegate, do something else, then come back to review. If coming back costs five minutes
          of re-orientation per session, five sessions costs twenty-five minutes before you have
          reviewed a single diff.
        </p>
        <p className="mt-4 text-white/60">
          Tempest persists every session the moment you leave it. Close a tab, reopen it — the
          agent picks up exactly where it left off. Full conversation history, same branch,
          worktree untouched. Nothing is lost because nothing was lost.
        </p>
      </>
    ),
  },
];

const useCases = [
  "Run five features in parallel and pick the best result, not the first one finished.",
  "Run a bug fix agent and a feature agent simultaneously — one doesn't block the other.",
  "Review diffs in batches. Five agents run while you do other work; review all five when they finish.",
  "Explore three approaches to the same problem simultaneously — all isolated, all reviewable.",
];

const supportedAgents = [
  "Claude Code",
  "Aider",
  "OpenCode",
  "Copilot CLI",
  "Cline",
  "Goose",
  "Gemini CLI",
  "Kiro",
];

const stats = [
  { number: "86%", label: "fewer context tokens across parallel sessions" },
  { number: "92%", label: "fewer tool calls per agent session" },
];

export default function ParallelAIAgentsPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
            description:
              "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 86% fewer tokens with shared context. Free, open source.",
            url: `${SITE_URL}/parallel-ai-agents`,
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
              {
                "@type": "ListItem",
                position: 2,
                name: "Parallel AI Agents",
                item: `${SITE_URL}/parallel-ai-agents`,
              },
            ],
          }),
        }}
      />

      <PageHero
        eyebrow="Parallel AI agents"
        headline="Run five agents at once."
        headlineMuted="None of them stepping on each other."
        subhead="Parallel AI agent development only works when each agent is completely isolated from every other. Tempest is built around that requirement — not bolted onto it."
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

      {sections.map(({ eyebrow, title, titleMuted, body }) => (
        <SectionShell key={eyebrow} eyebrow={eyebrow} title={title} titleMuted={titleMuted}>
          <div className="px-6 py-10 text-[15px] font-light leading-[1.7] text-white/80 sm:px-10 sm:py-12 lg:px-14">
            {body}
          </div>
        </SectionShell>
      ))}

      <SectionShell
        eyebrow="Token cost at scale"
        title="Five agents. One index."
        titleMuted="Read the codebase once."
      >
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

      <SectionShell
        eyebrow="Supported agents"
        title="Any CLI agent."
        titleMuted="If it runs in a terminal, it runs in Tempest."
      >
        <div className="grid grid-cols-2 gap-2 px-6 py-10 sm:grid-cols-4 sm:px-10 sm:py-12 lg:px-14">
          {supportedAgents.map((agent) => (
            <div
              key={agent}
              className="flex items-center gap-2 border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 font-mono text-[12px] text-white/70"
            >
              <span className="size-1 rounded-full bg-white/40" />
              {agent}
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell
        eyebrow="What it enables"
        title="How you work changes."
      >
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
            href="/blog/the-case-against-context-switching"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            The Case Against Context Switching Between AI Agents
          </Link>
          <Link
            href="/blog/token-intelligence-eliminating-redundant-reads"
            className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
          >
            <ArrowRight size={14} />
            Token Intelligence: Eliminating Redundant File Reads
          </Link>
        </div>
      </SectionShell>
    </main>
  );
}
