"use client";
import { cn } from "@/lib/utils";
import { type HTMLMotionProps, motion } from "motion/react";

export const GRADIENT_ANGLES = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
};

export type ProgressiveBlurProps = {
  direction?: keyof typeof GRADIENT_ANGLES;
  blurLayers?: number;
  className?: string;
  blurIntensity?: number;
} & HTMLMotionProps<"div">;

export function ProgressiveBlur({
  direction = "bottom",
  blurLayers = 8,
  className,
  blurIntensity = 0.25,
  ...props
}: ProgressiveBlurProps) {
  const layers = Math.max(blurLayers, 2);
  const segmentSize = 1 / (layers + 1);

  return (
    <div className={cn("relative", className)}>
      {Array.from({ length: layers }).map((_, index) => {
        const angle = GRADIENT_ANGLES[direction];
        const start = index * segmentSize;
        const mid1 = (index + 1) * segmentSize;
        const mid2 = (index + 2) * segmentSize;
        const end = (index + 3) * segmentSize;

        const gradient = `linear-gradient(${angle}deg,
          rgba(255,255,255,0) ${start * 100}%,
          rgba(255,255,255,1) ${mid1 * 100}%,
          rgba(255,255,255,1) ${mid2 * 100}%,
          rgba(255,255,255,0) ${end * 100}%
        )`;

        return (
          <motion.div
            key={index}
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[inherit]",
              "bg-background/50",
            )}
            style={
              {
                maskImage: gradient,
                WebkitMaskImage: gradient,
                backdropFilter: `blur(${index * blurIntensity}px)`,
              } as React.CSSProperties
            }
            {...props}
          />
        );
      })}
    </div>
  );
}
