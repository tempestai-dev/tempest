import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/landing/container";
import { Aurora } from "@/components/landing/aurora";
import { Button } from "@/components/landing/button";

export type BlogSectionPost = {
  slug: string;
  title: string;
  date: string;
  description: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BlogSection({ posts }: { posts: BlogSectionPost[] }) {
  const shown = posts.slice(0, 3);
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#ec4899",
            "#000000",
            "#f43f5e",
            "#000000",
            "#a855f7",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              From the blog
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">Notes from the loop.</span>{" "}
              <span className="text-white/50">Written by people who ship with agents.</span>
            </h2>
          </div>
          <Button
            asChild
            compact
            mono
            className="h-11 gap-2.5 self-start px-3.5 text-[13px] font-semibold lg:ml-auto lg:self-end"
          >
            <Link href="/blog">
              All posts
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 border-t border-dashed border-white/15 min-[900px]:grid-cols-3">
        {shown.map((p, i) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className={
              "group flex flex-col justify-between gap-8 p-6 sm:p-8 min-h-[280px] border-dashed border-white/15 transition-colors hover:bg-white/[0.02] " +
              (i > 0 ? "border-t min-[900px]:border-t-0 min-[900px]:border-l" : "")
            }
          >
            <div className="flex flex-col gap-3">
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                {formatDate(p.date)}
              </span>
              <p className="font-pixel text-[18px] leading-[1.2] tracking-[-0.02em] text-white group-hover:text-white sm:text-[20px]">
                {p.title}
              </p>
              <p className="text-[13px] font-light leading-[1.55] text-white/55">
                {p.description}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-white/50 group-hover:text-white">
              Read post
              <ArrowUpRight
                size={13}
                strokeWidth={2}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          </Link>
        ))}
      </div>
    </Container>
  );
}
