import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight, ArrowUpRight } from "lucide-react";
import { SITE_URL } from "@/lib/constants/site";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/landing/button";

export const metadata: Metadata = {
  title:
    "Compare AI Agent Runners — Tempest vs Conductor, Superset, Emdash, AgentsRoom, Paseo",
  description:
    "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing — all in one place.",
  alternates: { canonical: `${SITE_URL}/compare` },
  openGraph: {
    title: "Compare AI Agent Runners — Tempest vs Alternatives",
    description:
      "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing — all in one place.",
    type: "website",
    url: `${SITE_URL}/compare`,
    images: [{ url: "/og-image.webp", width: 1280, height: 640, alt: "Compare AI Agent Runners" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare AI Agent Runners — Tempest vs Alternatives",
    description:
      "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing.",
    images: ["/og-image.webp"],
  },
};

const rows = [
  { feature: "Parallel agent sessions", tempest: "Yes", conductor: "Yes", superset: "Yes", emdash: "Yes", agentsroom: "Yes", paseo: "Yes" },
  { feature: "Isolation model", tempest: "Git worktrees", conductor: "Cloud containers", superset: "Git worktrees", emdash: "Git worktrees", agentsroom: "Workspaces", paseo: "Sessions" },
  { feature: "Shared context across sessions", tempest: "Yes (Token Intelligence)", conductor: "No", superset: "No", emdash: "No", agentsroom: "No", paseo: "No" },
  { feature: "Token cost reduction", tempest: "Up to 86%", conductor: "—", superset: "—", emdash: "—", agentsroom: "—", paseo: "—" },
  { feature: "License", tempest: "Apache 2.0", conductor: "Proprietary", superset: "ELv2", emdash: "Apache 2.0", agentsroom: "Proprietary", paseo: "Apache 2.0" },
  { feature: "Price", tempest: "Free", conductor: "Free tier + paid", superset: "Free (self-host)", emdash: "Free", agentsroom: "Free tier + paid", paseo: "Free" },
  { feature: "Windows", tempest: "Yes", conductor: "Yes (cloud)", superset: "No", emdash: "Yes", agentsroom: "Yes", paseo: "Yes" },
  { feature: "macOS", tempest: "Roadmap", conductor: "Yes (cloud)", superset: "Yes", emdash: "Yes", agentsroom: "Yes", paseo: "Yes" },
  { feature: "Local-first (code stays on machine)", tempest: "Yes", conductor: "No", superset: "Yes", emdash: "Yes", agentsroom: "Partial", paseo: "Yes" },
  { feature: "Session continuity", tempest: "Yes", conductor: "Yes", superset: "Yes", emdash: "Partial", agentsroom: "Yes", paseo: "Yes" },
  { feature: "Built-in diff + push", tempest: "Yes", conductor: "Yes", superset: "Yes", emdash: "Partial", agentsroom: "Yes", paseo: "Yes" },
];

const cols = [
  { key: "tempest", label: "Tempest", highlight: true },
  { key: "conductor", label: "Conductor" },
  { key: "superset", label: "Superset" },
  { key: "emdash", label: "Emdash" },
  { key: "agentsroom", label: "AgentsRoom" },
  { key: "paseo", label: "Paseo" },
];

const comparisons = [
  { href: "/tempest-vs-orca", label: "Tempest vs Orca" },
  { href: "/tempest-vs-conductor", label: "Tempest vs Conductor" },
  { href: "/tempest-vs-superset", label: "Tempest vs Superset" },
  { href: "/tempest-vs-emdash", label: "Tempest vs Emdash" },
  { href: "/tempest-vs-agentsroom", label: "Tempest vs AgentsRoom" },
  { href: "/tempest-vs-paseo", label: "Tempest vs Paseo" },
];

export default function ComparePage() {
  return (
    <main className="relative mx-auto w-full max-w-[1380px] pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Compare AI Agent Runners — Tempest vs Alternatives",
            description:
              "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing — all in one place.",
            url: `${SITE_URL}/compare`,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
            ],
          }),
        }}
      />

      <PageHero
        eyebrow="Compare"
        headline="AI agent runners."
        headlineMuted="One table. No spin."
        subhead="Tempest, Conductor, Superset, Emdash, AgentsRoom, Orca and Paseo — isolation models, token efficiency, licensing, platforms, and pricing side by side."
        actions={
          <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
            <Link href="/download">
              Download Now
              <Download data-icon="inline-end" />
            </Link>
          </Button>
        }
      />

      <SectionShell eyebrow="The table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="border-b border-dashed border-white/15">
                <th className="min-w-[220px] px-6 py-4 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-white/50 sm:px-10">
                  Feature
                </th>
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className={
                      "min-w-[130px] px-4 py-4 text-left font-mono text-[11px] uppercase tracking-[0.12em] " +
                      (col.highlight ? "text-white" : "text-white/50")
                    }
                  >
                    {col.label}
                    {col.highlight && (
                      <span className="ml-2 text-white/30">← this</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-b border-dashed border-white/10">
                  <td className="px-6 py-4 text-[13px] font-light text-white/70 sm:px-10">
                    {row.feature}
                  </td>
                  {cols.map((col) => {
                    const val = row[col.key as keyof typeof row];
                    return (
                      <td
                        key={col.key}
                        className={
                          "px-4 py-4 " +
                          (col.highlight
                            ? "font-mono text-[13px] text-white"
                            : "text-[13px] font-light text-white/55")
                        }
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-4 text-[11px] uppercase tracking-[0.12em] text-white/30 sm:px-10">
          Data sourced from public documentation. Accuracy not guaranteed — verify with each vendor.
        </p>
      </SectionShell>

      <SectionShell eyebrow="Detailed comparisons" title="One-on-one breakdowns.">
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
          {comparisons.map((c, i) => {
            const smCol = i % 2;
            const lgCol = i % 3;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={
                  "group flex items-center justify-between gap-3 p-6 sm:p-8 border-dashed border-white/15 transition-colors hover:bg-white/[0.03] " +
                  (smCol > 0 ? "sm:border-l " : "") +
                  (i >= 2 && lgCol === 0 ? "lg:border-t " : "") +
                  (i >= 2 && lgCol > 0 ? "lg:border-t lg:border-l " : "") +
                  (i < 2 && lgCol > 0 ? "lg:border-l " : "")
                }
              >
                <span className="font-pixel text-[18px] leading-[1.1] tracking-[-0.02em] text-white">
                  {c.label}
                </span>
                <ArrowUpRight
                  size={16}
                  className="text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white"
                />
              </Link>
            );
          })}
        </div>
      </SectionShell>
    </main>
  );
}
