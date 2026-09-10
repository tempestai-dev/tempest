import type { ReactNode } from "react";
import { Container } from "./container";
import { Aurora } from "./aurora";

type Props = {
  eyebrow: string;
  headline: ReactNode;
  headlineMuted?: ReactNode;
  subhead?: ReactNode;
  actions?: ReactNode;
  aurora?: string[];
};

const defaultAurora = [
  "#000000",
  "#06b6d4",
  "#000000",
  "#8b5cf6",
  "#000000",
];

export function PageHero({
  eyebrow,
  headline,
  headlineMuted,
  subhead,
  actions,
  aurora = defaultAurora,
}: Props) {
  return (
    <Container className="mt-24 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora className="absolute inset-0" colors={aurora} />
        <div className="relative z-10 flex flex-col gap-6 px-6 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
          <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
            {eyebrow}
          </span>
          <h1 className="max-w-4xl font-pixel text-[32px] leading-[1.05] tracking-[-0.02em] sm:text-[42px] md:text-[54px]">
            <span className="text-white">{headline}</span>
            {headlineMuted && (
              <>
                {" "}
                <span className="text-white/50">{headlineMuted}</span>
              </>
            )}
          </h1>
          {subhead && (
            <p className="max-w-2xl text-[15px] font-light leading-[1.6] text-white/60 sm:text-[16px]">
              {subhead}
            </p>
          )}
          {actions && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {actions}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
