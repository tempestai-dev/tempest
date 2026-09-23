// Pure geometry for the Tidy canvas overlap pass (issue #18).
//
// The force sim lays out connected nodes and ignores isolated ones, so a
// freshly packed cluster can land on top of a node the user placed by hand.
// This pass runs after the sim and pushes connected boxes out of overlap
// with stationary isolated boxes. Connected nodes move; isolated nodes are
// never touched and never appear in the output.
//
// Deterministic by construction: stable id order, least-penetration axis,
// integer positions, bounded passes. No randomness, no DOM, no React.

export interface PlacedBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Breathing room kept between a moved box and a fixed one. */
export const ISOLATED_GAP = 8;

/** Maximum overlap-resolution passes; one pass usually suffices, the cap bounds pathological chains. */
export const MAX_PASSES = 10;

/**
 * True when the boxes overlap or come closer than `gap` edge-to-edge. The
 * margin is applied to the first box only, so a box pushed clear by exactly
 * `gap` reads as clear rather than overlapping itself.
 */
export function rectsOverlap(a: PlacedBox, b: PlacedBox, gap = 0): boolean {
  return (
    a.x - gap < b.x + b.w &&
    b.x < a.x + a.w + gap &&
    a.y - gap < b.y + b.h &&
    b.y < a.y + a.h + gap
  );
}

function pushOut(box: PlacedBox, obstacle: PlacedBox, gap: number): { x: number; y: number } {
  const pushLeft = box.x + box.w + gap - obstacle.x;
  const pushRight = obstacle.x + obstacle.w + gap - box.x;
  const pushUp = box.y + box.h + gap - obstacle.y;
  const pushDown = obstacle.y + obstacle.h + gap - box.y;
  const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
  // Ties go left, then up: fixed order keeps the result deterministic.
  if (min === pushLeft) return { x: box.x - pushLeft, y: box.y };
  if (min === pushUp) return { x: box.x, y: box.y - pushUp };
  if (min === pushRight) return { x: box.x + pushRight, y: box.y };
  return { x: box.x, y: box.y + pushDown };
}

/**
 * Push `movable` boxes clear of `fixed` boxes (and of each other as they
 * move, so one fix cannot open another overlap silently). Returns rounded
 * integer positions for the movable ids only; `fixed` positions are never
 * read for output. Boxes that already clear everything keep their exact
 * input positions.
 */
export function resolveIsolatedOverlaps(
  movable: PlacedBox[],
  fixed: PlacedBox[],
  opts: { gap?: number; maxPasses?: number } = {},
): Map<string, { x: number; y: number }> {
  const gap = opts.gap ?? ISOLATED_GAP;
  const maxPasses = opts.maxPasses ?? MAX_PASSES;
  const pos = new Map(movable.map((m) => [m.id, { x: m.x, y: m.y }]));
  const sizes = new Map(movable.map((m) => [m.id, { w: m.w, h: m.h }]));
  const order = [...movable]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => m.id);

  const currentBox = (id: string): PlacedBox => {
    const p = pos.get(id)!;
    const s = sizes.get(id)!;
    return { id, x: p.x, y: p.y, w: s.w, h: s.h };
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (const id of order) {
      let box = currentBox(id);
      // Obstacles in stable order: fixed boxes first, then the other
      // movables at their current positions.
      const obstacles: PlacedBox[] = [
        ...[...fixed].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        ...order.filter((other) => other !== id).map(currentBox),
      ];
      for (const obstacle of obstacles) {
        if (!rectsOverlap(box, obstacle, gap)) continue;
        const next = pushOut(box, obstacle, gap);
        box = { ...box, x: next.x, y: next.y };
        moved = true;
      }
      pos.set(id, { x: box.x, y: box.y });
    }
    if (!moved) break;
  }

  for (const [id, p] of pos) pos.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  return pos;
}
