import Link from "next/link"
import { Container } from "./container"
import { TempestLogo } from "@/components/icons/tempest-logo"

export function Footer() {
  return (
    <footer className="border-t border-foreground/[0.08] mt-auto">
      <Container className="py-12 min-[700px]:py-16">
        <div className="grid grid-cols-2 min-[1000px]:grid-cols-4 gap-10 min-[1000px]:gap-8">
          <div className="col-span-2 min-[1000px]:col-span-1 flex flex-col gap-4">
            <div>
              <TempestLogo className="h-6 w-auto" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
              Parallel AI agent sessions. Each isolated. None colliding.
            </p>
            <p className="text-xs text-muted-foreground pt-2">
              &copy; {new Date().getFullYear()} Tempest
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Product</p>
            <nav className="flex flex-col gap-2.5">
              <Link href="/download" className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">Download</Link>
              <Link href="/release-notes" className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">Release Notes</Link>
            </nav>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Resources</p>
            <nav className="flex flex-col gap-2.5">
              <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">Blog</Link>
              <a
                href="https://docs.tempestai.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                Docs
              </a>
              <a
                href="https://github.com/gsvprharsha/tempest/blob/main/ROADMAP.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                Roadmap
              </a>
            </nav>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Community</p>
            <nav className="flex flex-col gap-2.5">
              <a
                href="https://github.com/gsvprharsha/tempest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                GitHub
              </a>
              <a
                href="https://x.com/usetempest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                X (Twitter)
              </a>
              <a
                href="https://instagram.com/usetempest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                Instagram
              </a>
              <a
                href="https://linkedin.com/company/usetempest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                LinkedIn
              </a>
            </nav>
          </div>
        </div>
      </Container>
    </footer>
  )
}
