"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import { WindowsLogo } from "@/components/icons/windows";
import { TuxIcon } from "@/components/icons/linux";
import { AppleLogo } from "@/components/icons/apple";
import { Button } from "@/components/landing/button";
import { PageHero } from "@/components/landing/page-hero";
import { SectionShell } from "@/components/landing/section-shell";

type Asset = { label: string; href: string };

type Props = {
  version: string;
  date: string;
  windowsAssets: Asset[];
  linuxAssets: Asset[];
  macAssets: Asset[];
};

type DetectedOS = "windows" | "linux" | "mac" | null;

const subscribeToUserAgent = () => () => {};

function detectOS(): DetectedOS {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "windows";
  if (ua.includes("Mac")) return "mac";
  if (ua.includes("Linux")) return "linux";
  return null;
}

function PlatformCard({
  Icon,
  name,
  recommended,
  assets,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  name: string;
  recommended?: boolean;
  assets: Asset[];
}) {
  return (
    <div className="flex flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-white/70" />
          <span className="font-pixel text-[18px] leading-none tracking-[-0.02em] text-white">
            {name}
          </span>
        </div>
        {recommended && (
          <span className="border border-dashed border-white/25 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70">
            Recommended
          </span>
        )}
      </div>
      {assets.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {assets.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="inline-flex items-center gap-2 border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-[13px] font-mono text-white/70 transition-colors hover:border-white/40 hover:bg-white/[0.05] hover:text-white"
            >
              <Download className="size-3.5 shrink-0" />
              {a.label}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-[13px] font-light text-white/50">No builds published yet.</p>
      )}
    </div>
  );
}

export function DownloadContent({
  version,
  date,
  windowsAssets,
  linuxAssets,
  macAssets,
}: Props) {
  const os = useSyncExternalStore(subscribeToUserAgent, detectOS, () => null);

  const primaryWindowsAsset =
    windowsAssets.find((a) => a.label.includes("NSIS")) ?? windowsAssets[0];
  const primaryLinuxAsset = linuxAssets[0];
  const primaryMacAsset =
    macAssets.find((a) => a.label.includes("Disk Image")) ?? macAssets[0];

  const primaryHref =
    os === "linux"
      ? primaryLinuxAsset?.href
      : os === "mac"
        ? primaryMacAsset?.href
        : primaryWindowsAsset?.href;
  const primaryLabel =
    os === "linux"
      ? "Download for Linux"
      : os === "mac"
        ? "Download for macOS"
        : "Download for Windows";

  return (
    <>
      <PageHero
        eyebrow={`${version} · ${date}`}
        headline="Download Tempest."
        headlineMuted="Parallel agents on your machine, in minutes."
        subhead="Windows, macOS, and Linux. Apache 2.0. The whole workspace fits in a single native binary."
        actions={
          <>
            {primaryHref ? (
              <Button asChild compact mono className="h-11 gap-2.5 px-4 text-[13px] font-semibold">
                <a href={primaryHref}>
                  <Download data-icon="inline-start" />
                  {primaryLabel}
                </a>
              </Button>
            ) : (
              <span className="inline-flex h-11 items-center border border-dashed border-white/20 bg-white/[0.02] px-4 text-[13px] text-white/60">
                No build for this platform yet.
              </span>
            )}
            <Button
              asChild
              compact
              mono
              variant="secondary"
              className="h-11 gap-2.5 px-4 text-[13px] font-semibold"
            >
              <Link href="/release-notes">
                Release notes
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        }
      />

      <SectionShell
        eyebrow="Latest installers"
        title={version}
        titleMuted={date}
        aside={
          <p>
            Every build ships with everything you need — no extra runtimes, no
            bundled Chromium. Native Tauri binaries.
          </p>
        }
      >
        <div className="grid grid-cols-1 divide-y divide-dashed divide-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <PlatformCard Icon={WindowsLogo} name="Windows" recommended assets={windowsAssets} />
          <PlatformCard Icon={TuxIcon} name="Linux" assets={linuxAssets} />
          <PlatformCard Icon={AppleLogo} name="macOS" assets={macAssets} />
        </div>
      </SectionShell>
    </>
  );
}
