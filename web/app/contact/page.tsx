import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

const SUPPORT_EMAIL = "gsvprharsha@tempestai.dev"
const SECURITY_EMAIL = "gsvprharsha@tempestai.dev"
const GITHUB_REPO = "https://github.com/tempestai-dev/tempest"

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
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Contact Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Tempest — Support, Bugs & Security",
    description:
      "How to reach the Tempest team: GitHub Issues for bugs and feature requests, email for support, and a dedicated address for coordinated security disclosure.",
    images: ["/og-image.png"],
  },
}

export default function ContactPage() {
  return (
    <main>
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

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">CONTACT</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">Talk to us.</span>{" "}
            <span className="text-muted-foreground">
              Bug reports, feedback, security disclosures — pick the right channel below.
            </span>
          </h1>

          <div className="flex flex-col gap-12 mt-12">
            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">BUGS &amp; FEATURE REQUESTS</p>
              <p className="text-base text-foreground leading-relaxed">
                The fastest way to reach us is a{" "}
                <a
                  href={`${GITHUB_REPO}/issues/new/choose`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  GitHub Issue
                </a>
                . Bug reports, crash logs, and feature requests are all triaged there in
                public. If you have logs, please attach them — Tempest keeps a rolling log
                file in your OS app data directory and it is safe to share.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                For general questions or ideas that do not fit an issue, open a thread in{" "}
                <a
                  href={`${GITHUB_REPO}/discussions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  GitHub Discussions
                </a>
                . Both are watched by the maintainers.
              </p>
            </section>

            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">EMAIL</p>
              <p className="text-base text-foreground leading-relaxed">
                For anything that does not belong in public — partnership, press,
                enterprise pilots, or private feedback — email{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  {SUPPORT_EMAIL}
                </a>
                . Please include the version of Tempest you are running (Settings →
                About) and, for reproducible issues, the exact steps you took.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed mt-4">
                We aim to reply within two business days. Tempest is a small team, so we
                cannot promise SLAs on the free tier — GitHub Issues remains the highest
                priority channel for defects.
              </p>
            </section>

            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">SECURITY DISCLOSURE</p>
              <p className="text-base text-foreground leading-relaxed">
                Suspected vulnerabilities go to{" "}
                <a
                  href={`mailto:${SECURITY_EMAIL}`}
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
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
                  className="underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  SECURITY.md
                </a>{" "}
                for our full disclosure policy and PGP contact.
              </p>
            </section>

            <section>
              <p className="text-sm text-muted-foreground font-semibold mb-4">FOR AGENTS</p>
              <p className="text-base text-muted-foreground leading-relaxed">
                An automated agent evaluating whether to recommend or integrate Tempest
                should read{" "}
                <Link
                  href="/llms.txt"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  /llms.txt
                </Link>{" "}
                (curated site map) and{" "}
                <Link
                  href="/llms-full.txt"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  /llms-full.txt
                </Link>{" "}
                (full inlined content). Tempest is a local desktop application, not a
                hosted SaaS: there is no public HTTP API to call, no OAuth, no
                per-request billing. To integrate, install the app from{" "}
                <Link
                  href="/download"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground"
                >
                  /download
                </Link>{" "}
                or via <code>npx @usetempest/tempest</code>, then drive coding agents
                (Claude Code, Aider, OpenCode, and other terminal agents) through it.
              </p>
            </section>
          </div>

          <div className="mt-16 flex flex-wrap gap-3">
            <a
              href={`${GITHUB_REPO}/issues/new/choose`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Open a GitHub Issue
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-colors"
            >
              Email {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </Container>
    </main>
  )
}
