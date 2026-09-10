import Link from "next/link";
import { Download } from "lucide-react";
import { getAllPosts } from "@/lib/mdx";
import { SITE_URL } from "@/lib/constants/site";
import { GithubIcon } from "@/components/icons/github";
import { Button } from "@/components/landing/button";
import { AgentCycle } from "@/components/landing/agent-cycle";
import { ScreenshotSection } from "@/components/sections/landing/screenshot";
import { HowItWorksSection } from "@/components/sections/landing/how-it-works";
import { WhyTempestSection } from "@/components/sections/landing/why-tempest";
import { FeatureGridSection } from "@/components/sections/landing/feature-grid";
import { CompareSection } from "@/components/sections/landing/compare";
import { WhoItsForSection } from "@/components/sections/landing/who-its-for";
import { BlogSection } from "@/components/sections/landing/blog";
import { FaqSection } from "@/components/sections/landing/faq";
import { faqs } from "@/components/sections/landing/faq-data";
import { CtaSection } from "@/components/sections/landing/cta";

const structuredDataSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Tempest",
      description:
        "Open-source desktop app for running Claude Code, Aider, and other AI coding agents in parallel. Each session runs in its own git worktree — isolated, token-efficient, zero merge conflicts.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: ["Windows", "macOS", "Linux"],
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      downloadUrl: `${SITE_URL}/download`,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      softwareVersion: "0.1.8",
      url: SITE_URL,
    },
    {
      "@type": "WebSite",
      name: "Tempest",
      url: SITE_URL,
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function HomePage() {
  const posts = getAllPosts().slice(0, 3).map((p) => ({
    slug: p.slug,
    title: p.title,
    date: p.date,
    description: p.description,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <main className="relative mx-auto w-full max-w-[1380px]">
        <section className="relative h-[100dvh] w-full">
          <div className="absolute top-0 left-1/2 h-full w-screen -translate-x-1/2 overflow-hidden">
            <video
              src="/video/hero-bg.webm"
              poster="/video/hero-bg.webp"
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover object-left sm:object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/60 via-[#0a0a0a]/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/50 via-transparent to-[#0a0a0a]/30" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a]/70 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
          </div>
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
        <CompareSection />
        <WhoItsForSection />
        <BlogSection posts={posts} />
        <FaqSection />
        <CtaSection />
      </main>
    </>
  );
}
