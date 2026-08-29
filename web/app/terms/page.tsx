import type { Metadata } from "next"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Terms of Service — Tempest",
  description: "Terms of service for tempestai.dev and the Tempest desktop application. The app is Apache 2.0 open source.",
  alternates: { canonical: `${SITE_URL}/terms` },
  openGraph: {
    title: "Terms of Service — Tempest",
    description: "Terms of service for tempestai.dev and the Tempest desktop application.",
    type: "website",
    url: `${SITE_URL}/terms`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest Terms of Service" }],
  },
}

const EFFECTIVE = "7 August 2026"

export default function TermsPage() {
  return (
    <main>
      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">LEGAL</p>
          <h1 className="text-3xl font-normal leading-snug mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-12">Effective {EFFECTIVE}</p>

          <div className="flex flex-col gap-10 text-base text-muted-foreground leading-relaxed">

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">The application</h2>
              <p>
                Tempest is free, open-source software released under the{" "}
                <a
                  href="https://www.apache.org/licenses/LICENSE-2.0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Apache License 2.0
                </a>
                . Your use of the Tempest application is governed by that license, not these
                terms. You may use, fork, modify, and distribute Tempest under the conditions
                of Apache 2.0.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">This website</h2>
              <p>
                By accessing tempestai.dev, you agree to use the site only for lawful purposes.
                You may not attempt to gain unauthorized access to any part of the site or its
                underlying infrastructure. You may not scrape the site in ways that degrade
                performance for other visitors.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">No warranties</h2>
              <p>
                Tempest is provided &ldquo;as is,&rdquo; without warranty of any kind, express
                or implied. We make no guarantees about uptime, fitness for a particular purpose,
                or absence of bugs. The Apache 2.0 license expressly disclaims all warranties.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Limitation of liability</h2>
              <p>
                To the maximum extent permitted by applicable law, the Tempest authors are not
                liable for any direct, indirect, incidental, special, or consequential damages
                arising from your use of the application or this website.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Third-party services</h2>
              <p>
                Tempest integrates with AI provider APIs (e.g., Anthropic, OpenAI) that you
                configure. Your use of those services is governed by each provider&apos;s own
                terms of service. We are not responsible for third-party service behavior,
                pricing, or availability.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Opt-in telemetry</h2>
              <p>
                The Tempest desktop app can send anonymous usage telemetry to help us prioritise
                what to build. Telemetry is <strong className="text-foreground">off by
                default</strong> and only runs after you explicitly enable it in Settings. By
                turning it on you consent to the collection described in our{" "}
                <a
                  href="/privacy"
                  className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
                >
                  Privacy Policy
                </a>
                . You can revoke consent at any time in the same Settings panel.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Changes</h2>
              <p>
                We reserve the right to modify these terms. The effective date at the top of
                this page indicates the most recent revision. Continued use of the site after
                changes constitutes acceptance of the updated terms. The Apache 2.0 license
                governing the app itself does not change.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground mb-3">Contact</h2>
              <p>
                Questions about these terms can be directed to our{" "}
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

          </div>
        </div>
      </Container>
    </main>
  )
}
