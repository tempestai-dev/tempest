"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GithubIcon } from "@/components/icons/github";
import { TempestLogo } from "@/components/icons/tempest-logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Container } from "./container";
import { Button } from "./button";

const NAV_LINKS = [
  { label: "Docs", href: "https://docs.tempestai.dev", external: true },
  { label: "Blog", href: "/blog" },
  { label: "Release Notes", href: "/release-notes" },
];

function GithubStars() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("https://api.github.com/repos/tempestai-dev/tempest")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setStars(d.stargazers_count))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (stars === null) return null;
  const label = stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);
  return <span>{label}</span>;
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="nl-header fixed inset-x-0 top-0 z-50 bg-transparent">
      <Container
        className={`flex items-center justify-between py-[10px] min-[1000px]:py-[10px] transition-colors duration-200 ${
          scrolled
            ? "bg-background/80 backdrop-blur-sm border-x border-b border-dashed border-muted-foreground/30"
            : "bg-transparent"
        }`}
      >
        <Link href="/" className="shrink-0" aria-label="Home">
          <TempestLogo className="h-6 w-auto" />
        </Link>

        <div className="hidden min-[1000px]:flex items-center gap-3">
          <nav className="flex items-center gap-4 h-[41px] px-3 rounded-lg bg-transparent">
            {NAV_LINKS.map(({ label, href, external }) => (
              <Button key={href} asChild compact uppercase mono variant="ghost">
                <Link
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {label}
                </Link>
              </Button>
            ))}
          </nav>

          <div className="flex items-center h-[41px] gap-2 rounded-lg bg-transparent">
            <Button asChild compact uppercase mono variant="outline">
              <Link
                href="https://github.com/tempestai-dev/tempest"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <GithubIcon />
                <GithubStars />
              </Link>
            </Button>
          </div>

          <Button asChild compact uppercase mono>
            <Link href="/download">Download</Link>
          </Button>
        </div>

        <MobileNav />
      </Container>
    </header>
  );
}
