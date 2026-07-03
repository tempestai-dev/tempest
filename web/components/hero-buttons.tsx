"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleArrowDown } from "lucide-react";
import { GithubIcon } from "@/components/icons/github";

function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "your platform";
}

export function HeroButtons({ initialOS }: { initialOS?: string }) {
  const [os, setOS] = useState(initialOS ?? "your platform");

  useEffect(() => {
    setOS(detectOS());
  }, []);

  return (
    <div className="flex flex-col min-[500px]:flex-row min-[500px]:items-center gap-4 mt-8 w-fit self-center min-[500px]:self-start">
      <Link
        href="/download"
        className="inline-flex items-center gap-2 h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium transition-opacity duration-200 hover:opacity-90"
      >
        Download for {os}
        <CircleArrowDown className="h-4 w-4" />
      </Link>

      <Link
        href="https://github.com/gsvprharsha/tempest"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-[41px] px-5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors duration-200"
      >
        <GithubIcon className="h-4 w-4" />
        Star us on GitHub
      </Link>
    </div>
  );
}
