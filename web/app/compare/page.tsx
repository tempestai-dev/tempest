import type { Metadata } from "next"
import Link from "next/link"
import { Container } from "@/components/layout/container"
import { SITE_URL } from '@/lib/constants/site'

export const metadata: Metadata = {
  title: "Compare AI Agent Runners — Tempest vs Conductor, Superset, Emdash, AgentsRoom, Paseo",
  description:
    "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing — all in one place.",
  alternates: { canonical: `${SITE_URL}/compare` },
  openGraph: {
    title: "Compare AI Agent Runners — Tempest vs Alternatives",
    description:
      "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing — all in one place.",
    type: "website",
    url: `${SITE_URL}/compare`,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Compare AI Agent Runners" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare AI Agent Runners — Tempest vs Alternatives",
    description:
      "Side-by-side comparison of Tempest with every major AI agent runner. Isolation model, token costs, license, platform support, and pricing.",
    images: ["/og-image.png"],
  },
}

const rows = [
  {
    feature: "Parallel agent sessions",
    tempest: "Yes",
    conductor: "Yes",
    superset: "Yes",
    emdash: "Yes",
    agentsroom: "Yes",
    paseo: "Yes",
  },
  {
    feature: "Isolation model",
    tempest: "Git worktrees",
    conductor: "Cloud containers",
    superset: "Git worktrees",
    emdash: "Git worktrees",
    agentsroom: "Workspaces",
    paseo: "Sessions",
  },
  {
    feature: "Shared context across sessions",
    tempest: "Yes (Token Intelligence)",
    conductor: "No",
    superset: "No",
    emdash: "No",
    agentsroom: "No",
    paseo: "No",
  },
  {
    feature: "Token cost reduction",
    tempest: "Up to 64%",
    conductor: "—",
    superset: "—",
    emdash: "—",
    agentsroom: "—",
    paseo: "—",
  },
  {
    feature: "License",
    tempest: "Apache 2.0",
    conductor: "Proprietary",
    superset: "ELv2",
    emdash: "Apache 2.0",
    agentsroom: "Proprietary",
    paseo: "Apache 2.0",
  },
  {
    feature: "Price",
    tempest: "Free",
    conductor: "Free tier + paid",
    superset: "Free (self-host)",
    emdash: "Free",
    agentsroom: "Free tier + paid",
    paseo: "Free",
  },
  {
    feature: "Windows",
    tempest: "Yes",
    conductor: "Yes (cloud)",
    superset: "No",
    emdash: "Yes",
    agentsroom: "Yes",
    paseo: "Yes",
  },
  {
    feature: "macOS",
    tempest: "Roadmap",
    conductor: "Yes (cloud)",
    superset: "Yes",
    emdash: "Yes",
    agentsroom: "Yes",
    paseo: "Yes",
  },
  {
    feature: "Local-first (code stays on machine)",
    tempest: "Yes",
    conductor: "No",
    superset: "Yes",
    emdash: "Yes",
    agentsroom: "Partial",
    paseo: "Yes",
  },
  {
    feature: "Session continuity",
    tempest: "Yes",
    conductor: "Yes",
    superset: "Yes",
    emdash: "Partial",
    agentsroom: "Yes",
    paseo: "Yes",
  },
  {
    feature: "Built-in diff + push",
    tempest: "Yes",
    conductor: "Yes",
    superset: "Yes",
    emdash: "Partial",
    agentsroom: "Yes",
    paseo: "Yes",
  },
]

const cols = [
  { key: "tempest", label: "Tempest", highlight: true },
  { key: "conductor", label: "Conductor" },
  { key: "superset", label: "Superset" },
  { key: "emdash", label: "Emdash" },
  { key: "agentsroom", label: "AgentsRoom" },
  { key: "paseo", label: "Paseo" },
]

const comparisons = [
  { href: "/tempest-vs-conductor", label: "Tempest vs Conductor" },
  { href: "/tempest-vs-superset", label: "Tempest vs Superset" },
  { href: "/tempest-vs-emdash", label: "Tempest vs Emdash" },
  { href: "/tempest-vs-agentsroom", label: "Tempest vs AgentsRoom" },
  { href: "/tempest-vs-paseo", label: "Tempest vs Paseo" },
]

export default function ComparePage() {
  return (
    <main>
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

      <Container className="pt-16 min-[1000px]:pt-24 pb-24">
        <div className="max-w-5xl">
          <p className="text-sm text-muted-foreground font-semibold mb-4">COMPARE</p>
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug mb-6">
            <span className="text-foreground">AI agent runners, compared.</span>{" "}
            <span className="text-muted-foreground">One table.</span>
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-12 max-w-xl">
            Tempest, Conductor, Superset, Emdash, AgentsRoom, and Paseo — isolation models, token efficiency, licensing, platforms, and pricing side by side.
          </p>

          <div className="overflow-x-auto rounded border border-foreground/[0.08]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/[0.08]">
                  <th className="text-left text-muted-foreground font-normal py-3 px-4 min-w-[180px]">Feature</th>
                  {cols.map((col) => (
                    <th
                      key={col.key}
                      className={`text-left font-medium py-3 px-4 min-w-[110px] ${col.highlight ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {col.label}
                      {col.highlight && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground/60">← this</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-foreground/[0.04] ${i % 2 === 0 ? "bg-foreground/[0.01]" : ""}`}
                  >
                    <td className="py-3 px-4 text-muted-foreground/80">{row.feature}</td>
                    {cols.map((col) => {
                      const val = row[col.key as keyof typeof row]
                      return (
                        <td
                          key={col.key}
                          className={`py-3 px-4 ${col.highlight ? "text-foreground font-medium" : "text-muted-foreground"}`}
                        >
                          {val}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground/50 mt-3">
            Data sourced from public documentation. Accuracy not guaranteed — verify with each vendor.
          </p>

          <div className="mt-16">
            <p className="text-sm text-muted-foreground font-semibold mb-5">DETAILED COMPARISONS</p>
            <div className="flex flex-col gap-3">
              {comparisons.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="text-sm text-foreground hover:opacity-70 transition-opacity underline underline-offset-4 decoration-foreground/25"
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            <Link
              href="/download"
              className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download Tempest free
            </Link>
          </div>
        </div>
      </Container>
    </main>
  )
}
