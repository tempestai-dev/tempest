import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/mdx'
import { SITE_URL } from '@/lib/constants/site'

// canonical base URL for all sitemap entries
const BASE = SITE_URL

async function getReleaseTagsWithDates(): Promise<{ tag: string; date: string }[]> {
  try {
    const res = await fetch('https://api.github.com/repos/tempestai-dev/tempest/releases', {
      headers: process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {},
      next: { revalidate: 43200 },
    })
    if (!res.ok) return []
    const releases: { tag_name: string; published_at: string; draft: boolean }[] = await res.json()
    return releases
      .filter((r) => !r.draft)
      .map((r) => ({ tag: r.tag_name, date: r.published_at }))
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/blog`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/download`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/release-notes`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/tempest-vs-conductor`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/tempest-vs-superset`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/tempest-vs-emdash`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/tempest-vs-agentsroom`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/tempest-vs-paseo`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/about`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/contact`, lastModified: new Date('2026-08-23') },
    { url: `${BASE}/privacy`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/terms`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/parallel-ai-agents`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/token-intelligence`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/how-it-works`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/compare`, lastModified: new Date('2026-07-25') },
    { url: `${BASE}/claude-code`, lastModified: new Date('2026-07-25') },
  ]

  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: new Date(post.date),
  }))

  const releases = await getReleaseTagsWithDates()
  const releaseRoutes: MetadataRoute.Sitemap = releases.map(({ tag, date }) => ({
    url: `${BASE}/release-notes/${encodeURIComponent(tag)}`,
    lastModified: new Date(date),
  }))

  return [...staticRoutes, ...postRoutes, ...releaseRoutes]
}
