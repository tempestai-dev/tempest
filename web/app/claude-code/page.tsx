import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
  description:
    "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 64% across sessions.",
  alternates: { canonical: `${SITE_URL}/claude-code` },
  openGraph: {
    title: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
    description:
      "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 64% across sessions.",
    type: "website",
    url: `${SITE_URL}/claude-code`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Run Claude Code in Parallel — Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
    description:
      "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 64% across sessions.",
    images: ["/og-image.png"],
  },
}

export default function ClaudeCodePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Run Claude Code in Parallel — Multiple Sessions, Zero Conflicts",
            description:
              "Tempest lets you run multiple Claude Code sessions simultaneously, each isolated in its own git worktree. Token Intelligence cuts token costs by up to 64% across sessions.",
            url: `${SITE_URL}/claude-code`,
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
              { "@type": "ListItem", position: 2, name: "Claude Code", item: `${SITE_URL}/claude-code` },
            ],
          }),
        }}
      />

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">CLAUDE CODE + TEMPEST</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">Run multiple Claude Code sessions at once.</span>{" "}
            <span className="text-muted-foreground">Each on its own branch. None colliding.</span>
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-12 max-w-xl">
            Claude Code is the most capable AI coding agent available. Tempest is the environment designed to run multiple Claude Code sessions in parallel — without merge conflicts, without losing context, and with up to 64% fewer tokens across sessions.
          </p>

          <div className="flex flex-col gap-14">

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">The problem with running Claude Code in separate terminals</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Running two Claude Code sessions in the same working directory is asking for trouble. Both agents read the same files and write to the same paths. When they conflict, you are untangling a merge mess in the middle of an automated run.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                The workaround — running sessions one at a time — erases the benefit. Claude Code is fast, but your time is finite. Sequential sessions waste the most valuable resource: your attention is in one place while Claude Code works in one other place, instead of five.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">How Tempest isolates Claude Code sessions</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Tempest creates a dedicated git worktree for each Claude Code session. Each worktree is a separate working directory linked to your repository, with its own branch. Claude Code in tab 1 and Claude Code in tab 2 are in completely separate directories. They cannot read each other's in-progress changes, and they cannot produce merge conflicts.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                Creating, managing, and cleaning up worktrees is handled automatically. Open a session tab — worktree created. Close it — worktree persists. The branch is ready to review and merge whenever you are.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Token Intelligence for Claude Code</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Every Claude Code session reads your codebase to understand what it's working with. In five parallel sessions, that foundational reading happens five times — you pay for each one. Token Intelligence changes this.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                When you enable Token Intelligence, Tempest writes an Atlas MCP configuration file for Claude Code automatically. Claude Code picks up the Atlas MCP server and queries the local code-knowledge graph instead of reading files from scratch. Symbol definitions, call chains, import trees — all answered from the graph in milliseconds, at a fraction of the token cost.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-4">
                  <p className="text-2xl font-light text-foreground">64%</p>
                  <p className="text-sm text-muted-foreground mt-1">fewer context tokens across parallel Claude Code sessions</p>
                </div>
                <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-4">
                  <p className="text-2xl font-light text-foreground">58%</p>
                  <p className="text-sm text-muted-foreground mt-1">fewer tool calls per Claude Code session</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">Session continuity for Claude Code</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Claude Code sessions in Tempest persist when you close the tab. The full conversation history is saved, the branch is unchanged, and the worktree is exactly as Claude Code left it. Reopen the tab and Claude Code picks up where it stopped — no re-orientation, no re-reading the task.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                This matters when you are running multiple sessions and reviewing them one by one. Each session you return to is already in context. You review the diff, ship or discard, and move to the next.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">What this enables in practice</h2>
              <ul className="flex flex-col gap-3">
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Run Claude Code on five different features simultaneously — review and ship when each finishes.
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Try three approaches to the same problem in parallel — all isolated, all reviewable, pick the best.
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Run a bug-fix session and a feature session simultaneously — one doesn't block the other.
                </li>
                <li className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="size-1 rounded-full bg-foreground/30 mt-2 shrink-0" />
                  Use Token Intelligence to make five sessions cost significantly less than five times one session.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-medium text-foreground mb-4">How to get started</h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Download Tempest, open your project, and click the + tab to start a new session. Select Claude Code. Tempest creates the worktree, starts the session, and Claude Code is ready. Open more tabs for more sessions.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                To enable Token Intelligence: go to <strong className="text-foreground">Settings → Token Intelligence</strong>, turn it on, and index your project. Tempest writes the Atlas MCP config for Claude Code automatically. From that point every Claude Code session in that project uses the graph.
              </p>
            </section>

          </div>

          <div className="mt-16 flex flex-wrap gap-3">
            <Link
              href="/download"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download Tempest free
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
              <Link href="/blog/token-intelligence-eliminating-redundant-reads" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                Token Intelligence: Eliminating Redundant File Reads
              </Link>
              <Link href="/blog/the-case-against-context-switching" className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25">
                The Case Against Context Switching Between AI Agents
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  )
}
