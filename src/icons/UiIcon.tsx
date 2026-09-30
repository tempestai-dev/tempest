import { forwardRef, useEffect, useState, type CSSProperties, type HTMLAttributes } from "react";
import { useUiIconPack } from "./UiIconContext";
import { readExtensionFile } from "../extensions/registry";
import { normalizeSvg } from "./normalizeSvg";

interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  name: string;
  size?: number;
  strokeWidth?: number | string;
  fill?: string;
  color?: string;
}

// Shared cache — icons never mutate at runtime. Key: "<extensionId>::<relative-path>".
const svgCache = new Map<string, string>();

// ponytail: SVGs come from bundled or filesystem-installed extensions we
// control today. When third-party pack install lands (Phase 4/5), sanitize
// the SVG body before dangerouslySetInnerHTML — script/foreignObject/on*
// must be stripped.
export const UiIcon = forwardRef<HTMLSpanElement, Props>(function UiIcon(
  { name, size = 16, className, style, strokeWidth, fill, color, ...rest },
  ref,
) {
  const { active, resolvePath } = useUiIconPack();
  const [svg, setSvg] = useState<string | null>(null);

  const relPath = active ? resolvePath(name) : null;
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
        console.warn("ui icon load failed", name, relPath, e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, active, relPath, name]);

  const merged: CSSProperties = {
    width: size,
    height: size,
    display: "inline-block",
    lineHeight: 0,
    ...(color !== undefined ? { color } : null),
    ...(strokeWidth !== undefined ? { ["--icon-sw" as never]: String(strokeWidth) } : null),
    ...(fill !== undefined ? { ["--icon-fill" as never]: fill } : null),
    ...style,
  };

  return (
    <span
      ref={ref}
      className={className}
      style={merged}
      {...rest}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
});
