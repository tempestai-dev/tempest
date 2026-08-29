import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Privacy Policy — Tempest",
  description: "Tempest is local-first. Your code never leaves your machine. This privacy policy covers the opt-in telemetry the desktop app can send and what we collect on the website.",
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: {
    title: "Privacy Policy — Tempest",
    description: "Tempest is local-first. Your code never leaves your machine.",
    type: "website",
    url: `${SITE_URL}/privacy`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest Privacy Policy" }],
  },
}

const EFFECTIVE = "7 August 2026"

export default function PrivacyPage() {
  return (
    <main>
      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">LEGAL</p>
          <h1 className="text-3xl font-normal leading-snug mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-12">Effective {EFFECTIVE}</p>

          <div className="flex flex-col gap-10 text-base text-muted-foreground leading-relaxed">

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">The short version</h2>
              <p>
                Tempest the app is local-first. Your code, agent conversations, prompts, and
                repository data never leave your machine. We do not have servers that see your
                codebase.
              </p>
              <p className="mt-3">
                The app can send <strong className="text-foreground">anonymous usage
                telemetry</strong> to help us prioritise what to build — but only if you turn it
                on. It is off by default. No code, prompts, file names, or personal information
                are ever included.
              </p>
              <p className="mt-3">
                The website (tempestai.dev) collects anonymous analytics via Vercel Analytics
                (always on) and Google Analytics (only if you accept the cookie banner). No
                personal information is sold.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">What the app collects (opt-in telemetry)</h2>
              <p>
                The desktop app ships with usage telemetry <strong className="text-foreground">disabled
                by default</strong>. Nothing is loaded, initialised, or sent until you explicitly
                enable it in Settings. If you turn it off later, capture stops immediately and the
                local analytics state is reset.
              </p>
              <p className="mt-3">
                When enabled, telemetry is sent to <strong className="text-foreground">PostHog</strong>{" "}
                (posthog.com) — a product analytics service — under an anonymous, randomly
                generated ID stored locally on your machine. We never call PostHog&apos;s{" "}
                <code className="text-foreground text-sm">identify()</code>, so the ID is never
                linked to an email, name, or account. Autocapture, page views, and session
                recording are all explicitly disabled.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">What is sent</strong> when telemetry is on:
              </p>
              <ul className="mt-2 ml-5 list-disc space-y-1">
                <li>An anonymous UUID minted on first opt-in and stored in your local Tempest database.</li>
                <li>App version (e.g. <code className="text-foreground text-sm">0.1.2</code>).</li>
                <li>Coarse OS bucket: <code className="text-foreground text-sm">windows</code>, <code className="text-foreground text-sm">macos</code>, <code className="text-foreground text-sm">linux</code>, or <code className="text-foreground text-sm">other</code>.</li>
                <li>Whether Atlas (semantic code search) is enabled — boolean only.</li>
                <li>
                  Product events with no free-text content, such as: app opened, onboarding
                  finished, feature used (which feature — e.g. <code className="text-foreground text-sm">canvas</code>, <code className="text-foreground text-sm">chat</code>, <code className="text-foreground text-sm">pr</code>, <code className="text-foreground text-sm">atlas</code>, <code className="text-foreground text-sm">command_palette</code>), session created,
                  agent turn completed (which agent), project added (whether it is a git repo),
                  update failed / feature failed (a fixed error category, never the error
                  message), and crash detection (error kind, never the stack trace or message).
                </li>
                <li>
                  Your IP address is used by PostHog server-side to derive approximate country
                  and is not stored on the event. No precise location is collected.
                </li>
              </ul>
              <p className="mt-3">
                <strong className="text-foreground">What is never sent:</strong> your code,
                prompts, agent output, chat contents, file paths, file names, repository names,
                branch names, commit messages, API keys, environment variables, error messages,
                stack traces, screen contents, keystrokes, or any personally identifiable
                information.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Other outbound requests from the app</h2>
              <p>
                Independent of telemetry, the app makes network requests to:
              </p>
              <ul className="mt-2 ml-5 list-disc space-y-1">
                <li>GitHub, to fetch release information for update checks.</li>
                <li>
                  AI provider APIs you configure (e.g. Anthropic for Claude Code, OpenAI, etc.),
                  using credentials you supply. These requests go directly from your machine to
                  the provider — Tempest does not proxy them.
                </li>
                <li>
                  If you enable Atlas semantic search, a one-time download of the embedding
                  model (~25&nbsp;MB) from its public host.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">What the website collects</h2>
              <p>
                <strong className="text-foreground">Vercel Analytics.</strong> Anonymised page
                view data — page visited, referrer, country, device type, browser. No IP
                addresses are stored. No cookies are set. Data is aggregated and not linked to
                individuals.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Google Analytics (GA4).</strong> Loaded only
                if you click &ldquo;Accept&rdquo; on the cookie banner. GA4 sets cookies and
                collects standard analytics data including a client identifier, page interactions,
                approximate location, and device information. If you click &ldquo;Decline&rdquo;
                (or ignore the banner), GA4 is not loaded and no GA cookies are set.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Cookie consent preference.</strong> Your
                accept/decline choice is stored in <code className="text-foreground text-sm">localStorage</code>{" "}
                on your device under the key <code className="text-foreground text-sm">cookie-consent</code>.
                To change it, clear that key from your browser storage.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Third-party services</h2>
              <p>
                The website is hosted on Vercel. Vercel may log standard server access data (IP
                addresses, request headers) as part of normal hosting infrastructure. See{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Vercel&apos;s privacy policy
                </a>
                . App telemetry, when enabled, is processed by{" "}
                <a
                  href="https://posthog.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  PostHog
                </a>
                . Website analytics, when you accept the cookie banner, is processed by{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Google
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Your choices and rights</h2>
              <p>
                <strong className="text-foreground">Turn app telemetry off</strong> at any time
                from Settings inside Tempest. Doing so halts capture immediately and resets the
                local analytics state. Because the ID is anonymous and never linked to your
                identity, there is nothing tied to &ldquo;you&rdquo; for us to look up or export.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Website analytics:</strong> click
                &ldquo;Decline&rdquo; on the cookie banner (or clear the{" "}
                <code className="text-foreground text-sm">cookie-consent</code> key) to keep GA4
                off. Vercel Analytics is cookieless and aggregate-only.
              </p>
              <p className="mt-3">
                Questions or requests can be raised as an issue on our{" "}
                <a
                  href="https://github.com/tempestai-dev/tempest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  GitHub repository
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Changes</h2>
              <p>
                We may update this policy as the product evolves. The effective date at the top
                indicates the most recent revision. Continued use after changes constitutes
                acceptance of the updated policy. See also our{" "}
                <Link
                  href="/terms"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Terms of Service
                </Link>
                .
              </p>
            </section>

          </div>
        </div>
      </Container>
    </main>
  )
}
