import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";
import { GithubIcon } from "@/components/icons/github";

const SUPPORT_EMAIL = "gsvprharsha@tempestai.dev";
const SECURITY_EMAIL = "gsvprharsha@tempestai.dev";
const GITHUB_REPO = "https://github.com/tempestai-dev/tempest";

export const metadata: Metadata = {
  title: "Contact Tempest — Support, Bugs & Security",
  description:
    "How to reach the Tempest team: GitHub Issues for bugs and feature requests, email for support, and a dedicated address for coordinated security disclosure.",
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: "Contact Tempest — Support, Bugs & Security",
    description:
      "How to reach the Tempest team: GitHub Issues for bugs and feature requests, email for support, and a dedicated address for coordinated security disclosure.",
    type: "website",
    url: `${SITE_URL}/contact`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Contact Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Tempest — Support, Bugs & Security",
    description:
      "How to reach the Tempest team: GitHub Issues for bugs and feature requests, email for support, and a dedicated address for coordinated security disclosure.",
    images: ["/og-image.webp"],
  },
};

const sections: { eyebrow: string; body: React.ReactNode }[] = [
  {
    eyebrow: "Bugs & feature requests",
    body: (
      <>
        <p>
          The fastest way to reach us is a{" "}
          <a
            href={`${GITHUB_REPO}/issues/new/choose`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
          >
            GitHub Issue
          </a>
          . Bug reports, crash logs, and feature requests are all triaged there in
          public. If you have logs, please attach them — Tempest keeps a rolling log
          file in your OS app data directory and it is safe to share.
        </p>
        <p className="mt-4 text-white/60">
          For general questions or ideas that do not fit an issue, open a thread in{" "}
          <a
            href={`${GITHUB_REPO}/discussions`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
          >
            GitHub Discussions
          </a>
          . Both are watched by the maintainers.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Email",
    body: (
      <>
        <p>
          For anything that does not belong in public — partnership, press,
          enterprise pilots, or private feedback — email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
          >
            {SUPPORT_EMAIL}
          </a>
          . Please include the version of Tempest you are running (Settings →
          About) and, for reproducible issues, the exact steps you took.
        </p>
        <p className="mt-4 text-white/60">
          We aim to reply within two business days. Tempest is a small team, so we
          cannot promise SLAs on the free tier — GitHub Issues remains the highest
          priority channel for defects.
        </p>
      </>
    ),
  },
  {
    eyebrow: "Security disclosure",
    body: (
      <p>
        Suspected vulnerabilities go to{" "}
        <a
          href={`mailto:${SECURITY_EMAIL}`}
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          {SECURITY_EMAIL}
        </a>
        . Do not open a public issue for security problems until we have had a
        chance to patch. Please share a proof of concept, affected versions, and
        your suggested severity. See{" "}
        <a
          href={`${GITHUB_REPO}/security/policy`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          SECURITY.md
        </a>{" "}
        for our full disclosure policy and PGP contact.
      </p>
    ),
  },
  {
    eyebrow: "For agents",
    body: (
      <p>
        An automated agent evaluating whether to recommend or integrate Tempest
        should read{" "}
        <Link
          href="/llms.txt"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          /llms.txt
        </Link>{" "}
        (curated site map) and{" "}
        <Link
          href="/llms-full.txt"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          /llms-full.txt
        </Link>{" "}
        (full inlined content). Tempest is a local desktop application, not a
        hosted SaaS: there is no public HTTP API to call, no OAuth, no
        per-request billing. To integrate, install the app from{" "}
        <Link
          href="/download"
          className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/70"
        >
          /download
        </Link>{" "}
        or via <code className="font-mono text-white">npx @usetempest/tempest</code>,
        then drive coding agents (Claude Code, Aider, OpenCode, and other terminal
        agents) through it.
      </p>
    ),
  },
];

export default function ContactPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ContactPage",
            name: "Contact Tempest",
            url: `${SITE_URL}/contact`,
            description:
              "How to reach the Tempest team for support, bug reports, feature requests, and security disclosure.",
            mainEntity: { "@id": `${SITE_URL}/#organization` },
          }),
        }}
      />

      <PageHero
        eyebrow="Contact"
        headline="Talk to us."
        headlineMuted="Bug reports, feedback, security — pick the right channel."
        subhead="GitHub Issues get triaged in public. Email is for anything that does not belong there."
        actions={
          <>
            <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
              <a
                href={`${GITHUB_REPO}/issues/new/choose`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon />
                Open an Issue
              </a>
            </Button>
            <Button
              asChild
              compact
              mono
              variant="secondary"
              className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
            >
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                Email us
                <ArrowRight data-icon="inline-end" />
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
