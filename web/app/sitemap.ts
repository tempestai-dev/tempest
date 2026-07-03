import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/mdx'

const BASE = 'https://tempestai.dev'

async function getReleaseTagsWithDates(): Promise<{ tag: string; date: string }[]> {
  try {
    const res = await fetch('https://api.github.com/repos/gsvprharsha/tempest/releases', {
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
    { url: BASE, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/download`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/release-notes`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ]

  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const releases = await getReleaseTagsWithDates()
  const releaseRoutes: MetadataRoute.Sitemap = releases.map(({ tag, date }) => ({
    url: `${BASE}/release-notes/${encodeURIComponent(tag)}`,
    lastModified: new Date(date),
    changeFrequency: 'never',
    priority: 0.6,
  }))

  return [...staticRoutes, ...postRoutes, ...releaseRoutes]
}
