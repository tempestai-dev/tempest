import type { ReactNode } from "react";
import Link from "next/link";
import { Download, ArrowRight, ArrowUpRight, Check, X, Minus } from "lucide-react";
import { PageHero } from "./page-hero";
import { SectionShell } from "./section-shell";
import { Button } from "./button";
import { GithubIcon } from "@/components/icons/github";

export type CompareRow = {
  label: string;
  tempest: string;
  other: string;
  tempestYes: boolean | null;
  otherYes: boolean | null;
};

export type CompareFeature = {
  title: string;
  body: string;
};

export type CompareVsProps = {
  eyebrow: string;
  headline: ReactNode;
  headlineMuted: ReactNode;
  subhead: ReactNode;
  competitorName: string;
  rows: CompareRow[];
  sourcedFrom: string;
  whenTheirsTitle: ReactNode;
  whenTheirsBody: ReactNode;
  whenTempestTitle: ReactNode;
  whenTempestBody: ReactNode;
  featureSectionEyebrow: string;
  featureSectionTitle: ReactNode;
  featureSectionTitleMuted?: ReactNode;
  featureSectionAside: ReactNode;
  features: CompareFeature[];
  furtherReading?: { href: string; label: string }[];
  ctaHeadline: ReactNode;
  ctaHeadlineMuted: ReactNode;
};

function Yesish({ v }: { v: boolean | null }) {
  if (v === true) return <Check size={14} strokeWidth={2} className="text-emerald-400" />;
  if (v === false) return <X size={14} strokeWidth={2} className="text-white/50" />;
  return <Minus size={14} strokeWidth={2} className="text-white/40" />;
}

export function CompareVs(props: CompareVsProps) {
  const {
    eyebrow,
    headline,
    headlineMuted,
    subhead,
    competitorName,
    rows,
    sourcedFrom,
    whenTheirsTitle,
    whenTheirsBody,
    whenTempestTitle,
    whenTempestBody,
    featureSectionEyebrow,
    featureSectionTitle,
    featureSectionTitleMuted,
    featureSectionAside,
    features,
    furtherReading,
    ctaHeadline,
    ctaHeadlineMuted,
  } = props;

  return (
    <>
      <PageHero
        eyebrow={eyebrow}
        headline={headline}
        headlineMuted={headlineMuted}
        subhead={subhead}
        actions={
          <>
            <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
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
              <a
                href="https://github.com/tempestai-dev/tempest"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon />
                GitHub
              </a>
            </Button>
          </>
        }
      />

      <SectionShell eyebrow={`Tempest vs ${competitorName}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="border-b border-dashed border-white/15">
                <th className="min-w-[200px] px-6 py-4 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-white/50 sm:px-10">
                  Feature
                </th>
                <th className="min-w-[220px] px-4 py-4 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-white">
                  Tempest
                </th>
                <th className="min-w-[220px] px-4 py-4 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                  {competitorName}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-dashed border-white/10">
                  <td className="px-6 py-4 text-[13px] font-light text-white/70 sm:px-10">
                    {row.label}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 shrink-0">
                        <Yesish v={row.tempestYes} />
                      </span>
                      <span className="text-[13px] text-white">{row.tempest}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 shrink-0">
                        <Yesish v={row.otherYes} />
                      </span>
                      <span className="text-[13px] font-light text-white/60">{row.other}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-4 text-[11px] uppercase tracking-[0.12em] text-white/30 sm:px-10">
          {sourcedFrom}
        </p>
      </SectionShell>

      <SectionShell
        eyebrow="When to pick which"
        title="Two honest recommendations."
      >
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="flex flex-col gap-4 p-6 sm:p-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
              Pick {competitorName}
            </p>
            <h3 className="font-pixel text-[20px] leading-[1.15] tracking-[-0.02em] text-white">
              {whenTheirsTitle}
            </h3>
            <p className="text-[14px] font-light leading-[1.6] text-white/60">{whenTheirsBody}</p>
          </div>
          <div className="flex flex-col gap-4 p-6 sm:p-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
              Pick Tempest
            </p>
            <h3 className="font-pixel text-[20px] leading-[1.15] tracking-[-0.02em] text-white">
              {whenTempestTitle}
            </h3>
            <p className="text-[14px] font-light leading-[1.6] text-white/60">{whenTempestBody}</p>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        eyebrow={featureSectionEyebrow}
        title={featureSectionTitle}
        titleMuted={featureSectionTitleMuted}
        aside={featureSectionAside}
      >
        <div
          className={
            "grid grid-cols-1 divide-y divide-dashed divide-white/15 " +
            (features.length === 2
              ? "md:grid-cols-2 md:divide-x md:divide-y-0"
              : "md:grid-cols-3 md:divide-x md:divide-y-0")
          }
        >
          {features.map(({ title, body }) => (
            <div key={title} className="flex flex-col gap-4 p-6 sm:p-8">
              <h3 className="font-pixel text-[20px] leading-[1.1] tracking-[-0.02em] text-white">
                {title}
              </h3>
              <p className="text-[14px] font-light leading-[1.6] text-white/60">{body}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {furtherReading && furtherReading.length > 0 && (
        <SectionShell eyebrow="Further reading">
          <div className="flex flex-col gap-3 px-6 py-8 sm:px-10 sm:py-10 lg:px-14">
            {furtherReading.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="inline-flex items-center gap-2 text-[14px] text-white transition-colors hover:text-white/70"
              >
                <ArrowUpRight size={14} />
                {r.label}
              </Link>
            ))}
          </div>
        </SectionShell>
      )}

      <SectionShell eyebrow={`${competitorName} alternative`}>
        <div className="flex flex-col items-center gap-6 px-6 py-16 text-center sm:px-10 sm:py-20">
          <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[36px] md:text-[44px]">
            <span className="text-white">{ctaHeadline}</span>{" "}
            <span className="text-white/50">{ctaHeadlineMuted}</span>
          </h2>
          <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
            <Link href="/download">
              Download Tempest
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
          <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-white/40">
            Apache 2.0 · Runs entirely on your machine
          </p>
        </div>
      </SectionShell>
    </>
  );
}
