import Link from "next/link";
import { Download } from "lucide-react";
import { Header } from "./_components/header";
import { Button } from "./_components/button";
import { AgentCycle } from "./_components/agent-cycle";
import { ScreenshotSection } from "./_sections/screenshot";
import { HowItWorksSection } from "./_sections/how-it-works";
import { WhyTempestSection } from "./_sections/why-tempest";
import { FeatureGridSection } from "./_sections/feature-grid";
import { GithubIcon } from "@/components/icons/github";

export const metadata = {
  title: "New Landing (WIP)",
  robots: { index: false, follow: false },
};

// Locked section order:
//    1. Hero (video)                         ✓ done
//    2. Tabbed product tour                  TODO — placeholders + TODO comments
//    3. How It Works                         ✓ done
//    4. Why Tempest                          ✓ done
//    5. Feature grid — 3 rows × N cols       TODO — image/gif per slot
//    6. Compare table (→ /tempest-vs-*)      TODO
//    7. Who it's for                         TODO
//    8. Blog                                 TODO
//    9. FAQ                                  TODO
//   10. CTA                                  TODO

export default function NewLandingPage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] overflow-hidden">
      <Header />
      <section className="relative h-screen w-full overflow-hidden border-b border-l border-r border-dashed border-muted-foreground/30">
        <video
          src="/video/hero-bg.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover object-left sm:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-8 px-8 pb-12 sm:pb-16 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:pb-20">
          <div className="max-w-2xl">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              The Open Source Workspace for Agentic Engineering Teams
            </span>
            <h1 className="mt-5 font-pixel text-white text-[34px] sm:text-[44px] md:text-[54px] lg:text-[60px] font-normal leading-[1.05] tracking-[-0.02em]">
              Agentic Engineering
              <br />
              that actually scales
            </h1>
            <p className="mt-5 max-w-xl text-[17px] font-light leading-[1.55] text-white/70">
              Run Claude Code, Codex, Gemini and any other CLI Agents in parallel with
              upto 86% fewer tokens and 92% fewer tool calls
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild compact mono className="h-11 gap-2.5 px-3.5 text-[13px] font-semibold">
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
                className="h-11 gap-2.5 px-3.5 text-[13px] font-semibold"
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
          <div className="flex flex-col gap-3 lg:items-end">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              Supports your favorite agents
            </span>
            <div className="w-full max-w-[500px]">
              <AgentCycle size={22} />
            </div>
          </div>
        </div>
      </section>
      <ScreenshotSection />
      <HowItWorksSection />
      <WhyTempestSection />
      <FeatureGridSection />
    </main>
  );
}
