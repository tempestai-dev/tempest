import Link from "next/link";
import { TempestLogo } from "@/components/icons/tempest-logo";
import { GithubIcon } from "@/components/icons/github";
import { Container } from "./container";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Download", href: "/download" },
      { label: "Release Notes", href: "/release-notes" },
      { label: "Roadmap", href: "https://github.com/tempestai-dev/tempest/blob/main/ROADMAP.md", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Docs", href: "https://docs.tempestai.dev", external: true },
      { label: "GitHub", href: "https://github.com/tempestai-dev/tempest", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "All Comparisons", href: "/compare" },
      { label: "vs Orca", href: "/tempest-vs-orca" },
      { label: "vs Conductor", href: "/tempest-vs-conductor" },
      { label: "vs Superset", href: "/tempest-vs-superset" },
      { label: "vs Emdash", href: "/tempest-vs-emdash" },
      { label: "vs AgentsRoom", href: "/tempest-vs-agentsroom" },
      { label: "vs Paseo", href: "/tempest-vs-paseo" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: "https://github.com/tempestai-dev/tempest", external: true },
      { label: "X (Twitter)", href: "https://x.com/usetempest", external: true },
      { label: "Instagram", href: "https://instagram.com/usetempest", external: true },
      { label: "LinkedIn", href: "https://linkedin.com/company/usetempest", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="nl-footer mt-16 border-t border-dashed border-muted-foreground/30">
      <Container className="py-14 sm:py-16">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:gap-12">
          <div className="flex flex-col items-start gap-4 md:w-[240px] md:shrink-0">
            <Link href="/" aria-label="Tempest home" className="inline-flex">
              <TempestLogo className="h-6 w-auto text-white" />
            </Link>
            <p className="max-w-[280px] text-[14px] font-light leading-[1.6] text-white/60">
              The open source workspace for Agentic Engineering teams. Run
              Claude Code, Codex, Gemini and any other CLI agents in parallel
              with up to 86% fewer tokens and 92% fewer tool calls.
            </p>
            <Link
              href="https://github.com/tempestai-dev/tempest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[12px] font-mono uppercase tracking-[0.12em] text-white/60 transition-colors hover:text-white"
            >
              <GithubIcon className="size-3.5" />
              Star on GitHub
            </Link>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-10 sm:grid-cols-3 md:grid-cols-5 md:gap-8">
          {COLUMNS.map(({ title, links }) => (
            <div key={title} className="flex flex-col gap-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                {title}
              </p>
              <nav className="flex flex-col gap-2.5">
                {links.map(({ label, href, external }) => (
                  <Link
                    key={label}
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="w-fit text-[13px] font-light text-white/60 transition-colors hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-dashed border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/40">
            &copy; {new Date().getFullYear()} Tempest &middot; Apache 2.0
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/40">
            Open source. Local-first.
          </p>
        </div>
      </Container>
    </footer>
  );
}
