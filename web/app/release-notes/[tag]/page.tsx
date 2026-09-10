import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import remarkGfm from "remark-gfm";
import { SITE_URL } from "@/lib/constants/site";
import { Container } from "@/components/landing/container";
import { ProseShell } from "@/components/landing/prose-shell";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const title = `Tempest ${tag} Release Notes`;
  const description = `What's new in Tempest ${tag}. Full changelog, downloads, and release details.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/release-notes/${encodeURIComponent(tag)}` },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${SITE_URL}/release-notes/${encodeURIComponent(tag)}`,
      images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.webp"],
    },
  };
}

export const revalidate = 43200;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type GitHubRelease = {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  prerelease: boolean;
  html_url: string;
  assets: ReleaseAsset[];
};

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": "tempest-website",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function generateStaticParams() {
  try {
    const res = await fetch("https://api.github.com/repos/tempestai-dev/tempest/releases", {
      headers: githubHeaders(),
    });
    if (!res.ok) return [];
    const releases: Pick<GitHubRelease, "tag_name">[] = await res.json();
    return releases.map((r) => ({ tag: r.tag_name }));
  } catch {
    return [];
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assetLabel(name: string): string {
  if (name.endsWith(".msi")) return "MSI Installer";
  if (name.endsWith(".exe") && name.includes("setup")) return "NSIS Installer";
  if (name.endsWith(".exe")) return "Portable (.exe)";
  if (name.endsWith(".deb")) return "Debian Package";
  if (name.endsWith(".AppImage")) return "AppImage";
  if (name.endsWith(".dmg")) return "Disk Image";
  return name;
}

type AssetGroup = { label: string; assets: ReleaseAsset[] };

function groupAssets(assets: ReleaseAsset[]): AssetGroup[] {
  const windows = assets.filter((a) => a.name.endsWith(".exe") || a.name.endsWith(".msi"));
  const linux = assets.filter((a) => a.name.endsWith(".deb") || a.name.endsWith(".AppImage"));
  const mac = assets.filter((a) => a.name.endsWith(".dmg") || a.name.endsWith(".tar.gz"));
  const groups: AssetGroup[] = [];
  if (windows.length) groups.push({ label: "Windows", assets: windows });
  if (linux.length) groups.push({ label: "Linux", assets: linux });
  if (mac.length) groups.push({ label: "macOS", assets: mac });
  return groups;
}

export default async function ReleaseNotesPostPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;

  let release: GitHubRelease | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/tempestai-dev/tempest/releases/tags/${encodeURIComponent(tag)}`,
      { headers: githubHeaders() }
    );
    if (res.ok) release = await res.json();
  } catch {}

  if (!release) notFound();

  const hasTitle = release.name && release.name !== release.tag_name;
  const assetGroups = groupAssets(release.assets ?? []);
  const pageTitle = hasTitle ? release.name : `Tempest ${release.tag_name}`;

  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: pageTitle,
            description: `What's new in Tempest ${release.tag_name}. Full changelog, downloads, and release details.`,
            datePublished: release.published_at,
            image: {
              "@type": "ImageObject",
              url: `${SITE_URL}/og-image.webp`,
              width: 1280,
              height: 640,
            },
            author: { "@type": "Organization", name: "Tempest", url: SITE_URL },
            publisher: {
              "@type": "Organization",
              name: "Tempest",
              url: SITE_URL,
              logo: {
                "@type": "ImageObject",
                url: `${SITE_URL}/og-image.webp`,
                width: 1280,
                height: 640,
              },
            },
            mainEntityOfPage: `${SITE_URL}/release-notes/${encodeURIComponent(release.tag_name)}`,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Release Notes", item: `${SITE_URL}/release-notes` },
              {
                "@type": "ListItem",
                position: 3,
                name: `Tempest ${release.tag_name}`,
                item: `${SITE_URL}/release-notes/${encodeURIComponent(release.tag_name)}`,
              },
            ],
          }),
        }}
      />

      <Container className="mt-24 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
        <div className="flex flex-col gap-6 px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
          <Link
            href="/release-notes"
            className="inline-flex w-fit items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.12em] text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft size={12} />
            All releases
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-white/50">
            <span className="font-mono text-white/70">{release.tag_name}</span>
            {release.prerelease && (
              <span className="border border-dashed border-white/25 bg-white/[0.03] px-2 py-1 text-white/70">
                Pre-release
              </span>
            )}
            <span className="size-1 rounded-full bg-white/25" />
            <span>{formatDate(release.published_at)}</span>
          </div>
          <h1 className="max-w-3xl font-pixel text-[32px] leading-[1.05] tracking-[-0.02em] text-white sm:text-[42px] md:text-[52px]">
            {hasTitle ? release.name : `Tempest ${release.tag_name}`}
          </h1>
        </div>
      </Container>

      <ProseShell>
        {release.body ? (
          <MDXRemote
            source={release.body}
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
          />
        ) : (
          <p>No release notes provided for this version.</p>
        )}
        <hr />
        <div className="not-prose">
          <Button
            asChild
            compact
            mono
            variant="secondary"
            className="h-10 gap-2 px-3 text-[12px] font-semibold"
          >
            <a href={release.html_url} target="_blank" rel="noopener noreferrer">
              View on GitHub
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </ProseShell>

      {assetGroups.length > 0 && (
        <SectionShell eyebrow="Downloads" title={release.tag_name}>
          <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {assetGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-3 p-6 sm:p-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                  {group.label}
                </p>
                <div className="flex flex-col gap-1.5">
                  {group.assets.map((asset) => (
                    <a
                      key={asset.browser_download_url}
                      href={asset.browser_download_url}
                      className="group flex items-center justify-between gap-3 border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/40 hover:bg-white/[0.05]"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[13px] font-mono text-white/70 group-hover:text-white">
                        <Download size={13} className="shrink-0" />
                        <span className="truncate">{assetLabel(asset.name)}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-white/50">
                        {formatBytes(asset.size)}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionShell>
      )}
    </main>
  );
}
