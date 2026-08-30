// Self-check for the pure context-compression builders (issue #94). Run with
// `node src/lib/contextCompression.check.ts` (Node strips types; no build).
import assert from "node:assert";
import {
  COMPRESSION_BUDGET,
  estimateTokens,
  compressLineageContent,
  compressHistory,
  compressionSystemNote,
  toHistoryTurns,
  type HistoryTurn,
} from "./contextCompression.ts";
import type { ChatMessage } from "../types/chat";

// ── estimateTokens ───────────────────────────────────────────────────────────
{
  assert.strictEqual(estimateTokens(""), 0);
  assert.strictEqual(estimateTokens("abcd"), 1);
  assert.strictEqual(estimateTokens("abcde"), 2);
}

// ── compressLineageContent: under budget is untouched ────────────────────────
{
  const body = "short spec body";
  const r = compressLineageContent({ kind: "text", title: "spec", content: body });
  assert.strictEqual(r.compressed, false, "small body not compressed");
  assert.strictEqual(r.content, body, "small body passed through verbatim");
  assert.strictEqual(r.savedChars, 0);
}

// ── compressLineageContent: over budget becomes an addressable stub ──────────
{
  const body = "line one\nline two\n" + "x".repeat(50_000);
  const r = compressLineageContent({ kind: "file", title: "design.pdf", content: body, path: "/p/design.pdf" });
  assert.strictEqual(r.compressed, true, "large body compressed");
  assert.ok(r.content.length < body.length / 10, "stub is far smaller than the body");
  assert.ok(r.savedChars > 40_000, "reports the saving");
  // The stub must carry its own retrieval call, addressed by the node's title.
  assert.ok(r.content.includes("read_canvas_node"), "names the retrieval tool");
  assert.ok(r.content.includes('"design.pdf"'), "addresses the node by title");
  assert.ok(r.content.includes("/p/design.pdf"), "keeps the source path");
  assert.ok(r.content.includes("line one"), "keeps a head preview");
  assert.ok(r.content.includes(body.length.toLocaleString()), "states the held-out size");
  // Not indexed → no Atlas pointer.
  assert.ok(!r.content.includes("atlas_"), "no Atlas pointer when not indexed");
}

// ── compressLineageContent: indexed files also point at the Atlas graph ──────
{
  const r = compressLineageContent({
    kind: "file", title: "lib.rs", content: "y".repeat(10_000), path: "src/lib.rs", indexed: true,
  });
  assert.ok(r.content.includes("atlas_"), "indexed file points at the Atlas tools");
}

// ── compressLineageContent: exact-budget boundary stays verbatim ─────────────
{
  const exact = "z".repeat(COMPRESSION_BUDGET.lineageChars);
  assert.strictEqual(compressLineageContent({ kind: "text", title: "t", content: exact }).compressed, false);
  const over = "z".repeat(COMPRESSION_BUDGET.lineageChars + 1);
  assert.strictEqual(compressLineageContent({ kind: "text", title: "t", content: over }).compressed, true);
}

// ── compressHistory: short history is left entirely alone ────────────────────
{
  const turns: HistoryTurn[] = Array.from({ length: COMPRESSION_BUDGET.recentTurns }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i}`,
  }));
  const r = compressHistory(turns);
  assert.strictEqual(r.elidedCount, 0, "nothing elided under the window");
  assert.strictEqual(r.index, "", "no index block");
  assert.strictEqual(r.turns.length, turns.length, "all turns kept");
}

// ── compressHistory: older turns become a numbered, retrievable index ────────
{
  const turns: HistoryTurn[] = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant", content: `body of turn ${i + 1} ` + "w".repeat(500),
  }));
  const r = compressHistory(turns);
  assert.strictEqual(r.turns.length, COMPRESSION_BUDGET.recentTurns, "recent window kept verbatim");
  assert.strictEqual(r.elidedCount, 4, "the rest are elided");
  // Recent turns must be the TAIL, byte-identical.
  assert.deepStrictEqual(r.turns, turns.slice(4), "kept turns are the untouched tail");
  // Index is 1-based over the ORIGINAL list — that numbering is the tool's address space.
  assert.ok(r.index.includes("- #1 user:"), "numbers from 1");
  assert.ok(r.index.includes("- #4 assistant:"), "covers up to the cut");
  assert.ok(!r.index.includes("- #5 "), "does not index a turn that was sent verbatim");
  assert.ok(r.index.includes("read_thread_history"), "names the retrieval tool");
  assert.ok(r.savedChars > 1000, "reports a real saving");
  assert.ok(r.index.length < 2060, "the index is smaller than the bulk it replaced");
  // Gists are capped, so a runaway turn can't blow up the index itself.
  for (const line of r.index.split("\n").filter((l) => l.startsWith("- #"))) {
    assert.ok(line.length < COMPRESSION_BUDGET.turnGistChars + 40, `index line stays short: ${line.length}`);
  }
}

// ── compressHistory: the kept window always opens on a user turn ─────────────
{
  // Anthropic 400s on an assistant-first message list. An odd cut point is the
  // case that used to produce one, so exercise every length across the boundary.
  for (let n = COMPRESSION_BUDGET.recentTurns + 1; n <= COMPRESSION_BUDGET.recentTurns + 12; n++) {
    const turns: HistoryTurn[] = Array.from({ length: n }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as HistoryTurn["role"],
      content: `turn ${i + 1}`,
    }));
    const r = compressHistory(turns);
    assert.strictEqual(r.turns[0].role, "user", `n=${n}: kept window opens on a user turn`);
    // Erring towards keeping MORE never drops below the configured window.
    assert.ok(r.turns.length >= COMPRESSION_BUDGET.recentTurns, `n=${n}: window not shrunk`);
    // The elided count and the kept tail must still partition the original list.
    assert.strictEqual(r.elidedCount + r.turns.length, n, `n=${n}: turns partition cleanly`);
    assert.deepStrictEqual(r.turns, turns.slice(r.elidedCount), `n=${n}: tail is untouched`);
    // Every elided turn is addressable, and no kept turn is double-listed.
    for (let t = 1; t <= r.elidedCount; t++) {
      assert.ok(r.index.includes(`- #${t} `), `n=${n}: turn #${t} is indexed`);
    }
    assert.ok(!r.index.includes(`- #${r.elidedCount + 1} `), `n=${n}: kept turn not indexed`);
  }
}

