export function resolveKindColors(): Record<string, string> {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--tempest-${n}`).trim();
  return {
    function:  v("accent-blue"),   method:    v("accent-blue"),
    class:     v("accent-yellow"), interface: v("accent-green"),
    type:      v("accent-purple"),  variable:  v("fg-muted"),
    constant:  v("fg-muted"),      _default:  v("fg-subtle"),
  };
}

export function nodeRadius(deg: number): number {
  return 4 + Math.sqrt(deg) * 1.5;
}

export const MINIMAP_W = 180;
export const MINIMAP_H = 120;
