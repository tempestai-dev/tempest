import type { Metadata } from 'next'
import type { ComponentPropsWithoutRef } from 'react'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import Image from 'next/image'
import Link from 'next/link'
import fs from 'fs'
import path from 'path'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Container } from '@/components/layout/container'
import { formatDate } from '@/lib/format-date'
import { getAllPosts, getPostBySlug, getPostContent } from '@/lib/mdx'
import type { BlogPost } from '@/lib/mdx'

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

function getCoverPathForMeta(slug: string): string | null {
  const dir = path.join(process.cwd(), 'public', 'blog-pics', slug)
  for (const ext of ['webp', 'png', 'jpg']) {
    if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`
  }
  return null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}
  const cover = getCoverPathForMeta(slug)
  const ogImage = cover
    ? { url: `https://tempestai.dev${cover}`, alt: post.title }
    : { url: '/og-image.png', width: 1280, height: 640, alt: post.title }
  return {
    title: `${post.title} — Tempest`,
    description: post.description,
    alternates: { canonical: `https://tempestai.dev/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      url: `https://tempestai.dev/blog/${slug}`,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [cover ? `https://tempestai.dev${cover}` : 'https://tempestai.dev/og-image.png'],
    },
  }
}

function typeLabel(type: BlogPost['type']): string {
  if (type === 'dev-log') return 'Dev Log'
  if (type === 'release-notes') return 'Release Notes'
  return 'Blog'
}

const mdxComponents = {
  h1: ({ children }: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-2xl font-normal text-foreground mt-12 mb-4 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="text-xl font-normal text-foreground mt-12 mb-4 pt-10 border-t border-foreground/[0.08]">{children}</h2>
  ),
  h3: ({ children }: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-base font-medium text-foreground mt-8 mb-3">{children}</h3>
  ),
  p: ({ children }: ComponentPropsWithoutRef<'p'>) => (
    <p className="text-base text-foreground leading-8 mb-6 text-justify">{children}</p>
  ),
  ul: ({ children }: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mb-6 flex flex-col gap-3">{children}</ul>
  ),
  li: ({ children }: ComponentPropsWithoutRef<'li'>) => (
    <li className="flex gap-3 text-base text-foreground leading-relaxed">
      <span className="mt-[0.6rem] size-1.5 rounded-full bg-foreground/25 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  code: ({ children }: ComponentPropsWithoutRef<'code'>) => (
    <code className="font-mono text-[13px] bg-foreground/[0.06] border border-foreground/[0.08] rounded px-1.5 py-0.5">{children}</code>
  ),
  pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => (
    <pre className="bg-foreground/[0.04] border border-foreground/[0.08] rounded p-5 overflow-x-auto mb-6 text-[13px] font-mono leading-6 [&_code]:bg-transparent [&_code]:border-none [&_code]:p-0">{children}</pre>
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
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  blockquote: ({ children }: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="border-l-2 border-foreground/20 pl-5 my-6 [&_p]:text-muted-foreground [&_p]:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="border-foreground/[0.08] my-12" />,
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const content = getPostContent(slug)
  const coverPath = (() => {
    const dir = path.join(process.cwd(), 'public', 'blog-pics', slug)
    for (const ext of ['webp', 'png', 'jpg']) {
      if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`
    }
    return null
  })()

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            mainEntityOfPage: `https://tempestai.dev/blog/${slug}`,
            image: coverPath ? `https://tempestai.dev${coverPath}` : 'https://tempestai.dev/og-image.png',
            author: { '@type': 'Organization', name: 'Tempest', url: 'https://tempestai.dev' },
            publisher: { '@type': 'Organization', name: 'Tempest', url: 'https://tempestai.dev' },
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
              { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://tempestai.dev/blog' },
              {
                '@type': 'ListItem',
                position: 3,
                name: post.title,
                item: `https://tempestai.dev/blog/${slug}`,
              },
            ],
          }),
        }}
      />

      <Container className="py-16 min-[1000px]:py-24">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft size={14} />
          All posts
        </Link>

        <div className="max-w-2xl mx-auto">
          <div className="relative w-full aspect-video rounded overflow-hidden bg-foreground/[0.06] mb-10">
            {coverPath && (
              <Image
                src={coverPath}
                alt={post.title}
                fill
                priority
                className="object-cover"
              />
            )}
          </div>

          <article>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-foreground/[0.1]">
                {typeLabel(post.type)}
              </span>
              <time dateTime={post.date} className="text-sm text-muted-foreground">
                {formatDate(post.date)}
              </time>
            </div>

            <h1 className="text-3xl min-[700px]:text-4xl font-normal leading-snug">{post.title}</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mt-4">{post.description}</p>

            <hr className="border-foreground/[0.08] mt-8 mb-10" />

            <MDXRemote source={content} components={mdxComponents} />

            <div className="border-t border-foreground/[0.08] mt-12 pt-8 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full bg-foreground/[0.06] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <Link
                href="/download"
                className="inline-flex items-center gap-1.5 text-sm bg-foreground text-background px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
              >
                Download Tempest
                <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        </div>
      </Container>
    </main>
  )
}