// ── compressHistory: consecutive assistant turns don't break the cut ─────────
{
  // Error paths can append two assistant turns in a row, so the walk-back must
  // not assume strict alternation.
  const turns: HistoryTurn[] = [
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "assistant", content: "three" },
    { role: "assistant", content: "four" },
    { role: "user", content: "five" },
    { role: "assistant", content: "six" },
    { role: "assistant", content: "seven" },
    { role: "user", content: "eight" },
    { role: "assistant", content: "nine" },
  ];
  const r = compressHistory(turns);
  assert.strictEqual(r.turns[0].role, "user", "opens on a user turn despite runs of assistants");
  assert.deepStrictEqual(r.turns, turns.slice(r.elidedCount), "tail untouched");
}

// ── compressHistory: an all-assistant history degrades to sending everything ──
{
  // Can't happen from the UI (a chat starts with the user), but the walk-back
  // must terminate rather than loop or slice past the start.
  const turns: HistoryTurn[] = Array.from({ length: 9 }, (_, i) => ({
    role: "assistant" as const, content: `turn ${i + 1}`,
  }));
  const r = compressHistory(turns);
  assert.strictEqual(r.elidedCount, 0, "nothing elided when no user turn exists to cut at");
  assert.deepStrictEqual(r.turns, turns, "history passes through unchanged");
  assert.strictEqual(r.index, "", "no index block");
}

// ── compressHistory: the index's fixed header amortizes as the thread grows ──
{
  const mk = (n: number): HistoryTurn[] =>
    Array.from({ length: n }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as HistoryTurn["role"],
      content: `body of turn ${i + 1} ` + "w".repeat(500),
    }));
  const bulk = (t: HistoryTurn[], cut: number) =>
    t.slice(0, cut).reduce((n, x) => n + x.content.length, 0);
  const short = compressHistory(mk(10));
  const long = compressHistory(mk(60));
  const ratio = (r: typeof short, t: HistoryTurn[]) => r.savedChars / bulk(t, r.elidedCount);
  assert.ok(ratio(long, mk(60)) > ratio(short, mk(10)), "longer threads compress proportionally harder");
  assert.ok(ratio(long, mk(60)) > 0.7, "a long thread sheds most of its elided bulk");
}

// ── compressHistory: empty / whitespace turns still get an addressable slot ──
{
  const turns: HistoryTurn[] = Array.from({ length: 8 }, () => ({ role: "user" as const, content: "   " }));
  const r = compressHistory(turns);
  assert.strictEqual(r.elidedCount, 2);
  assert.ok(r.index.includes("(no text)"), "empty turn is still listed, not silently dropped");
  assert.ok(r.savedChars >= 0, "saving never goes negative");
}

// ── toHistoryTurns: text-only flattening, shared by sender and retriever ─────
{
  const msgs: ChatMessage[] = [
    { id: "1", role: "user", parts: [{ type: "text", content: "hello " }, { type: "text", content: "world" }] },
    { id: "2", role: "assistant", parts: [
      { type: "tool-call", id: "t", toolName: "read_file", args: {}, status: "complete" },
      { type: "text", content: "done" },
    ] },
  ];
  assert.deepStrictEqual(toHistoryTurns(msgs), [
    { role: "user", content: "hello world" },
    { role: "assistant", content: "done" },
  ]);
  // Positional integrity is the whole contract: a message with no text must still
  // occupy its slot, or every turn number after it shifts and the tool mis-answers.
  const withEmpty: ChatMessage[] = [
    { id: "1", role: "user", parts: [] },
    { id: "2", role: "assistant", parts: [{ type: "text", content: "second" }] },
  ];
  const flat = toHistoryTurns(withEmpty);
  assert.strictEqual(flat.length, 2, "empty message keeps its position");
  assert.strictEqual(flat[1].content, "second", "turn #2 is still turn #2");
}

// ── compressionSystemNote ────────────────────────────────────────────────────
{
  assert.ok(compressionSystemNote(true).includes("atlas_"), "indexed steer mentions Atlas");
  assert.ok(!compressionSystemNote(false).includes("atlas_"), "unindexed steer does not");
  assert.ok(compressionSystemNote(false).includes("read_canvas_node"));
}

console.log("contextCompression: all checks passed");
