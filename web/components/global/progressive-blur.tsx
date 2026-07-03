const LAYERS = 8;
const STEP = 100 / LAYERS; // 12.5

function buildMask(direction: string, i: number): string {
  const a = i * STEP;
  const b = (i + 1) * STEP;
  const c = (i + 2) * STEP;
  const d = (i + 3) * STEP;

  const transparent = "rgba(0,0,0,0)";
  const opaque = "rgba(0,0,0,1)";

  let stops: string;
  if (d <= 100) {
    stops = `${transparent} ${a}%,${opaque} ${b}%,${opaque} ${c}%,${transparent} ${d}%`;
  } else if (c <= 100) {
    stops = `${transparent} ${a}%,${opaque} ${b}%,${opaque} ${c}%`;
  } else {
    stops = `${transparent} ${a}%,${opaque} ${b}%`;
  }

  return `linear-gradient(${direction},${stops})`;
}

interface ProgressiveBlurProps {
  direction?: "to bottom" | "to top" | "to left" | "to right";
  className?: string;
}

export function ProgressiveBlur({
  direction = "to bottom",
  className,
}: ProgressiveBlurProps) {
  return (
    <div
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      className={className}
    >
      {Array.from({ length: LAYERS }, (_, i) => {
        const blur = 10 / Math.pow(2, LAYERS - 1 - i);
        const mask = buildMask(direction, i);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: i + 1,
              maskImage: mask,
              WebkitMaskImage: mask,
              pointerEvents: "none",
              backdropFilter: `blur(${blur}px)`,
            }}
          />
        );
      })}
    </div>
  );
}
