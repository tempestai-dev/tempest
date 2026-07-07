import { headers } from "next/headers";
import { Container } from "@/components/layout/container";
import { getAllPosts } from "@/lib/mdx";
import { FaqSection } from "@/components/faq-section";
import { HeroSection } from "@/components/sections/landing/hero-section";
import { ProvidersSection } from "@/components/sections/landing/providers-section";
import { HowItWorksSection } from "@/components/sections/landing/how-it-works-section";
import { WhyOriginSection } from "@/components/sections/landing/why-origin-section";
import { CoreFeaturesSection } from "@/components/sections/landing/core-features-section";
import { CoreCapabilitiesSection } from "@/components/sections/landing/core-capabilities-section";
import { WhoItsForSection } from "@/components/sections/landing/who-its-for-section";
import { BlogSection } from "@/components/sections/landing/blog-section";
import { CtaSection } from "@/components/sections/landing/cta-section";

function detectOSFromUA(ua: string): string {
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "your platform";
}

const structuredDataSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Tempest",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Windows",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      downloadUrl: "https://tempestai.dev/download",
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      softwareVersion: "0.1.2",
      url: "https://tempestai.dev",
    },
    {
      "@type": "Organization",
      name: "Tempest",
      url: "https://tempestai.dev",
      sameAs: [
        "https://github.com/tempestai-dev/tempest",
        "https://x.com/usetempest",
      ],
    },
    {
      "@type": "WebSite",
      name: "Tempest",
      url: "https://tempestai.dev",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://tempestai.dev/blog?type={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is Tempest free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Tempest is free and open source under the Apache 2.0 license. Download it, use it, build with it — no subscription, no seat fee.",
      },
    },
    {
      "@type": "Question",
      name: "What AI coding tools does Tempest support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Claude Code, Aider, OpenCode, Copilot CLI, Cline, Goose — and anything else you can run in a terminal. If it runs in a shell, Tempest can run it.",
      },
    },
    {
      "@type": "Question",
      name: "How does isolation work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Each session runs in its own git worktree, which is a separate working directory linked to your repo. Agents write to their own branch and never touch each other's files.",
      },
    },
    {
      "@type": "Question",
      name: "What happens when I close a tab?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The session is preserved exactly as you left it — including the full conversation history with the agent. Reopen it and it picks up right where it stopped.",
      },
    },
    {
      "@type": "Question",
      name: "Is it only for Windows?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pre-built binaries are Windows-only in early access. You can build from source on Windows, macOS, and Linux today. Mac and Linux binaries are on the roadmap.",
      },
    },
    {
      "@type": "Question",
      name: "What are Token Intelligence and Database Branches?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Token Intelligence is a local code-knowledge graph in active development that cuts context consumption by up to 64%. Database Branches gives each agent session its own isolated Postgres instance. Both are coming soon.",
      },
    },
  ],
};

export default async function HomePage() {
  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? "";
  const initialOS = detectOSFromUA(ua);
  const posts = getAllPosts().slice(0, 3);
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <HeroSection initialOS={initialOS} />
      <ProvidersSection />
      <HowItWorksSection />
      <WhyOriginSection />
      <CoreFeaturesSection />
      <CoreCapabilitiesSection />
      <WhoItsForSection />
      <BlogSection posts={posts} />
      <Container className="mt-20 pb-20">
        <FaqSection />
      </Container>
      <CtaSection />
    </main>
  );
}
