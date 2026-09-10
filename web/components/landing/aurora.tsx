"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

const HERO_MASK =
  "radial-gradient(98% 89% at 50% 4.9%, transparent 60.6384%, #000 100%)";

const TRI_MASK =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 100' preserveAspectRatio='none'>" +
  "<defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='0'>" +
  "<stop offset='0' stop-color='black' stop-opacity='0'/>" +
  "<stop offset='0.5' stop-color='black' stop-opacity='1'/>" +
  "<stop offset='1' stop-color='black' stop-opacity='0'/>" +
  "</linearGradient></defs>" +
  "<polygon points='10,0 20,100 0,100' fill='url(%23g)'/>" +
  "</svg>\")";

const DEFAULT_ACCENT = "#22d3ee";

export function Aurora({
  className = "",
  accent = DEFAULT_ACCENT,
  colors,
}: {
  className?: string;
  accent?: string;
  colors?: string[];
}) {
  const palette =
    colors ?? ["#000000", accent, "#000000", accent, "#000000", accent, "#000000"];
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative overflow-hidden bg-[#050608]",
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{ WebkitMaskImage: HERO_MASK, maskImage: HERO_MASK }}
      >
        <div className="absolute inset-0 bg-[#050608]" />
        <MeshGradient
          className="absolute inset-0 h-full w-full opacity-40 mix-blend-lighten"
          colors={palette}
          distortion={0.7}
          swirl={0.2}
          speed={0.8}
        />
        <div
          className="absolute inset-0"
          style={{
            WebkitMaskImage: TRI_MASK,
            maskImage: TRI_MASK,
            WebkitMaskRepeat: "repeat",
            maskRepeat: "repeat",
            WebkitMaskSize: "8px 100%",
            maskSize: "8px 100%",
          }}
        >
          <MeshGradient
            className="absolute inset-0 h-full w-full mix-blend-lighten"
            colors={palette}
            distortion={0.7}
            swirl={0.2}
            speed={0.8}
          />
        </div>
        <div
          className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
          style={{
            backgroundImage: "url(/noise.webp)",
            backgroundRepeat: "repeat",
            backgroundSize: "160px auto",
          }}
        />
      </div>
    </div>
  );
}
