import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import path from "path";
import { Container } from "@/components/layout/container";
import type { BlogPost } from "@/lib/mdx";
import { formatDate } from "@/lib/format-date";

function getCoverPath(slug: string): string | null {
  const dir = path.join(process.cwd(), "public", "blog-pics", slug);
  for (const ext of ["webp", "png", "jpg"]) {
    if (fs.existsSync(path.join(dir, `cover.${ext}`))) return `/blog-pics/${slug}/cover.${ext}`;
  }
  return null;
}

export function BlogSection({ posts }: { posts: BlogPost[] }) {
  return (
    <Container className="mt-20 pb-20">
      <div className="flex items-end justify-between mb-8">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground font-semibold">BLOG</p>
          <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
            <span className="text-foreground">Notes from the team.</span>
          </h2>
        </div>
        <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-6">
        {posts.length > 0 ? posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="flex flex-col group">
            <div className="relative w-full aspect-video rounded overflow-hidden bg-foreground/[0.06] border">
              {getCoverPath(post.slug) && (
                <Image
                  src={getCoverPath(post.slug)!}
                  alt={post.title}
                  fill
                  loading="eager"
                  className="object-cover"
                />
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{formatDate(post.date)} · {post.type}</p>
            <h3 className="mt-1.5 text-sm font-semibold text-foreground group-hover:underline">{post.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{post.description}</p>
          </Link>
        )) : Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col">
            <div className="w-full aspect-video rounded overflow-hidden bg-foreground/[0.06]" />
            <div className="mt-4 h-3 w-24 rounded bg-foreground/[0.06]" />
            <div className="mt-2 h-4 w-3/4 rounded bg-foreground/[0.06]" />
            <div className="mt-1.5 h-3 w-full rounded bg-foreground/[0.06]" />
          </div>
        ))}
      </div>
    </Container>
  );
}
