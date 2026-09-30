import { useEffect, useState } from "react";
import { useIconPack } from "./IconPackContext";
import { readExtensionFile } from "../extensions/registry";
import { normalizeSvg } from "./normalizeSvg";

interface Props {
  name: string;
  isDir: boolean;
  isOpen?: boolean;
  size?: number;
  className?: string;
}

// SVG body cache keyed by "<extensionId>::<relative-path>". Icons never
// change at runtime, so a plain Map is fine — no invalidation needed until
// the active pack changes, and that just misses (cheap re-fetch).
const svgCache = new Map<string, string>();

// ponytail: SVGs come from bundled or filesystem-installed extensions we
// control today. When third-party pack install is enabled, sanitize the SVG
// body before dangerouslySetInnerHTML — script/foreignObject nodes must be
// stripped to prevent XSS.
export function FileIcon({ name, isDir, isOpen = false, size = 14, className }: Props) {
  const { active, resolvePath } = useIconPack();
  const [svg, setSvg] = useState<string | null>(null);

  const relPath = active ? resolvePath(name, isDir, isOpen) : null;
  const cacheKey = active && relPath ? `${active.extensionId}::${relPath}` : null;

  useEffect(() => {
    if (!active || !relPath || !cacheKey) {
      setSvg(null);
      return;
    }
    const cached = svgCache.get(cacheKey);
    if (cached) {
      setSvg(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = normalizeSvg(await readExtensionFile(active.extensionId, relPath));
        svgCache.set(cacheKey, raw);
        if (!cancelled) setSvg(raw);
      } catch (e) {
        console.warn("icon load failed", relPath, e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, active, relPath]);

  const style = { width: size, height: size, display: "inline-block", lineHeight: 0 };

  if (svg) {
    return (
      <span
        className={className}
        style={style}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  // Placeholder keeps layout stable while the SVG loads / when no pack is active.
  return <span className={className} style={style} />;
}
