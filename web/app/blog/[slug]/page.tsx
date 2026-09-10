import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import Image from "next/image";
import Link from "next/link";
import fs from "fs";
import path from "path";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { getAllPosts, getPostBySlug, getPostContent } from "@/lib/mdx";
import type { BlogPost } from "@/lib/mdx";
import { SITE_URL } from "@/lib/constants/site";
import { Container } from "@/components/landing/container";
import { ProseShell } from "@/components/landing/prose-shell";
import { Button } from "@/components/landing/button";

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

function getCoverPathForMeta(slug: string): string | null {
  const dir = path.join(process.cwd(), "public", "blog-pics", slug);
  for (const ext of ["webp", "png", "jpg"]) {
    if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`;
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  const cover = getCoverPathForMeta(slug);
  const ogImage = cover
    ? { url: `${SITE_URL}${cover}`, alt: post.title }
    : { url: "/og-image.webp", width: 1280, height: 640, alt: post.title };
  return {
    title: `${post.title} — Tempest`,
    description: post.description,
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url: `${SITE_URL}/blog/${slug}`,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [cover ? `${SITE_URL}${cover}` : `${SITE_URL}/og-image.webp`],
    },
  };
}

function typeLabel(type: BlogPost["type"]): string {
  if (type === "dev-log") return "Dev Log";
  if (type === "release-notes") return "Release Notes";
  return "Blog";
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const content = getPostContent(slug);
  const coverPath = (() => {
    const dir = path.join(process.cwd(), "public", "blog-pics", slug);
    for (const ext of ["webp", "png", "jpg"]) {
      if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`;
    }
    return null;
  })();

  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
            image: {
              "@type": "ImageObject",
              url: coverPath ? `${SITE_URL}${coverPath}` : `${SITE_URL}/og-image.webp`,
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
              { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
              {
                "@type": "ListItem",
                position: 3,
                name: post.title,
                item: `${SITE_URL}/blog/${slug}`,
              },
            ],
          }),
        }}
      />

      <Container className="mt-24 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
        <div className="flex flex-col gap-6 px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
          <Link
            href="/blog"
            className="inline-flex w-fit items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.12em] text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft size={12} />
            All posts
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-white/50">
            <span className="border border-dashed border-white/20 bg-white/[0.03] px-2 py-1">
              {typeLabel(post.type)}
            </span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span className="size-1 rounded-full bg-white/25" />
            <span>{post.author}</span>
          </div>
          <h1 className="max-w-3xl font-pixel text-[32px] leading-[1.05] tracking-[-0.02em] text-white sm:text-[42px] md:text-[52px]">
            {post.title}
          </h1>
          <p className="max-w-2xl text-[15px] font-light leading-[1.6] text-white/70 sm:text-[17px]">
            {post.description}
          </p>
        </div>
        {coverPath && (
          <div className="relative aspect-video w-full overflow-hidden border-t border-dashed border-white/15 bg-white/[0.04]">
            <Image src={coverPath} alt={post.title} fill priority className="object-cover" />
          </div>
        )}
      </Container>

      <ProseShell>
        <MDXRemote source={content} />
        <hr />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 not-prose">
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="border border-dashed border-white/20 bg-white/[0.03] px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/60"
              >
                {tag}
              </span>
            ))}
          </div>
          <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
            <Link href="/download">
              Download Tempest
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </ProseShell>
    </main>
  );
}
