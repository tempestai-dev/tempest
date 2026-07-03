"use client"

import { Fragment, useEffect, useState, useSyncExternalStore } from "react"
import Image from "next/image"
import Link from "next/link"
import { Download, ArrowRight, ChevronDown } from "lucide-react"
import { WindowsLogo } from "@/components/icons/windows"
import { TuxIcon } from "@/components/icons/linux"
import { TempestLogo } from "@/components/icons/tempest-logo"

type Asset = { label: string; href: string }

type Props = {
  version: string
  date: string
  windowsAssets: Asset[]
  linuxAssets: Asset[]
  macAssets: Asset[]
}

type DetectedOS = "windows" | "linux" | "mac" | null

const subscribeToUserAgent = () => () => {}

function detectOS(): DetectedOS {
  const ua = navigator.userAgent
  if (ua.includes("Win")) return "windows"
  if (ua.includes("Mac")) return "mac"
  if (ua.includes("Linux")) return "linux"
  return null
}

const CAROUSEL_IMAGES = [
  { src: "/screenshots/landing-light.png", darkSrc: "/screenshots/landing-dark.png", alt: "Tempest" },
]

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.091-4.61 1.091M15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

export function DownloadContent({ version, date, windowsAssets, linuxAssets, macAssets }: Props) {
  const os = useSyncExternalStore(subscribeToUserAgent, detectOS, () => null)
  const isMultiSlide = CAROUSEL_IMAGES.length > 1
  const [carouselIndex, setCarouselIndex] = useState(0)

  useEffect(() => {
    if (!isMultiSlide) return
    const timer = setInterval(() => {
      setCarouselIndex((i) => (i + 1) % CAROUSEL_IMAGES.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [isMultiSlide])

  const primaryWindowsAsset =
    windowsAssets.find((a) => a.label.includes("NSIS")) ?? windowsAssets[0]
  const primaryLinuxAsset = linuxAssets[0]
  const primaryMacAsset =
    macAssets.find((a) => a.label.includes("Disk Image")) ?? macAssets[0]

  const primaryHref =
    os === "linux"
      ? primaryLinuxAsset?.href
      : os === "mac"
        ? primaryMacAsset?.href
        : primaryWindowsAsset?.href
  const primaryLabel =
    os === "linux"
      ? "Download Tempest for Linux"
      : os === "mac"
        ? "Download Tempest for macOS"
        : "Download Tempest for Windows"

  return (
    <div className="flex flex-col pb-20">

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 min-[1000px]:grid-cols-[2fr_3fr] gap-12 min-[1000px]:gap-12 items-center">

        {/* Left: text + CTA */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="flex items-center gap-3 text-4xl min-[1000px]:text-5xl font-normal tracking-tight leading-tight">
              Get
              <TempestLogo className="h-9 min-[1000px]:h-12 w-auto" />
            </h1>
            <p className="text-base text-muted-foreground">
              Parallel AI agent sessions. Free and open source.
            </p>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{version}</span>
            <span className="opacity-30">·</span>
            <span>Windows · macOS · Linux</span>
            <span className="opacity-30">·</span>
            <span>Free &amp; Open Source</span>
          </div>

          {/* Primary CTA */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 w-full min-[500px]:w-fit">
              {primaryHref ? (
                <a
                  href={primaryHref}
                  className="h-11 px-6 rounded-xl bg-foreground text-background text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity w-full"
                >
                  <Download className="size-4 shrink-0" />
                  {primaryLabel}
                </a>
              ) : (
                <div className="h-11 px-6 rounded bg-foreground/[0.04] border border-foreground/[0.06] text-muted-foreground text-sm inline-flex items-center w-full select-none">
                  No build available for this platform.
                </div>
              )}

              <a
                href="#whats-new"
                className="inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground h-11 px-6 rounded-xl w-full hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-200"
              >
                <ChevronDown className="size-4 shrink-0" />
                All download options
              </a>
            </div>

            <div className="flex items-center gap-5 text-sm">
              <Link
                href="/release-notes"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Release Notes
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right: carousel with glow */}
        <div className="relative hidden min-[1000px]:flex min-[1000px]:flex-col min-[1000px]:gap-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-4/5 bg-foreground/[0.07] rounded-full blur-3xl" />
            </div>
            <div className="relative rounded overflow-hidden shadow-xl aspect-[8/5]">
              {CAROUSEL_IMAGES.map((img, i) => (
                <Fragment key={i}>
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    {...(i === 0 ? { priority: true } : { loading: "eager" as const })}
                    className={[
                      "object-cover",
                      img.darkSrc ? "block dark:hidden" : "",
                      isMultiSlide ? "transition-opacity duration-700" : "",
                      isMultiSlide ? (i === carouselIndex ? "opacity-100" : "opacity-0") : "",
                    ].join(" ")}
                  />
                  {img.darkSrc && (
                    <Image
                      src={img.darkSrc}
                      alt={img.alt}
                      fill
                      loading="eager"
                      className={[
                        "object-cover hidden dark:block",
                        isMultiSlide ? "transition-opacity duration-700" : "",
                        isMultiSlide ? (i === carouselIndex ? "opacity-100" : "opacity-0") : "",
                      ].join(" ")}
                    />
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Dots */}
          {CAROUSEL_IMAGES.length > 1 && (
            <div className="flex items-center justify-center gap-2">
              {CAROUSEL_IMAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCarouselIndex(i)}
                  className={`rounded-full transition-all duration-300 cursor-pointer ${
                    i === carouselIndex
                      ? "w-4 h-1.5 bg-foreground/50"
                      : "w-1.5 h-1.5 bg-foreground/20 hover:bg-foreground/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Latest Version ───────────────────────────────── */}
      <section id="whats-new" className="mt-20 pt-16 border-t border-foreground/[0.08]">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Download the latest installer
        </p>
        <h2 className="text-2xl font-normal">{version}</h2>
        <p className="text-sm text-muted-foreground mt-1">{date}</p>
      </section>

      {/* ── Platform Cards ───────────────────────────────── */}
      <section id="platform-cards" className="mt-16">
        <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-4">

          {/* Windows */}
          <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-6 flex flex-col gap-4 hover:border-foreground/20 hover:bg-foreground/[0.04] transition-colors duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WindowsLogo className="size-3.5 opacity-60" />
                <span className="text-sm font-medium">Windows</span>
              </div>
              <span className="text-xs text-muted-foreground bg-foreground/[0.06] rounded-full px-2 py-0.5">
                Recommended
              </span>
            </div>
            {windowsAssets.length > 0 ? (
              <div className="flex flex-col gap-1">
                {windowsAssets.map((a) => (
                  <a
                    key={a.href}
                    href={a.href}
                    className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors duration-200"
                  >
                    <Download className="size-3.5 shrink-0" />
                    {a.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No builds published yet.</p>
            )}
          </div>

          {/* Linux */}
          <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-6 flex flex-col gap-4 hover:border-foreground/20 hover:bg-foreground/[0.04] transition-colors duration-200">
            <div className="flex items-center gap-2">
              <TuxIcon className="size-5 opacity-60" />
              <span className="text-sm font-medium">Linux</span>
            </div>
            {linuxAssets.length > 0 ? (
              <div className="flex flex-col gap-1">
                {linuxAssets.map((a) => (
                  <a
                    key={a.href}
                    href={a.href}
                    className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors duration-200"
                  >
                    <Download className="size-3.5 shrink-0" />
                    {a.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No builds published yet.</p>
            )}
          </div>

          {/* macOS */}
          <div className="rounded border border-foreground/[0.08] bg-foreground/[0.02] p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <AppleLogo className="size-3.5 opacity-60" />
              <span className="text-sm font-medium">macOS</span>
            </div>
            {macAssets.length > 0 ? (
              <div className="flex flex-col gap-1">
                {macAssets.map((a) => (
                  <a
                    key={a.href}
                    href={a.href}
                    className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors duration-200"
                  >
                    <Download className="size-3.5 shrink-0" />
                    {a.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No builds published yet.</p>
            )}
          </div>

        </div>
      </section>


    </div>
  )
}
