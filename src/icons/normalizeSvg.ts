// Force the outer <svg>'s dimensions to fill its wrapper so the caller's
// size prop / className drives the actual rendered size. Extension SVGs
// often ship with intrinsic width/height (e.g. 24) which otherwise beats
// the parent span's inline size.
export function normalizeSvg(raw: string): string {
  return raw.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    const stripped = attrs.replace(/\s(?:width|height)\s*=\s*"[^"]*"/gi, "");
    return `<svg${stripped} width="100%" height="100%">`;
  });
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  // ponytail: single self-check for the regex — no framework
  const src = '<svg width="24" height="24" viewBox="0 0 24 24"><path/></svg>';
  const out = normalizeSvg(src);
  if (!out.includes('width="100%"') || !out.includes('height="100%"') || out.includes('width="24"')) {
    throw new Error("normalizeSvg broken: " + out);
  }
}
