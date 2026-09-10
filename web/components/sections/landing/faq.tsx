"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Container } from "@/components/landing/container";
import { Aurora } from "@/components/landing/aurora";
import { faqs } from "./faq-data";

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#334155",
            "#000000",
            "#2563eb",
            "#000000",
            "#475569",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              FAQ
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">Questions we get a lot.</span>{" "}
              <span className="text-white/50">Answers in one line.</span>
            </h2>
          </div>
          <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
            Anything missing? File it on GitHub — we&apos;ll add it here.
          </p>
        </div>
      </div>

      <div className="border-t border-dashed border-white/15">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div
              key={f.q}
              className={
                (i > 0 ? "border-t border-dashed border-white/15 " : "") +
                "flex flex-col"
              }
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex items-center justify-between gap-6 px-6 py-5 text-left transition-colors hover:bg-white/[0.02] sm:px-8 sm:py-6 lg:px-10"
              >
                <span className="font-pixel text-[17px] leading-[1.2] tracking-[-0.02em] text-white sm:text-[19px]">
                  {f.q}
                </span>
                {isOpen ? (
                  <Minus size={16} strokeWidth={1.5} className="shrink-0 text-white/60" />
                ) : (
                  <Plus size={16} strokeWidth={1.5} className="shrink-0 text-white/60" />
                )}
              </button>
              {isOpen && (
                <div className="px-6 pb-6 sm:px-8 sm:pb-8 lg:px-10">
                  <p className="max-w-3xl text-[14px] font-light leading-[1.65] text-white/60">
                    {f.a}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Container>
  );
}
