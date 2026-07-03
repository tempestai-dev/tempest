import type { Metadata } from "next"
import { Container } from "@/components/layout/container"
import { DownloadContent } from "@/components/download-content"
import { formatDate } from "@/lib/format-date"

export const metadata: Metadata = {
  title: "Download Tempest — Free, Open Source — Windows (macOS & Linux coming soon)",
  description: "Download Tempest for Windows, macOS, or Linux. Free, open source, no account required.",
  alternates: { canonical: "https://tempestai.dev/download" },
  openGraph: {
    title: "Download Tempest — Free, Open Source",
    description: "Download Tempest for Windows, macOS, or Linux. Free, open source, no account required.",
    type: "website",
    url: "https://tempestai.dev/download",
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Download Tempest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Download Tempest — Free, Open Source",
    description: "Download Tempest for Windows, macOS, or Linux. Free, open source, no account required.",
    images: ["/og-image.png"],
  },
}

type ReleaseAsset = {
  name: string
  browser_download_url: string
}

type GitHubRelease = {
  tag_name: string
  published_at: string
  assets: ReleaseAsset[]
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/gsvprharsha/tempest/releases/latest",
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function assetLabel(name: string): string {
  if (name.endsWith(".msi")) return "MSI Installer (.msi)"
  if (name.endsWith(".exe") && name.includes("setup")) return "NSIS Installer (.exe)"
  if (name.endsWith(".exe")) return "Portable (.exe)"
  if (name.endsWith(".dmg")) return "Disk Image (.dmg)"
  if (name.endsWith(".tar.gz")) return "App Archive (.tar.gz)"
  if (name.endsWith(".deb")) return "Debian Package (.deb)"
  if (name.endsWith(".AppImage")) return "AppImage"
  return name
}

export default async function DownloadPage() {
  const release = await getLatestRelease()

  const version = release?.tag_name ?? "v0.1.0"
  const date = release?.published_at
    ? formatDate(release.published_at)
    : "18th June 2026"

  const assets: ReleaseAsset[] = release?.assets ?? []

  const windowsAssets = assets
    .filter((a) => a.name.endsWith(".exe") || a.name.endsWith(".msi"))
    .map((a) => ({ label: assetLabel(a.name), href: a.browser_download_url }))

  const linuxAssets = assets
    .filter((a) => a.name.endsWith(".deb") || a.name.endsWith(".AppImage"))
    .map((a) => ({ label: assetLabel(a.name), href: a.browser_download_url }))

  const macAssets = assets
    .filter((a) => a.name.endsWith(".dmg") || a.name.endsWith(".tar.gz"))
    .map((a) => ({ label: assetLabel(a.name), href: a.browser_download_url }))

  return (
    <Container className="py-16 min-[1000px]:py-24">
      <DownloadContent
        version={version}
        date={date}
        windowsAssets={windowsAssets}
        linuxAssets={linuxAssets}
        macAssets={macAssets}
      />
    </Container>
  )
}
