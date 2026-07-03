"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const NAV_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
  { label: "Release Notes", href: "/release-notes" },
];

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative flex flex-col items-center justify-center w-[18px] h-[14px]">
      <span
        className={`absolute block h-[1.5px] w-full rounded-lg bg-foreground origin-center transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          open ? "rotate-45" : "-translate-y-[5px]"
        }`}
      />
      <span
        className={`absolute block h-[1.5px] w-full rounded-lg bg-foreground origin-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          open ? "opacity-0 scale-x-0" : ""
        }`}
      />
      <span
        className={`absolute block h-[1.5px] w-full rounded-lg bg-foreground origin-center transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          open ? "-rotate-45" : "translate-y-[5px]"
        }`}
      />
    </span>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex items-center gap-3 min-[1000px]:hidden">
      <Link
        href="/download"
        className="inline-flex items-center justify-center h-[41px] px-5 rounded-full bg-foreground text-background text-sm font-medium transition-opacity duration-200 hover:opacity-90"
      >
        Download
      </Link>

      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="relative flex h-[41px] w-[41px] items-center justify-center rounded-lg bg-foreground/[0.06]"
      >
        <BurgerIcon open={open} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col"
            style={{ backgroundColor: "var(--background)" }}
          >
            <div className="flex items-center justify-between px-5 min-[476px]:px-8 py-[18px]">
              <Link href="/" onClick={() => setOpen(false)} className="shrink-0 text-lg font-semibold tracking-tight">
                Tempest
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="relative flex h-[41px] w-[41px] items-center justify-center rounded-lg bg-foreground/[0.06]"
              >
                <BurgerIcon open={true} />
              </button>
            </div>

            <nav className="flex flex-col flex-1 px-5 min-[476px]:px-8 pt-6 gap-1">
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="text-2xl font-medium py-3 text-foreground hover:text-muted-foreground transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="px-5 min-[476px]:px-8 pb-10">
              <Link
                href="/download"
                onClick={() => setOpen(false)}
                className="inline-flex w-full items-center justify-center rounded-lg bg-foreground text-background text-sm font-medium py-3 leading-none transition-opacity duration-200 hover:opacity-90"
              >
                Download
              </Link>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
