import { type CSSProperties } from "react";

interface Props {
  direction: "top" | "bottom" | "left" | "right";
  size?: number;
}

export default function ProgressiveBlur({ direction, size = 36 }: Props) {
  const layers    = 6;
  const intensity = 0.8;
  const segSize   = 1 / (layers + 1);
  const angle     = { top: 180, bottom: 0, left: 270, right: 90 }[direction];
  const isHoriz   = direction === "left" || direction === "right";
  const edgeStyle: CSSProperties = isHoriz
    ? { top: 0, bottom: 0, [direction]: 0, width: size }
    : { left: 0, right: 0, [direction]: 0, height: size };

  return (
    <>
      {Array.from({ length: layers }).map((_, i) => {
        const s0 = i * segSize;
        const s1 = (i + 1) * segSize;
        const s2 = (i + 2) * segSize;
        const s3 = (i + 3) * segSize;
        const grad = `linear-gradient(${angle}deg, transparent ${s0 * 100}%, black ${s1 * 100}%, black ${s2 * 100}%, transparent ${s3 * 100}%)`;
        return (
          <div
            key={i}
            style={{
              position:             "absolute",
              ...edgeStyle,
              pointerEvents:        "none",
              backdropFilter:       `blur(${i * intensity}px)`,
              WebkitBackdropFilter: `blur(${i * intensity}px)`,
              maskImage:            grad,
              WebkitMaskImage:      grad,
              zIndex:               2,
            }}
          />
        );
      })}
    </>
  );
}
