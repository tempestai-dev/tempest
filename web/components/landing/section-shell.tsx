import type { ReactNode } from "react";
import { Container } from "./container";
import { Aurora } from "./aurora";

type Props = {
  eyebrow?: string;
  title?: ReactNode;
  titleMuted?: ReactNode;
  aside?: ReactNode;
  aurora?: string[];
  className?: string;
  children?: ReactNode;
};

export function SectionShell({
  eyebrow,
  title,
  titleMuted,
  aside,
  aurora,
  className,
  children,
}: Props) {
  return (
    <Container
      className={
        "mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30 " +
        (className ?? "")
      }
    >
      {(eyebrow || title || aside) && (
        <div className="relative overflow-hidden">
          {aurora && <Aurora className="absolute inset-0" colors={aurora} />}
          <div className="relative z-10 grid gap-6 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
            <div className="flex flex-col gap-5">
              {eyebrow && (
                <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
                  {eyebrow}
                </span>
              )}
              {title && (
                <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
                  <span className="text-white">{title}</span>
                  {titleMuted && (
                    <>
                      {" "}
                      <span className="text-white/50">{titleMuted}</span>
                    </>
                  )}
                </h2>
              )}
            </div>
            {aside && (
              <div className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
                {aside}
              </div>
            )}
          </div>
        </div>
      )}
      {children && (
        <div className="border-t border-dashed border-white/15">{children}</div>
      )}
    </Container>
  );
}
