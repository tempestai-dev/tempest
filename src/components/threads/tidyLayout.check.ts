// Self-checks for the Tidy canvas overlap pass (issue #18). Run with
// `node src/components/threads/tidyLayout.check.ts` (Node strips types; no build).
import assert from "node:assert";
import {
  ISOLATED_GAP,
  rectsOverlap,
  resolveIsolatedOverlaps,
  type PlacedBox,
} from "./tidyLayout.ts";

const box = (id: string, x: number, y: number, w = 100, h = 60): PlacedBox => ({ id, x, y, w, h });

// ── rectsOverlap: the geometric condition the pass repairs ──────────────────
{
  assert.strictEqual(rectsOverlap(box("a", 0, 0), box("b", 50, 30)), true);
  assert.strictEqual(rectsOverlap(box("a", 0, 0), box("b", 200, 200)), false);
  // Edge-touching counts as clear without a gap, overlapping with one.
  assert.strictEqual(rectsOverlap(box("a", 0, 0), box("b", 100, 0)), false);
  assert.strictEqual(rectsOverlap(box("a", 0, 0), box("b", 100, 0), ISOLATED_GAP), true);
}

// ── Repro: a connected box landing exactly on an isolated box ───────────────
{
  const movable = [box("conn", 300, 200)];
  const fixed = [box("iso", 300, 200)];
  const out = resolveIsolatedOverlaps(movable, fixed);
  const p = out.get("conn")!;
  // Least penetration is vertical (60 + 8 vs 100 + 8): pushed straight up.
  assert.deepStrictEqual(p, { x: 300, y: 200 - 60 - ISOLATED_GAP });
  assert.strictEqual(
    rectsOverlap({ ...movable[0]!, ...p }, fixed[0]!, ISOLATED_GAP),
    false,
    "resolved box must clear the isolated box",
  );
  // Isolated boxes are never in the output and the input is untouched.
  assert.strictEqual(out.has("iso"), false);
  assert.deepStrictEqual(fixed, [box("iso", 300, 200)]);
}

// ── Partial overlap pushes along the least-penetration axis ─────────────────
{
  // Overlap 20px horizontally, 50px vertically: pushed left by 20 + gap.
  const out = resolveIsolatedOverlaps([box("conn", 180, 10)], [box("iso", 260, 20)]);
  assert.deepStrictEqual(out.get("conn"), { x: 180 - 20 - ISOLATED_GAP, y: 10 });
}

// ── Chain: fixing one overlap must not open another ─────────────────────────
{
  const movable = [box("a", 0, 0), box("b", 150, 0)];
  const fixed = [box("iso", 50, 10)];
  const out = resolveIsolatedOverlaps(movable, fixed);
  const boxes = movable.map((m) => ({ ...m, ...out.get(m.id)! }));
  for (const b of boxes) {
    assert.strictEqual(
      rectsOverlap(b, fixed[0]!, ISOLATED_GAP),
      false,
      `${b.id} must clear the isolated box`,
    );
  }
  for (let i = 0; i < boxes.length; i++) {
    for (const other of movable) {
      if (other.id === boxes[i]!.id) continue;
      assert.strictEqual(
        rectsOverlap(boxes[i]!, { ...other, ...out.get(other.id)! }, ISOLATED_GAP),
        false,
        `${boxes[i]!.id} must clear ${other.id}`,
      );
    }
  }
}

// ── Clear layouts pass through byte-identical ───────────────────────────────
{
  const movable = [box("a", 0, 0), box("b", 500, 400)];
  const fixed = [box("iso", 1000, 1000)];
  const out = resolveIsolatedOverlaps(movable, fixed);
  assert.deepStrictEqual(out.get("a"), { x: 0, y: 0 });
  assert.deepStrictEqual(out.get("b"), { x: 500, y: 400 });
}

// ── Determinism: same input, same output, every time ────────────────────────
{
  const movable = [box("c2", 300, 200), box("c1", 320, 210), box("c3", 0, 0)];
  const fixed = [box("iso", 300, 200)];
  const first = resolveIsolatedOverlaps(movable, fixed);
  const second = resolveIsolatedOverlaps(movable, fixed);
  assert.deepStrictEqual([...first], [...second]);
}

// ── Minimal nudge: a linked pair near an isolated node ───────────────────────
// n2 overlaps the isolated box (58px up clears it, 88px right, more elsewhere),
// so it moves straight up by exactly 58 and n1 never moves: the pass nudges
// along least penetration rather than re-laying-out the sim's arrangement.
{
  const movable = [box("n1", 0, 0), box("n2", 140, 0)];
  const fixed = [box("iso", 120, 10)];
  const out = resolveIsolatedOverlaps(movable, fixed);
  assert.deepStrictEqual(out.get("n1"), { x: 0, y: 0 });
  assert.deepStrictEqual(out.get("n2"), { x: 140, y: -58 });
  for (const [id, p] of out) {
    assert.strictEqual(
      rectsOverlap({ id, x: p.x, y: p.y, w: 100, h: 60 }, fixed[0]!, ISOLATED_GAP),
      false,
      `${id} must clear the isolated box`,
    );
  }
}

console.log("tidyLayout: all checks passed");
