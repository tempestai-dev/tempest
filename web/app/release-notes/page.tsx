import type { Metadata } from 'next'
import { Container } from '@/components/layout/container'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/format-date'

export const metadata: Metadata = {
  title: 'Release Notes — Tempest',
  description: 'Every version, every improvement. Full changelog and release history for Tempest.',
  alternates: { canonical: 'https://tempestai.dev/release-notes' },
  openGraph: {
    title: 'Release Notes — Tempest',
    description: 'Every version, every improvement. Full changelog and release history for Tempest.',
    type: 'website',
    url: 'https://tempestai.dev/release-notes',
    images: [{ url: '/og-image.png', width: 1280, height: 640, alt: 'Tempest Release Notes' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Release Notes — Tempest',
    description: 'Every version, every improvement. Full changelog and release history for Tempest.',
    images: ['/og-image.png'],
  },
}

export const revalidate = 43200

type GitHubRelease = {
  id: number
  tag_name: string
  name: string
  published_at: string
  prerelease: boolean
  draft: boolean
}

export default async function ReleaseNotesPage() {
  let releases: GitHubRelease[] = []

  try {
    const res = await fetch('https://api.github.com/repos/gsvprharsha/tempest/releases', {
      headers: process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {},
    })
    if (res.ok) {
      const all: GitHubRelease[] = await res.json()
      releases = all.filter((r) => !r.draft)
    }
  } catch {}

  return (
    <main>
      <Container className="py-16 min-[1000px]:py-24">
        <div className="mb-12">
          <p className="text-sm text-muted-foreground uppercase tracking-widest mb-3">Release Notes</p>
          <h1 className="text-3xl min-[700px]:text-4xl font-normal">
            What&apos;s new in Tempest
          </h1>
          <p className="text-muted-foreground mt-4 max-w-lg">
            Every version, every improvement. Track what we ship.
          </p>
        </div>

        {releases.length === 0 ? (
          <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-36 rounded bg-foreground/[0.06]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3 gap-4">
            {releases.map((release) => (
              <Link
                key={release.id}
                href={`/release-notes/${release.tag_name}`}
                className="group rounded border border-foreground/[0.08] bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/20 transition-colors p-6 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-normal">{release.tag_name}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(release.published_at)}</span>
                  </div>
                  {release.prerelease && (
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-foreground/[0.1] shrink-0">
                      pre
                    </span>
                  )}
                </div>

                <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground transition-colors mt-auto">
                  Read notes <ArrowRight size={13} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  )
}
