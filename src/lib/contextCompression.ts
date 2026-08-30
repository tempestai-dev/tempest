// Optional context compression (issue #94). Off by default; flipped on from
// Settings → Token Intelligence.
//
// The problem: ChatNode rebuilds the ENTIRE outgoing context on every send —
// the full body of every wired-in lineage node, plus the full text of every
// prior turn. A long session re-pays for all of it on every message, and the
// oldest history falls out of the window before the work is done.
//
// The approach (Atlas-graph retrieval, not summarization): over-budget content
// is not summarized by a second model call and it is not thrown away. It is
// replaced by an ADDRESSABLE STUB — a head preview plus the exact tool call
// that fetches the original verbatim. Nothing is lost; it just stops being
// resident. The model pulls back only what a given turn actually needs:
//
//   lineage body   → `read_canvas_node` (title)
//   earlier turns  → `read_thread_history` (turn numbers)
//   code structure → the Atlas `atlas_*` tools, when the project is indexed
//
// That keeps fidelity at full (the bytes are still reachable) while the
// resident cost per send drops to the recent window plus an index.
//
// Pure module — type-only imports, no Tauri/React — so contextCompression.check.ts
// runs under bare `node`.
import type { ChatMessage, TextPart } from "../types/chat";

export interface CompressionBudget {
  /** Per-parent verbatim cap in the Lineage block; over this the body is stubbed. */
  lineageChars: number;
  /** Head preview kept inside a stub, so the model still knows what it's pointing at. */
  stubHeadChars: number;
  /** Most-recent turns always sent verbatim, never indexed. */
  recentTurns: number;
  /** Per-turn cap for the older turns that become one-line index entries. */
  turnGistChars: number;
}

// Tuned so a normal back-and-forth never compresses at all: a chat only crosses
// these once it carries genuinely bulky inheritance (a PDF/site/transcript node)
// or has run long. Compression that fires on turn three would just add tool
// round-trips for no saving.
export const COMPRESSION_BUDGET: CompressionBudget = {
  lineageChars: 2000,
  stubHeadChars: 400,
  recentTurns: 6,
  turnGistChars: 120,
};

/** Rough token count — ~4 chars/token. Used only to report savings, never to bill. */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}

// ── Lineage ──────────────────────────────────────────────────────────────────

export interface LineageEntry {
  kind: string;
  title: string;
  /** The verbatim body ChatNode would otherwise inline. */
  content: string;
  /** file nodes: source path — kept in the stub so the pointer stays specific. */
  path?: string;
  /** True when this entry's file lives in an Atlas-indexed project. */
  indexed?: boolean;
}

export interface CompressedContent {
  content: string;
  /** True when `content` is a stub rather than the original body. */
  compressed: boolean;
  savedChars: number;
}

// Cut at a line boundary when one is close to the limit, so the head preview
// doesn't end mid-token and read as corrupt.
function headOf(body: string, max: number): string {
  const slice = body.slice(0, max);
  const nl = slice.lastIndexOf("\n");
  return nl > max * 0.6 ? slice.slice(0, nl) : slice;
}

/**
 * Replace an over-budget lineage body with a stub that names its own retrieval
 * call. Under budget, the body is returned untouched — compression never
 * degrades a chat that isn't actually expensive.
 */
export function compressLineageContent(
  entry: LineageEntry,
  budget: CompressionBudget = COMPRESSION_BUDGET,
): CompressedContent {
  const body = entry.content ?? "";
  if (body.length <= budget.lineageChars) {
    return { content: body, compressed: false, savedChars: 0 };
  }

  const head = headOf(body, budget.stubHeadChars);
  const lines = [
    `[compressed — ${body.length.toLocaleString()} chars held out of context, retrievable in full]`,
    entry.path ? `Source: ${entry.path}` : "",
    "",
    "Opening lines:",
    head,
    "…",
    "",
    `Full body: call \`read_canvas_node\` with title "${entry.title}".`,
    entry.indexed
      ? "Structure, symbols and call sites for this file: query the Atlas tools " +
        "(`atlas_*`) — this project is indexed, so ask the graph instead of re-reading the file."
      : "",
  ].filter(Boolean);

  const content = lines.join("\n");
  return { content, compressed: true, savedChars: Math.max(0, body.length - content.length) };
}

