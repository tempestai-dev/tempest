import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export const metadata: Metadata = {
  title: "Tempest Release Notes — AI Agent Runner Changelog",
  description:
    "Every version, every improvement. Full changelog and release history for Tempest.",
  alternates: { canonical: `${SITE_URL}/release-notes` },
  openGraph: {
    title: "Tempest Release Notes — AI Agent Runner Changelog",
    description:
      "Every version, every improvement. Full changelog and release history for Tempest.",
    type: "website",
    url: `${SITE_URL}/release-notes`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest Release Notes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest Release Notes — AI Agent Runner Changelog",
    description:
      "Every version, every improvement. Full changelog and release history for Tempest.",
    images: ["/og-image.webp"],
  },
};

export const revalidate = 43200;

type GitHubRelease = {
  id: number;
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
};

export default async function ReleaseNotesPage() {
  let releases: GitHubRelease[] = [];

  try {
    const headers: Record<string, string> = {
      "User-Agent": "tempest-website",
      Accept: "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch("https://api.github.com/repos/tempestai-dev/tempest/releases", {
      headers,
      next: { revalidate: 43200 },
    });
    if (res.ok) {
      const all: GitHubRelease[] = await res.json();
      releases = all.filter((r) => !r.draft);
    }
  } catch {}

  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <PageHero
        eyebrow="Release notes"
        headline="What's new in Tempest."
        headlineMuted="Every version, every improvement."
        subhead="Full changelog and release history for the desktop app."
        actions={
          <Button
            asChild
            compact
            mono
            variant="secondary"
            className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
          >
            <a
              href="https://github.com/tempestai-dev/tempest/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub releases
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        }
      />

      {releases.length === 0 ? (
        <SectionShell eyebrow="Unavailable">
          <div className="flex flex-col items-start gap-3 px-6 py-10 sm:px-10 sm:py-12">
            <p className="text-[15px] font-light text-white/70">
              Release notes are temporarily unavailable.
            </p>
            <Button
              asChild
              compact
              mono
              variant="secondary"
              className="h-10 gap-2 px-3 text-[12px] font-semibold"
            >
              <a
                href="https://github.com/tempestai-dev/tempest/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </SectionShell>
      ) : (
        <SectionShell eyebrow="History" title={`${releases.length} release${releases.length === 1 ? "" : "s"}`}>
          <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 min-[700px]:grid-cols-2 min-[700px]:divide-y-0 min-[1000px]:grid-cols-3">
            {releases.map((release, i) => {
              const smCol = i % 2;
              const lgCol = i % 3;
              return (
                <Link
                  key={release.id}
                  href={`/release-notes/${release.tag_name}`}
                  className={
                    "group flex flex-col justify-between gap-6 p-6 sm:p-8 border-dashed border-white/15 transition-colors hover:bg-white/[0.02] " +
                    (smCol > 0 ? "min-[700px]:border-l " : "") +
                    (i >= 2 && lgCol === 0 ? "min-[1000px]:border-t " : "") +
                    (i >= 2 && lgCol > 0 ? "min-[1000px]:border-t min-[1000px]:border-l " : "") +
                    (i < 2 && lgCol > 0 ? "min-[1000px]:border-l " : "")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                      <span className="font-pixel text-[22px] leading-none tracking-[-0.02em] text-white">
                        {release.tag_name}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.12em] text-white/50">
                        {formatDate(release.published_at)}
                      </span>
                    </div>
                    {release.prerelease && (
                      <span className="shrink-0 border border-dashed border-white/25 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60">
                        pre
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-white/50 group-hover:text-white">
                    Read notes
                    <ArrowRight
                      size={13}
                      strokeWidth={2}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </SectionShell>
      )}
    </main>
  );
}
