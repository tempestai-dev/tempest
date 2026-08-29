import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
  description:
    "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 64% fewer tokens with shared context. Free, open source.",
  alternates: { canonical: `${SITE_URL}/parallel-ai-agents` },
  openGraph: {
    title: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
    description:
      "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 64% fewer tokens with shared context.",
    type: "website",
    url: `${SITE_URL}/parallel-ai-agents`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Parallel AI Agents — Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
    description:
      "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 64% fewer tokens with shared context.",
    images: ["/og-image.png"],
  },
}

export default function ParallelAIAgentsPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Parallel AI Agents — Run Multiple Coding Agents Without Conflicts",
            description:
              "Run Claude Code, Aider, Cline, and more in parallel — each on its own git worktree, never colliding. Up to 64% fewer tokens with shared context. Free, open source.",
            url: `${SITE_URL}/parallel-ai-agents`,
            author: { "@type": "Organization", name: "Tempest", url: SITE_URL },
            publisher: {
              "@type": "Organization",
              name: "Tempest",
              url: SITE_URL,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.png`, width: 1280, height: 640 },
            },
            image: { "@type": "ImageObject", url: `${SITE_URL}/og-image.png`, width: 1280, height: 640 },
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
              { "@type": "ListItem", position: 2, name: "Parallel AI Agents", item: `${SITE_URL}/parallel-ai-agents` },
            ],
          }),
        }}
      />

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">PARALLEL AI AGENTS</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">Run five agents at once.</span>{" "}
            <span className="text-muted-foreground">None of them stepping on each other.</span>
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-12 max-w-xl">
            Parallel AI agent development only works when each agent is completely isolated from every other. Tempest is built around that requirement — not bolted onto it.
          </p>

          <div className="flex flex-col gap-14">

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">What happens when you run agents without isolation</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Two agents in the same working directory will eventually collide. Agent A edits a file agent B is reading. Agent B commits something that conflicts with agent A's in-progress changes. You end up with a merge conflict in the middle of an automated run, both agents stopped, and a working directory in an unknown state.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                The common workaround is to run agents sequentially. One finishes, the next starts. But sequential execution erases the entire point. You have turned a parallelism tool into a slower version of one agent.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Git worktrees: the correct isolation primitive</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Git worktrees are separate checked-out working directories linked to the same repository. Each worktree has its own branch and its own file state. Changes in one do not affect any other until you explicitly merge.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                This is the correct way to isolate parallel agents. Each agent lives in its own worktree, works on its own branch, and cannot touch anything outside its directory. The blast radius of a bad agent run is zero: it cannot corrupt main, collide with another agent, or leave your working state broken.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                Tempest creates and manages these worktrees automatically. Open a session tab — worktree created. Close it — worktree persists. You never touch the Git worktree CLI directly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Token cost at scale: why shared context matters</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Every AI agent reads your codebase to understand what it's working with. In a single session that's expected overhead. In five parallel sessions, each agent reads the same foundational files independently — entry points, type definitions, shared utilities — and you pay the full token cost every time, for every agent.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                Tempest's Token Intelligence builds a local semantic code graph from your codebase once and shares it across every parallel session. Agents query the graph for symbol definitions, call chains, and cross-file relationships instead of reading files from scratch. The foundational reading happens once. Every session after that costs a fraction.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-4">
                  <p className="text-2xl font-light text-foreground">64%</p>
                  <p className="text-sm text-muted-foreground mt-1">fewer context tokens across parallel sessions</p>
                </div>
                <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-4">
                  <p className="text-2xl font-light text-foreground">58%</p>
                  <p className="text-sm text-muted-foreground mt-1">fewer tool calls per agent session</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Supported agents</h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-4">
                Any terminal-based AI coding agent works inside Tempest. Confirmed integrations:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["Claude Code", "Aider", "OpenCode", "Copilot CLI", "Cline", "Goose", "Gemini CLI", "Kiro"].map((agent) => (
                  <div key={agent} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30 shrink-0" />
                    {agent}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Session continuity: no context lost between visits</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                When you run multiple agents in parallel, you are not watching all of them at once. You delegate, do something else, then come back to review. If coming back costs five minutes of re-orientation per session, five sessions costs twenty-five minutes before you've reviewed a single diff.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                Tempest persists every session the moment you leave it. Close a tab, reopen it — the agent picks up exactly where it left off. Full conversation history, same branch, worktree untouched. Nothing is lost because nothing was lost.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">What parallel agents enable in practice</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Once isolation and continuity are both handled, the way you work changes:
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Run five features in parallel and pick the best result, not the first one finished.
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Run a bug fix agent and a feature agent simultaneously — one doesn't block the other.
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Review diffs in batches. Five agents run while you do other work; review all five when they finish.
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Explore three approaches to the same problem simultaneously — all isolated, all reviewable.
                </li>
              </ul>
            </section>

          </div>

          <div className="mt-16 flex flex-wrap gap-3">
            <Link
              href="/download"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download free
            </Link>
            <Link
              href="/token-intelligence"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-colors"
            >
              How Token Intelligence works
            </Link>
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/[0.08]">
            <p className="text-sm text-muted-foreground font-semibold mb-4">FURTHER READING</p>
            <div className="flex flex-col gap-3">
              <Link href="/blog/why-parallel-agents-change-everything" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                Why Parallel Agents Change Everything
              </Link>
              <Link href="/blog/the-case-against-context-switching" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                The Case Against Context Switching Between AI Agents
              </Link>
              <Link href="/blog/token-intelligence-eliminating-redundant-reads" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                Token Intelligence: Eliminating Redundant File Reads
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  )
}