// ── History ──────────────────────────────────────────────────────────────────

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Flatten persisted messages into the text-only turns the model actually sees.
 *
 * Shared deliberately: ChatNode builds the outgoing history with this, and the
 * `read_thread_history` tool resolves turn numbers with it. One function means
 * the "#4" in the index and the "#4" the tool returns cannot drift apart.
 */
export function toHistoryTurns(msgs: ChatMessage[]): HistoryTurn[] {
  return msgs.map((m) => ({
    role: m.role,
    content: m.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.content)
      .join(""),
  }));
}

export interface CompressedHistory {
  /** The turns to actually send. */
  turns: HistoryTurn[];
  /** `## Earlier in this thread` block for the system prompt; "" when nothing was elided. */
  index: string;
  elidedCount: number;
  savedChars: number;
}

function gist(text: string, max: number): string {
  const flat = (text ?? "").trim().replace(/\s+/g, " ");
  if (!flat) return "(no text)";
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

/**
 * Keep the most recent turns verbatim; replace everything older with a numbered
 * one-line index. Turn numbers are 1-based over the ORIGINAL list, which is what
 * `read_thread_history` takes — so any indexed turn can be pulled back whole.
 */
export function compressHistory(
  turns: HistoryTurn[],
  budget: CompressionBudget = COMPRESSION_BUDGET,
): CompressedHistory {
  if (turns.length <= budget.recentTurns) {
    return { turns, index: "", elidedCount: 0, savedChars: 0 };
  }

  // The kept window must OPEN on a user turn: Anthropic rejects a message list
  // whose first entry is an assistant turn, and an arbitrary cut lands on one
  // half the time. Walk the cut backwards to the nearest user turn — erring
  // towards keeping one turn too many, never towards a request that 400s.
  let cut = turns.length - budget.recentTurns;
  while (cut > 0 && turns[cut].role !== "user") cut--;
  // Walked all the way back — there is no user turn to cut at, so send the
  // history whole rather than emitting an index of nothing.
  if (cut === 0) return { turns, index: "", elidedCount: 0, savedChars: 0 };

  const older = turns.slice(0, cut);
  const recent = turns.slice(cut);

  const entries = older.map((t, i) => `- #${i + 1} ${t.role}: ${gist(t.content, budget.turnGistChars)}`);
  const index =
    "## Earlier in this thread (compressed)\n" +
    `The first ${cut} turn${cut === 1 ? "" : "s"} of this conversation are held out of context as ` +
    "one-line summaries. They are NOT lost — to read any of them verbatim, call " +
    "`read_thread_history` with the turn numbers below (e.g. `{ from: 1, to: 3 }`). " +
    "Do that whenever an earlier decision, constraint or detail matters and the summary is too thin.\n\n" +
    entries.join("\n");

  const before = older.reduce((n, t) => n + t.content.length, 0);
  return {
    turns: recent,
    index,
    elidedCount: cut,
    savedChars: Math.max(0, before - index.length),
  };
}

// ── System-prompt steer ──────────────────────────────────────────────────────

/**
 * Appended to the system prompt while compression is on. Retrieval only pays off
 * if the model knows it is allowed — and expected — to go fetch.
 */
export function compressionSystemNote(indexed: boolean): string {
  return (
    "## Context compression is ON\n" +
    "Bulky content in this context has been replaced by stubs that name their own retrieval call. " +
    "Treat a stub as a pointer, not as the whole story: when a stub is relevant to the answer, " +
    "fetch it before reasoning about it rather than guessing from the preview. " +
    (indexed
      ? "For anything about this codebase's structure — where a symbol is defined, what calls what — " +
        "query the Atlas tools (`atlas_*`) first; they answer from a pre-built graph and cost far " +
        "less than reading files back in. Fall back to `read_file` only for content the graph can't serve."
      : "Use `read_canvas_node` and `read_thread_history` to pull back anything that was held out.")
  );
}
