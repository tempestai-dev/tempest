import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import fs from 'fs'
import path from 'path'
import { Container } from '@/components/layout/container'
import { formatDate } from '@/lib/format-date'
import { getAllPosts } from '@/lib/mdx'
import type { BlogPost } from '@/lib/mdx'

function getCoverPath(slug: string): string | null {
  const dir = path.join(process.cwd(), 'public', 'blog-pics', slug)
  for (const ext of ['webp', 'png', 'jpg']) {
    if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`
  }
  return null
}

export const metadata: Metadata = {
  title: 'Blog — Tempest',
  description:
    'Writing about parallel AI agents, token efficiency, open-source tooling, and how we build Tempest.',
  alternates: { canonical: 'https://tempestai.dev/blog' },
  openGraph: {
    title: 'Blog — Tempest',
    description:
      'Writing about parallel AI agents, token efficiency, open-source tooling, and how we build Tempest.',
    type: 'website',
    url: 'https://tempestai.dev/blog',
    images: [{ url: '/og-image.png', width: 1280, height: 640, alt: 'Tempest Blog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog — Tempest',
    description: 'Writing about parallel AI agents, token efficiency, open-source tooling, and how we build Tempest.',
    images: ['/og-image.png'],
  },
}

const filters = [
  { label: 'All', type: undefined, href: '/blog' },
  { label: 'Blog', type: 'blog', href: '/blog?type=blog' },
  { label: 'Dev Log', type: 'dev-log', href: '/blog?type=dev-log' },
  { label: 'Release Notes', type: 'release-notes', href: '/blog?type=release-notes' },
] as const

function typeLabel(type: BlogPost['type']): string {
  if (type === 'dev-log') return 'Dev Log'
  if (type === 'release-notes') return 'Release Notes'
  return 'Blog'
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  const posts = getAllPosts()

  const visible = posts.filter((post) => {
    if (type === 'blog') return post.type === 'blog'
    if (type === 'dev-log') return post.type === 'dev-log'
    if (type === 'release-notes') return post.type === 'release-notes'
    return true
  })

  return (
    <main>
      <Container className="pt-16 min-[1000px]:pt-24 pb-20">
        <p className="text-sm text-muted-foreground font-semibold mb-3">BLOG</p>
        <h1 className="text-2xl min-[1000px]:text-3xl font-normal">
          <span className="text-foreground">From the team.</span>{' '}
          <span className="text-muted-foreground">What we&apos;re building and why.</span>
        </h1>

        <div className="flex gap-2 mt-8 mb-10">
          {filters.map((filter) => {
            const isActive = filter.type === type || (!type && filter.type === undefined)
            return (
              <Link
                key={filter.label}
                href={filter.href}
                className={
                  isActive
                    ? 'bg-foreground text-background rounded-full text-sm px-3 py-1'
                    : 'bg-foreground/[0.06] text-muted-foreground hover:text-foreground rounded-full text-sm px-3 py-1 transition-colors'
                }
              >
                {filter.label}
              </Link>
            )
          })}
        </div>

        <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3 gap-6">
          {visible.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="flex flex-col group"
            >
              <div className="relative w-full aspect-video rounded overflow-hidden bg-foreground/[0.06] border border-foreground/[0.1]">
                {getCoverPath(post.slug) && (
                  <Image
                    src={getCoverPath(post.slug)!}
                    alt={post.title}
                    fill
                    className="object-cover"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 mt-4">
                <span className="text-xs text-muted-foreground">{formatDate(post.date)}</span>
                <span className="size-1 rounded-full bg-foreground/20" />
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-foreground/[0.1]">
                  {typeLabel(post.type)}
                </span>
              </div>

              <h2 className="text-sm font-semibold mt-2 leading-snug group-hover:underline">
                {post.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {post.description}
              </p>
            </Link>
          ))}
        </div>
      </Container>
    </main>
  )
}
