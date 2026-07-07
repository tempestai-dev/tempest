import type { Metadata } from 'next'
import { Container } from '@/components/layout/container'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Download } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'
import { formatDate } from '@/lib/format-date'
import remarkGfm from 'remark-gfm'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>
}): Promise<Metadata> {
  const { tag } = await params
  const title = `Tempest ${tag} Release Notes`
  const description = `What's new in Tempest ${tag}. Full changelog, downloads, and release details.`
  return {
    title,
    description,
    alternates: { canonical: `https://tempestai.dev/release-notes/${encodeURIComponent(tag)}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://tempestai.dev/release-notes/${encodeURIComponent(tag)}`,
      images: [{ url: '/og-image.png', width: 1280, height: 640, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.png'],
    },
  }
}

export const revalidate = 43200

type ReleaseAsset = {
  name: string
  browser_download_url: string
  size: number
}

type GitHubRelease = {
  tag_name: string
  name: string
  published_at: string
  body: string
  prerelease: boolean
  html_url: string
  assets: ReleaseAsset[]
}

function githubHeaders(): HeadersInit {
  return process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}
}

export async function generateStaticParams() {
  try {
    const res = await fetch('https://api.github.com/repos/tempestai-dev/tempest/releases', {
      headers: githubHeaders(),
    })
    if (!res.ok) return []
    const releases: Pick<GitHubRelease, 'tag_name'>[] = await res.json()
    return releases.map((r) => ({ tag: r.tag_name }))
  } catch {
    return []
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function assetLabel(name: string): string {
  if (name.endsWith('.msi')) return 'MSI Installer'
  if (name.endsWith('.exe') && name.includes('setup')) return 'NSIS Installer'
  if (name.endsWith('.exe')) return 'Portable (.exe)'
  if (name.endsWith('.deb')) return 'Debian Package'
  if (name.endsWith('.AppImage')) return 'AppImage'
  if (name.endsWith('.dmg')) return 'Disk Image'
  return name
}

const mdxComponents = {
  h1: ({ children }: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-xl font-medium text-foreground mt-10 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="text-base font-medium text-foreground mt-10 mb-3 first:mt-0 pt-8 border-t border-foreground/[0.08]">{children}</h2>
  ),
  h3: ({ children }: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-sm font-medium text-foreground uppercase tracking-wide mt-8 mb-2">{children}</h3>
  ),
  p: ({ children }: ComponentPropsWithoutRef<'p'>) => (
    <p className="text-sm text-foreground leading-7 mb-4">{children}</p>
  ),
  ul: ({ children }: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mb-6 flex flex-col gap-2">{children}</ul>
  ),
  ol: ({ children }: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="mb-6 flex flex-col gap-2 list-none">{children}</ol>
  ),
  li: ({ children }: ComponentPropsWithoutRef<'li'>) => (
    <li className="flex gap-3 text-sm text-foreground leading-relaxed">
      <span className="mt-[0.45rem] size-1 rounded-full bg-foreground/25 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  code: ({ children }: ComponentPropsWithoutRef<'code'>) => (
    <code className="font-mono text-[13px] text-foreground bg-foreground/[0.06] border border-foreground/[0.08] rounded px-1.5 py-0.5">
      {children}
    </code>
  ),
  pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => (
    <pre className="bg-foreground/[0.04] border border-foreground/[0.08] rounded p-5 overflow-x-auto mb-6 text-[13px] font-mono text-foreground leading-6 [&_code]:bg-transparent [&_code]:border-none [&_code]:p-0 [&_code]:rounded-none [&_code]:text-inherit">
      {children}
    </pre>
  ),
  a: ({ href, children }: ComponentPropsWithoutRef<'a'>) => (
    <a
      href={href}
      className="text-foreground underline underline-offset-4 decoration-foreground/25 hover:decoration-foreground transition-colors"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  strong: ({ children }: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-medium text-foreground">{children}</strong>
  ),
  em: ({ children }: ComponentPropsWithoutRef<'em'>) => (
    <em className="italic text-foreground">{children}</em>
  ),
  blockquote: ({ children }: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="border-l-2 border-foreground/20 pl-4 my-4 [&_p]:text-foreground [&_p]:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-foreground/[0.08] my-10" />,
  table: ({ children }: ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: ComponentPropsWithoutRef<'thead'>) => (
    <thead className="border-b border-foreground/[0.12]">{children}</thead>
  ),
  tbody: ({ children }: ComponentPropsWithoutRef<'tbody'>) => (
    <tbody className="divide-y divide-foreground/[0.06]">{children}</tbody>
  ),
  tr: ({ children }: ComponentPropsWithoutRef<'tr'>) => (
    <tr className="hover:bg-foreground/[0.02] transition-colors">{children}</tr>
  ),
  th: ({ children }: ComponentPropsWithoutRef<'th'>) => (
    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide py-3 px-4 first:pl-0 last:pr-0">
      {children}
    </th>
  ),
  td: ({ children }: ComponentPropsWithoutRef<'td'>) => (
    <td className="text-foreground py-3 px-4 first:pl-0 last:pr-0">{children}</td>
  ),
}

type AssetGroup = { label: string; assets: ReleaseAsset[] }

function groupAssets(assets: ReleaseAsset[]): AssetGroup[] {
  const windows = assets.filter((a) => a.name.endsWith('.exe') || a.name.endsWith('.msi'))
  const linux = assets.filter((a) => a.name.endsWith('.deb') || a.name.endsWith('.AppImage'))
  const mac = assets.filter((a) => a.name.endsWith('.dmg') || a.name.endsWith('.tar.gz'))
  const groups: AssetGroup[] = []
  if (windows.length) groups.push({ label: 'Windows', assets: windows })
  if (linux.length) groups.push({ label: 'Linux', assets: linux })
  if (mac.length) groups.push({ label: 'macOS', assets: mac })
  return groups
}

export default async function ReleaseNotesPostPage({
  params,
}: {
  params: Promise<{ tag: string }>
}) {
  const { tag } = await params

  let release: GitHubRelease | null = null
  try {
    const res = await fetch(
      `https://api.github.com/repos/tempestai-dev/tempest/releases/tags/${encodeURIComponent(tag)}`,
      { headers: githubHeaders() }
    )
    if (res.ok) release = await res.json()
  } catch {}

  if (!release) notFound()

  const hasTitle = release.name && release.name !== release.tag_name
  const assetGroups = groupAssets(release.assets ?? [])

  const pageTitle = hasTitle ? release.name : `Tempest ${release.tag_name}`

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: pageTitle,
            description: `What's new in Tempest ${release.tag_name}. Full changelog, downloads, and release details.`,
            datePublished: release.published_at,
            author: { '@type': 'Organization', name: 'Tempest', url: 'https://tempestai.dev' },
            publisher: { '@type': 'Organization', name: 'Tempest', url: 'https://tempestai.dev' },
            mainEntityOfPage: `https://tempestai.dev/release-notes/${encodeURIComponent(release.tag_name)}`,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tempestai.dev' },
              { '@type': 'ListItem', position: 2, name: 'Release Notes', item: 'https://tempestai.dev/release-notes' },
              {
                '@type': 'ListItem',
                position: 3,
                name: `Tempest ${release.tag_name}`,
                item: `https://tempestai.dev/release-notes/${encodeURIComponent(release.tag_name)}`,
              },
            ],
          }),
        }}
      />
      <Container className="py-16 min-[1000px]:py-24">

        <Link
          href="/release-notes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-16"
        >
          <ArrowLeft size={14} />
          All releases
        </Link>

        <div className="grid grid-cols-1 min-[1000px]:grid-cols-[1fr_320px] gap-12 min-[1200px]:gap-20 items-start">

          {/* ── Content ──────────────────────────────── */}
          <div className="min-w-0 max-w-2xl">

            <div className="mb-12">
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <span className="font-mono text-sm text-muted-foreground">{release.tag_name}</span>
                {release.prerelease && (
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-foreground/[0.1]">
                    Pre-release
                  </span>
                )}
                <span className="text-muted-foreground/30 text-sm">·</span>
                <span className="text-sm text-muted-foreground">{formatDate(release.published_at)}</span>
              </div>

              <h1 className="text-3xl min-[700px]:text-4xl font-normal leading-snug">
                {hasTitle ? release.name : `Tempest ${release.tag_name}`}
              </h1>
            </div>

            {release.body ? (
              <MDXRemote
                source={release.body}
                components={mdxComponents}
                options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No release notes provided for this version.</p>
            )}

            <div className="mt-12 pt-8 border-t border-foreground/[0.08]">
              <a
                href={release.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                View on GitHub
                <ArrowRight size={14} />
              </a>
            </div>
          </div>

          {/* ── Sidebar ──────────────────────────────── */}
          <aside className="hidden min-[1000px]:block sticky top-24">
            <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">

              <div className="px-6 py-5 border-b border-foreground/[0.08]">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Downloads</p>
                <p className="text-base font-mono font-medium">{release.tag_name}</p>
              </div>

              {assetGroups.length > 0 ? (
                <div className="divide-y divide-foreground/[0.08]">
                  {assetGroups.map((group) => (
                    <div key={group.label} className="px-6 py-5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
                        {group.label}
                      </p>
                      <div className="flex flex-col gap-1">
                        {group.assets.map((asset) => (
                          <a
                            key={asset.browser_download_url}
                            href={asset.browser_download_url}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded hover:bg-foreground/[0.06] transition-colors group"
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Download size={13} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                              <span className="text-sm text-foreground truncate">{assetLabel(asset.name)}</span>
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              {formatBytes(asset.size)}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-5">
                  <p className="text-sm text-muted-foreground">No assets attached to this release.</p>
                </div>
              )}

            </div>
          </aside>

        </div>
      </Container>
    </main>
  )
}
