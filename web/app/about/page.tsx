import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "About Tempest — Open-Source AI Agent Runner",
  description:
    "Tempest is an open-source desktop app for running AI coding agents in parallel. Built with Tauri and React, Apache 2.0, local-first by design.",
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: "About Tempest — Open-Source AI Agent Runner",
    description:
      "Tempest is an open-source desktop app for running AI coding agents in parallel. Built with Tauri and React, Apache 2.0, local-first by design.",
    type: "website",
    url: `${SITE_URL}/about`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "About Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Tempest — Open-Source AI Agent Runner",
    description:
      "Tempest is an open-source desktop app for running AI coding agents in parallel. Built with Tauri and React, Apache 2.0, local-first by design.",
    images: ["/og-image.png"],
  },
}

export default function AboutPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "AboutPage",
            name: "About Tempest",
            url: `${SITE_URL}/about`,
            description:
              "Tempest is an open-source desktop app for running AI coding agents in parallel. Built with Tauri and React, Apache 2.0, local-first by design.",
            mainEntity: { "@id": `${SITE_URL}/#organization` },
          }),
        }}
      />

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">ABOUT</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">Built for developers who run agents at scale.</span>{" "}
            <span className="text-muted-foreground">Locally. In parallel.</span>
          </h1>

          <div className="flex flex-col gap-12 mt-12">
            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">MISSION</p>
              <p className="text-base text-foreground leading-relaxed">
                Tempest exists to make running multiple AI coding agents practical — not in theory,
                but in daily development work. The core problems are isolation and cost. Without
                isolation, agents overwrite each other&apos;s changes. Without shared context, every
                agent pays the full token cost of reading your codebase from scratch.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                Tempest solves both. Each agent session runs on its own git worktree — a separate
                working directory linked to your repo. Token Intelligence builds a local knowledge
                graph of your codebase once and shares it across every parallel session, cutting
                context consumption by up to 64%.
              </p>
            </section>

            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">HOW IT IS BUILT</p>
              <p className="text-base text-foreground leading-relaxed">
                Tempest is a desktop app built with{" "}
                <a
                  href="https://tauri.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Tauri 2.x
                </a>{" "}
                — a Rust backend with a React frontend running in a native WebView. It ships native
                binaries for Windows, macOS, and Linux. No Electron, no bundled Chromium. The app
                is small, fast to start, and runs entirely on your machine.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                The PTY layer handles real terminal sessions for each agent. Git worktrees handle
                isolation. Token Intelligence (powered by Atlas) handles the shared code-knowledge
                graph. Nothing leaves your machine — not your code, not your context, not your
                agent conversations.
              </p>
            </section>

            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">OPEN SOURCE</p>
              <p className="text-base text-foreground leading-relaxed">
                Tempest is free and open source under the{" "}
                <a
                  href="https://www.apache.org/licenses/LICENSE-2.0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Apache 2.0 license
                </a>
                . Use it, fork it, build on it, ship a modified version commercially — no
                restrictions. The source is on{" "}
                <a
                  href="https://github.com/tempestai-dev/tempest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  GitHub
                </a>
                . Issues, pull requests, and feedback are welcome.
              </p>
            </section>

            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">STATUS</p>
              <p className="text-base text-muted-foreground leading-relaxed">
                Tempest is in active early development. Windows binaries are available now.
                macOS and Linux binaries are on the roadmap. Token Intelligence shipped in v0.1.2.
                Every release is documented in the{" "}
                <Link
                  href="/release-notes"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  release notes
                </Link>
                .
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
            <a
              href="https://github.com/tempestai-dev/tempest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </Container>
    </main>
  )
}
