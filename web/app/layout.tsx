import type { Metadata } from "next";
import { Geist, Geist_Mono, Geist_Pixel } from "next/font/google";
import { Providers } from "@/provider/theme-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CookieBanner } from "@/components/cookie-banner";
import { ProgressiveBlur } from "@/components/global/progressive-blur";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SITE_URL } from '@/lib/constants/site'

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Tempest",
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/og-image.png`,
    width: 1280,
    height: 640,
  },
  email: "gsvprharsha@tempestai.dev",
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "gsvprharsha@tempestai.dev",
      url: `${SITE_URL}/contact`,
      availableLanguage: ["English"],
      areaServed: "Worldwide",
    },
    {
      "@type": "ContactPoint",
      contactType: "security",
      email: "gsvprharsha@tempestai.dev",
      url: "https://github.com/tempestai-dev/tempest/security/policy",
      availableLanguage: ["English"],
      areaServed: "Worldwide",
    },
  ],
  address: {
    "@type": "PostalAddress",
    addressCountry: "IN",
  },
  sameAs: [
    "https://github.com/tempestai-dev/tempest",
    "https://x.com/usetempest",
  ],
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const geistPixel = Geist_Pixel({
  variable: "--font-geist-pixel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tempest — Run Claude Code, Aider & AI Agents in Parallel",
  description:
    "Run AI coding agents in parallel — each isolated, none colliding. Claude Code, Aider, OpenCode, and more, all from one interface, each on its own branch.",
  icons: {
    icon: "/favicon.ico",
  },
  alternates: {
    canonical: SITE_URL,
  },
  other: {
    "llms-txt": `${SITE_URL}/llms.txt`,
  },
  openGraph: {
    title: "Tempest — Run Claude Code, Aider & AI Agents in Parallel",
    description:
      "Run AI coding agents in parallel — each isolated, none colliding. Claude Code, Aider, OpenCode, and more, all from one interface, each on its own branch.",
    type: "website",
    url: SITE_URL,
    images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Tempest — Run Claude Code, Aider & AI Agents in Parallel" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tempest — Run Claude Code, Aider & AI Agents in Parallel",
    description:
      "Run AI coding agents in parallel — each isolated, none colliding. Claude Code, Aider, OpenCode, and more, all from one interface, each on its own branch.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${geistPixel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <Providers>
          <Header />
          {children}
          <Footer />
          {/* <div className="fixed bottom-0 inset-x-0 h-40 pointer-events-none z-50">
            <ProgressiveBlur />
          </div> */}
        </Providers>
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}
