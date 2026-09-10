import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";
import { GithubIcon } from "@/components/icons/github";

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
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "About Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Tempest — Open-Source AI Agent Runner",
    description:
      "Tempest is an open-source desktop app for running AI coding agents in parallel. Built with Tauri and React, Apache 2.0, local-first by design.",
    images: ["/og-image.webp"],
  },
};

const sections: { eyebrow: string; body: React.ReactNode }[] = [
  {
    eyebrow: "Mission",
    body: (
      <>
        <p>
          Tempest exists to make running multiple AI coding agents practical — not in theory,
          but in daily development work. The core problems are isolation and cost. Without
          isolation, agents overwrite each other&apos;s changes. Without shared context, every
          agent pays the full token cost of reading your codebase from scratch.
        </p>
        <p className="mt-4 text-white/60">
          Tempest solves both. Each agent session runs on its own git worktree — a separate
          working directory linked to your repo. Token Intelligence builds a local knowledge
          graph of your codebase once and shares it across every parallel session, cutting
          context consumption by up to 86%.
        </p>
      </>
    ),
  },
  {
    eyebrow: "How it is built",
    body: (
      <>
        <p>
          Tempest is a desktop app built with{" "}
          <a
            href="https://tauri.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
          >
            Tauri 2.x
          </a>{" "}
          — a Rust backend with a React frontend running in a native WebView. It ships native
          binaries for Windows, macOS, and Linux. No Electron, no bundled Chromium. The app
          is small, fast to start, and runs entirely on your machine.
        </p>
        <p className="mt-4 text-white/60">
          The PTY layer handles real terminal sessions for each agent. Git worktrees handle
          isolation. Token Intelligence (powered by Atlas) handles the shared code-knowledge
          graph. Nothing leaves your machine — not your code, not your context, not your
          agent conversations.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Open source",
    body: (
      <p>
        Tempest is free and open source under the{" "}
        <a
          href="https://www.apache.org/licenses/LICENSE-2.0"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          Apache 2.0 license
        </a>
        . Use it, fork it, build on it, ship a modified version commercially — no
        restrictions. The source is on{" "}
        <a
          href="https://github.com/tempestai-dev/tempest"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          GitHub
        </a>
        . Issues, pull requests, and feedback are welcome.
      </p>
    ),
  },
  {
    eyebrow: "Status",
    body: (
      <p>
        Tempest is in active early development. Windows binaries are available now.
        macOS and Linux binaries are on the roadmap. Token Intelligence shipped in v0.1.2.
        Every release is documented in the{" "}
        <Link
          href="/release-notes"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          release notes
        </Link>
        .
      </p>
    ),
  },
];

export default function AboutPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
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

      <PageHero
        eyebrow="About"
        headline="Built for developers who run agents at scale."
        headlineMuted="Locally. In parallel."
        subhead="Tempest is an open-source desktop app for running AI coding agents in parallel — each isolated in its own git worktree, sharing one code-knowledge graph so token cost stays flat as sessions multiply."
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
              <a
                href="https://github.com/tempestai-dev/tempest"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon />
                View on GitHub
              </a>
            </Button>
          </>
        }
      />

      {sections.map(({ eyebrow, body }) => (
        <SectionShell key={eyebrow} eyebrow={eyebrow}>
          <div className="px-6 py-10 text-[15px] font-light leading-[1.7] text-white/80 sm:px-10 sm:py-12 lg:px-14">
            {body}
          </div>
        </SectionShell>
      ))}
    </main>
  );
}
