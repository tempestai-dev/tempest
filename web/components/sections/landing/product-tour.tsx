"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  MessagesSquare,
  GitPullRequest,
  Terminal,
  MonitorPlay,
  Download,
} from "lucide-react";
import { Container } from "@/components/landing/container";
import { Button } from "@/components/landing/button";

type Tab = {
  icon: typeof MessagesSquare;
  label: string;
  title: string;
  body: string;
  image: { src: string; alt: string };
};

const tabs: Tab[] = [
  {
    icon: MessagesSquare,
    label: "Threads",
    title: "Feed each agent the exact context it needs",
    body: "Drop chats, files, and notes onto a canvas. Every agent sees only what matters for its task — no more re-pasting requirements into five terminals.",
    image: {
      src: "/screenshots/landing-dark.png",
      alt: "Threads canvas feeding parallel agents",
    },
  },
  {
    icon: GitPullRequest,
    label: "Diff & PR",
    title: "Review, stage, commit, push — without leaving Tempest",
    body: "A live diff viewer shows every change as it happens. Stage the hunks you want, commit, push, and open a PR — the full git workflow inside one window.",
    image: {
      src: "/screenshots/landing-dark.png",
      alt: "Live diff viewer with stage and commit",
    },
  },
  {
    icon: Terminal,
    label: "Real terminal",
    title: "A full PTY in every session",
    body: "ANSI color, in-session search, clickable links, shell history. Not a wrapper, not a log viewer — the same terminal you already use, embedded per agent.",
    image: {
      src: "/screenshots/landing-dark.png",
      alt: "Embedded PTY terminal",
    },
  },
  {
    icon: MonitorPlay,
    label: "Live preview",
    title: "Watch your dev server update in real time",
    body: "Point Tempest at your dev server URL and every code change from any agent appears in the preview instantly. See the app before you review the diff.",
    image: {
      src: "/screenshots/landing-dark.png",
      alt: "Live dev-server preview panel",
    },
  },
];

export function ProductTourSection() {
  const [active, setActive] = useState(0);
  const current = tabs[active];
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="p-6 sm:p-8">
        <h2 className="font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px]">
          <span className="text-white">One place</span>{" "}
          <span className="text-white/50">for every agent, in parallel.</span>
        </h2>
        <Button asChild compact mono className="mt-4">
          <Link href="/download">
            Download Now
            <Download data-icon="inline-end" />
          </Link>
        </Button>
      </div>

      <div className="border-t border-dashed border-white/15">
        <div className="flex overflow-x-auto border-b border-dashed border-white/15">
          {tabs.map((t, i) => {
            const Icon = t.icon;
            const isActive = i === active;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => setActive(i)}
                className={
                  "flex flex-1 min-w-[140px] items-center justify-center gap-2 border-r border-dashed border-white/15 px-4 py-4 text-[13px] transition-colors last:border-r-0 sm:py-5 " +
                  (isActive
                    ? "bg-white/[0.04] text-white"
                    : "text-white/50 hover:text-white/80")
                }
              >
                <Icon size={15} strokeWidth={1.5} />
                <span className="font-pixel tracking-[-0.01em] text-[15px]">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div
            className="relative aspect-[16/10] w-full overflow-hidden border-b border-dashed border-white/15 min-[900px]:border-b-0 min-[900px]:border-r"
            style={{ backgroundColor: "#030303" }}
          >
            <Image
              key={current.image.src + active}
              src={current.image.src}
              alt={current.image.alt}
              fill
              sizes="(min-width: 900px) 66vw, 100vw"
              className="object-cover object-top"
              unoptimized
            />
          </div>
          <div className="flex flex-col justify-center gap-4 p-6 sm:p-8 lg:p-10">
            <p className="font-pixel text-[22px] leading-[1.1] tracking-[-0.02em] text-white sm:text-[26px]">
              {current.title}
            </p>
            <p className="text-[14px] font-light leading-[1.6] text-white/60">
              {current.body}
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
