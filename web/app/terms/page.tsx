import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { ProseShell } from "@/components/landing/prose-shell";

export const metadata: Metadata = {
  title: "Terms of Service — Tempest",
  description:
    "Terms of service for tempestai.dev and the Tempest desktop application. The app is Apache 2.0 open source.",
  alternates: { canonical: `${SITE_URL}/terms` },
  openGraph: {
    title: "Terms of Service — Tempest",
    description: "Terms of service for tempestai.dev and the Tempest desktop application.",
    type: "website",
    url: `${SITE_URL}/terms`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest Terms of Service" }],
  },
};

const EFFECTIVE = "7 August 2026";

export default function TermsPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <PageHero
        eyebrow={`Legal · Effective ${EFFECTIVE}`}
        headline="Terms of Service."
        headlineMuted="The app is Apache 2.0. The website is these terms."
      />

      <ProseShell>
        <h2>The application</h2>
        <p>
          Tempest is free, open-source software released under the{" "}
          <a
            href="https://www.apache.org/licenses/LICENSE-2.0"
            target="_blank"
            rel="noopener noreferrer"
          >
            Apache License 2.0
          </a>
          . Your use of the Tempest application is governed by that license, not these terms. You
          may use, fork, modify, and distribute Tempest under the conditions of Apache 2.0.
        </p>

        <h2>This website</h2>
        <p>
          By accessing tempestai.dev, you agree to use the site only for lawful purposes. You may
          not attempt to gain unauthorized access to any part of the site or its underlying
          infrastructure. You may not scrape the site in ways that degrade performance for other
          visitors.
        </p>

        <h2>No warranties</h2>
        <p>
          Tempest is provided &ldquo;as is,&rdquo; without warranty of any kind, express or
          implied. We make no guarantees about uptime, fitness for a particular purpose, or absence
          of bugs. The Apache 2.0 license expressly disclaims all warranties.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by applicable law, the Tempest authors are not liable for
          any direct, indirect, incidental, special, or consequential damages arising from your use
          of the application or this website.
        </p>

        <h2>Third-party services</h2>
        <p>
          Tempest integrates with AI provider APIs (e.g., Anthropic, OpenAI) that you configure.
          Your use of those services is governed by each provider&apos;s own terms of service. We
          are not responsible for third-party service behavior, pricing, or availability.
        </p>

        <h2>Opt-in telemetry</h2>
        <p>
          The Tempest desktop app can send anonymous usage telemetry to help us prioritise what to
          build. Telemetry is <strong>off by default</strong> and only runs after you explicitly
          enable it in Settings. By turning it on you consent to the collection described in our{" "}
          <a href="/privacy">Privacy Policy</a>. You can revoke consent at any time in the same
          Settings panel.
        </p>

        <h2>Changes</h2>
        <p>
          We reserve the right to modify these terms. The effective date at the top of this page
          indicates the most recent revision. Continued use of the site after changes constitutes
          acceptance of the updated terms. The Apache 2.0 license governing the app itself does
          not change.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can be directed to our{" "}
          <a
            href="https://github.com/tempestai-dev/tempest"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub repository
          </a>
          .
        </p>
      </ProseShell>
    </main>
  );
}
