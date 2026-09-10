"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "./button";

const NAV_LINKS = [
  { label: "Docs", href: "https://docs.tempestai.dev" },
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
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        compact
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <BurgerIcon open={open} />
      </Button>

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
              <Button
                type="button"
                variant="secondary"
                size="icon"
                compact
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <BurgerIcon open={true} />
              </Button>
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
              <Button asChild compact uppercase mono className="w-full">
                <Link href="/download" onClick={() => setOpen(false)}>
                  Download
                </Link>
              </Button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
