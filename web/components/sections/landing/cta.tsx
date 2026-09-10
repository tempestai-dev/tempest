import Link from "next/link";
import { Download } from "lucide-react";
import { Container } from "@/components/landing/container";
import { Button } from "@/components/landing/button";
import { GithubIcon } from "@/components/icons/github";

export function CtaSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-20 text-center sm:px-8 sm:py-24 lg:px-10 lg:py-28">
          <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
            Ready when you are
          </span>
          <h2 className="max-w-3xl font-pixel text-[32px] leading-[1.05] tracking-[-0.02em] sm:text-[40px] md:text-[52px]">
            <span className="text-white">Run your first agent</span>{" "}
            <span className="text-white/50">in under two minutes.</span>
          </h2>
          <p className="max-w-xl text-[14px] font-light leading-[1.6] text-white/60 sm:text-[15px]">
            Apache 2.0. Windows, macOS, Linux.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              compact
              mono
              className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
            >
              <Link href="/download">
                Download Now
                <Download data-icon="inline-end" />
              </Link>
            </Button>
            <Button
              asChild
              compact
              mono
              variant="secondary"
              className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
            >
              <Link
                href="https://github.com/tempestai-dev/tempest"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon />
                Star us on GitHub
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
