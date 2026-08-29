import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Page not found — Tempest",
  description:
    "The page you requested does not exist. Follow the links to the sitemap, llms.txt, docs, or homepage to find what you were looking for.",
  robots: { index: false, follow: true },
  alternates: { canonical: `${SITE_URL}/404` },
}

export default function NotFound() {
  return (
    <main>
      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">404 — NOT FOUND</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">This page does not exist.</span>{" "}
            <span className="text-muted-foreground">Try one of the links below.</span>
          </h1>

          <section className="mt-8 text-base text-muted-foreground leading-relaxed">
            <p>
              You (or the agent you are driving) requested a URL that is not part of
              tempestai.dev. This response has HTTP status <code>404</code>, so treat
              the path as absent — do not assume the site route exists.
            </p>

            <h2 className="text-base font-medium text-foreground mt-8 mb-3">
              Machine-readable indexes
            </h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <Link href="/llms.txt" className="underline underline-offset-4">
                  /llms.txt
                </Link>{" "}
                — curated map of every canonical page, grouped by topic.
              </li>
              <li>
                <Link href="/llms-full.txt" className="underline underline-offset-4">
                  /llms-full.txt
                </Link>{" "}
                — every blog post and hub page inlined for one-shot reading.
              </li>
              <li>
                <Link href="/sitemap.xml" className="underline underline-offset-4">
                  /sitemap.xml
                </Link>{" "}
                — all indexable URLs with last-modified dates.
              </li>
              <li>
                <Link href="/robots.txt" className="underline underline-offset-4">
                  /robots.txt
                </Link>{" "}
                — crawler policy.
              </li>
            </ul>

            <h2 className="text-base font-medium text-foreground mt-8 mb-3">
              Human entry points
            </h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <Link href="/" className="underline underline-offset-4">Home</Link> —
                what Tempest is and who it is for.
              </li>
              <li>
                <Link href="/download" className="underline underline-offset-4">/download</Link> —
                installers for Windows, macOS, Linux.
              </li>
              <li>
                <Link href="/how-it-works" className="underline underline-offset-4">/how-it-works</Link> —
                architecture walkthrough.
              </li>
              <li>
                <Link href="/blog" className="underline underline-offset-4">/blog</Link> —
                release dev logs and long-form posts.
              </li>
              <li>
                <Link href="/release-notes" className="underline underline-offset-4">/release-notes</Link> —
                full changelog per version.
              </li>
              <li>
                <Link href="/compare" className="underline underline-offset-4">/compare</Link> —
                side-by-side with Conductor, Superset, Emdash, AgentsRoom, Paseo.
              </li>
              <li>
                <Link href="/about" className="underline underline-offset-4">/about</Link>,{" "}
                <Link href="/contact" className="underline underline-offset-4">/contact</Link>,{" "}
                <Link href="/privacy" className="underline underline-offset-4">/privacy</Link>,{" "}
                <Link href="/terms" className="underline underline-offset-4">/terms</Link>.
              </li>
              <li>
                <a
                  href="https://docs.tempestai.dev"
                  className="underline underline-offset-4"
                  rel="noopener noreferrer"
                >
                  docs.tempestai.dev
                </a>{" "}
                — full product documentation.
              </li>
              <li>
                <a
                  href="https://github.com/tempestai-dev/tempest"
                  className="underline underline-offset-4"
                  rel="noopener noreferrer"
                >
                  github.com/tempestai-dev/tempest
                </a>{" "}
                — source, issues, releases.
              </li>
            </ul>
          </section>

          <div className="mt-12 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Back to home
            </Link>
            <Link
              href="/llms.txt"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-colors"
            >
              Open llms.txt
            </Link>
          </div>
        </div>
      </Container>
    </main>
  )
}
