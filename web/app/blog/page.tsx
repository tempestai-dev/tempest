import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import fs from "fs";
import path from "path";
import { formatDate } from "@/lib/format-date";
import { getAllPosts } from "@/lib/mdx";
import type { BlogPost } from "@/lib/mdx";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";

function getCoverPath(slug: string): string | null {
  const dir = path.join(process.cwd(), "public", "blog-pics", slug);
  for (const ext of ["webp", "png", "jpg"]) {
    if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`;
  }
  return null;
}

export const metadata: Metadata = {
  title: "AI Agent Engineering Blog — Tempest",
  description:
    "Writing about parallel AI agents, token efficiency, open-source tooling, and how we build Tempest.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "AI Agent Engineering Blog — Tempest",
    description:
      "Writing about parallel AI agents, token efficiency, open-source tooling, and how we build Tempest.",
    type: "website",
    url: `${SITE_URL}/blog`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Tempest Blog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Agent Engineering Blog — Tempest",
    description:
      "Writing about parallel AI agents, token efficiency, open-source tooling, and how we build Tempest.",
    images: ["/og-image.webp"],
  },
};

const filters = [
  { label: "All", type: undefined, href: "/blog" },
  { label: "Blog", type: "blog", href: "/blog?type=blog" },
  { label: "Dev Log", type: "dev-log", href: "/blog?type=dev-log" },
  { label: "Release Notes", type: "release-notes", href: "/blog?type=release-notes" },
] as const;

function typeLabel(type: BlogPost["type"]): string {
  if (type === "dev-log") return "Dev Log";
  if (type === "release-notes") return "Release Notes";
  return "Blog";
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const posts = getAllPosts();

  const visible = posts.filter((post) => {
    if (type === "blog") return post.type === "blog";
    if (type === "dev-log") return post.type === "dev-log";
    if (type === "release-notes") return post.type === "release-notes";
    return true;
  });

  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <PageHero
        eyebrow="Blog"
        headline="Notes from the loop."
        headlineMuted="Written by people who ship with agents."
        subhead="Parallel agents, token efficiency, open-source tooling, and how we build Tempest."
        actions={
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => {
              const isActive = filter.type === type || (!type && filter.type === undefined);
              return (
                <Link
                  key={filter.label}
                  href={filter.href}
                  className={
                    "border border-dashed px-3 py-1.5 text-[12px] font-mono uppercase tracking-[0.12em] transition-colors " +
                    (isActive
                      ? "border-white/60 bg-white/[0.08] text-white"
                      : "border-white/20 text-white/60 hover:border-white/40 hover:text-white")
                  }
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>
        }
      />

      <SectionShell eyebrow="Latest" title={`${visible.length} post${visible.length === 1 ? "" : "s"}`}>
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 min-[700px]:grid-cols-2 min-[700px]:divide-y-0 min-[1000px]:grid-cols-3">
          {visible.map((post, i) => {
            const cover = getCoverPath(post.slug);
            const smCol = i % 2;
            const lgCol = i % 3;
            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={
                  "group flex flex-col border-dashed border-white/15 transition-colors hover:bg-white/[0.02] " +
                  (smCol > 0 ? "min-[700px]:border-l " : "") +
                  (i >= 2 && lgCol === 0 ? "min-[1000px]:border-t " : "") +
                  (i >= 2 && lgCol > 0 ? "min-[1000px]:border-t min-[1000px]:border-l " : "") +
                  (i < 2 && lgCol > 0 ? "min-[1000px]:border-l " : "")
                }
              >
                <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
                  {cover && (
                    <Image src={cover} alt={post.title} fill className="object-cover" />
                  )}
                </div>
                <div className="flex flex-col gap-3 p-6 sm:p-8">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-white/40">
                    <span>{formatDate(post.date)}</span>
                    <span className="size-1 rounded-full bg-white/25" />
                    <span>{typeLabel(post.type)}</span>
                  </div>
                  <h2 className="font-pixel text-[18px] leading-[1.2] tracking-[-0.02em] text-white sm:text-[20px]">
                    {post.title}
                  </h2>
                  <p className="text-[13px] font-light leading-[1.55] text-white/55">
                    {post.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionShell>
    </main>
  );
}
