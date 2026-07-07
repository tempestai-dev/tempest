import { Fragment } from "react";
import Link from "next/link";
import { GithubIcon } from "@/components/icons/github";
import { TempestLogo } from "@/components/icons/tempest-logo";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { Container } from "./container";

const NAV_LINKS = [
  { label: "Docs", href: "https://docs.tempestai.dev", external: true },
  { label: "Blog", href: "/blog" },
  { label: "Release Notes", href: "/release-notes" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
      <Container className="py-[18px] min-[1000px]:pt-[26px] min-[1000px]:pb-[23px] flex items-center justify-between">
        <Link href="/" className="shrink-0" aria-label="Home">
          <TempestLogo className="h-8 w-auto" />
        </Link>

        <div className="hidden min-[1000px]:flex items-center gap-3">
          <nav className="flex items-center h-[41px] px-3 rounded-lg bg-foreground/[0.06]">
            {NAV_LINKS.map(({ label, href, external }, i) => (
              <Fragment key={href}>
                {i > 0 && (
                  <span className="mx-1.5 shrink-0 w-px h-4 bg-foreground/20" />
                )}
                <Link
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-flex items-center rounded px-3 py-1 text-[15px] leading-[150%] text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors duration-200"
                >
                  {label}
                </Link>
              </Fragment>
            ))}
          </nav>

          <div className="flex items-center h-[41px] px-1 rounded-lg bg-foreground/[0.06]">
            <ThemeToggle />
            <span className="mx-1 shrink-0 w-px h-4 bg-foreground/20" />
            <Link
              href="https://github.com/tempestai-dev/tempest"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="inline-flex items-center justify-center w-9 h-9 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors duration-200"
            >
              <GithubIcon className="h-4 w-4" />
            </Link>
          </div>

          <Link
            href="/download"
            className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-[15px] font-medium transition-opacity duration-200 hover:opacity-90"
          >
            Download
          </Link>
        </div>

        <MobileNav />
      </Container>
    </header>
  );
}
