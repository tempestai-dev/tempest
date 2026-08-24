// Codex hook trust — the piece that makes Codex actually fire our hooks.
//
// Codex (0.129+) only runs a hook whose handler is trusted in config.toml via a
// `[hooks.state."<key>"]` block carrying a `trusted_hash`. The hash is a SHA-256
// over a canonical identity of the handler, computed here from Codex's published
// algorithm (canonical_json + command_hook_hash). A wrong hash isn't destructive
// — Codex just ignores the untrusted hook and we fall back to PTY scraping —
// but a right one gives precise status.
//
// Self-contained + synchronous (no Web Crypto) so the install path and the node
// self-check share one implementation; the SHA-256 is checked against a known
// vector in installer.check.ts.

// PascalCase hooks.json event key → snake_case trust label (codex-rs serde).
export const CODEX_EVENT_LABEL: Record<string, string> = {
  SessionStart: "session_start",
  UserPromptSubmit: "user_prompt_submit",
  PreToolUse: "pre_tool_use",
  PermissionRequest: "permission_request",
  PostToolUse: "post_tool_use",
  Stop: "stop",
};

export interface CodexTrustEntry {
  sourcePath: string; // path to hooks.json (the "key_source")
  eventLabel: string; // snake_case
  groupIndex: number;
  handlerIndex: number;
  command: string;
  timeoutSec: number;
}

// Codex drops the matcher for these events before hashing; ours have no matcher
// anyway, so this only matters if a matcher were ever added.
function matcherForEvent(label: string, matcher: string | undefined): string | undefined {
  if (label === "user_prompt_submit" || label === "stop") return undefined;
  return matcher;
}

// Recursively sort object keys (Codex's canonical_json); arrays keep order.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

// Reproduces Codex's command_hook_hash: sha256 of the canonical
// { event_name, matcher?, hooks: [handler] } identity.
export function computeTrustedHash(entry: CodexTrustEntry): string {
  const handler: Record<string, unknown> = {
    type: "command",
    command: entry.command,
    timeout: Math.max(1, entry.timeoutSec),
    async: false,
  };
  const identity: Record<string, unknown> = { event_name: entry.eventLabel, hooks: [handler] };
  const matcher = matcherForEvent(entry.eventLabel, undefined);
  if (matcher !== undefined) identity.matcher = matcher;
  const serialized = JSON.stringify(canonicalize(identity));
  return "sha256:" + sha256Hex(serialized);
}

export function trustKey(entry: CodexTrustEntry): string {
  return `${entry.sourcePath}:${entry.eventLabel}:${entry.groupIndex}:${entry.handlerIndex}`;
}

function escapeTomlBasic(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Upsert a trust block for each entry into config.toml (append if absent, replace
// its hash/enabled if present). Byte-preserves the rest of the file. Returns the
// updated content, or the input unchanged when every block already matches.
export function upsertTrustBlocks(content: string, entries: CodexTrustEntry[]): string {
  let out = content;
  for (const entry of entries) {
    const key = trustKey(entry);
    const hash = computeTrustedHash(entry);
    const block = [`[hooks.state."${escapeTomlBasic(key)}"]`, "enabled = true", `trusted_hash = "${hash}"`].join("\n");
    const range = findBlockRange(out, key);
    if (range) {
      out = out.slice(0, range.start) + block + "\n" + out.slice(range.end);
    } else {
      const sep = out.length === 0 ? "" : out.endsWith("\n\n") ? "" : out.endsWith("\n") ? "\n" : "\n\n";
      out = `${out}${sep}${block}\n`;
    }
  }
  return out;
}

// Remove trust blocks whose key targets one of our (sourcePath, label) pairs.
export function removeTrustBlocks(content: string, sourcePath: string, labels: Set<string>): { content: string; changed: boolean } {
  let out = "";
  let cursor = 0;
  let changed = false;
  const headerRe = /^\[hooks\.state\."((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m: RegExpExecArray | null;
  const ranges: { start: number; end: number }[] = [];
  while ((m = headerRe.exec(content)) !== null) {
    const key = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const parsed = parseKey(key);
    if (parsed && samePath(parsed.sourcePath, sourcePath) && labels.has(parsed.eventLabel)) {
      const start = m.index;
      const end = nextHeaderOrEnd(content, headerRe.lastIndex);
      ranges.push({ start, end });
      headerRe.lastIndex = end;
    }
  }
  for (const r of ranges) {
    out += content.slice(cursor, r.start);
    cursor = r.end;
    changed = true;
  }
  out += content.slice(cursor);
  return { content: out, changed };
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

function parseKey(key: string): { sourcePath: string; eventLabel: string } | null {
  // key = <sourcePath>:<label>:<group>:<handler>; sourcePath may contain ':'.
  const parts = key.split(":");
  if (parts.length < 4) return null;
  const handler = parts.pop()!;
  const group = parts.pop()!;
  const label = parts.pop()!;
  if (!/^\d+$/.test(handler) || !/^\d+$/.test(group)) return null;
  return { sourcePath: parts.join(":"), eventLabel: label };
}

function findBlockRange(content: string, key: string): { start: number; end: number } | null {
  const header = `[hooks.state."${escapeTomlBasic(key)}"]`;
  const idx = content.indexOf(header);
  if (idx === -1) return null;
  return { start: idx, end: nextHeaderOrEnd(content, idx + header.length) };
}

// End of a block = the next `[` table header at line start, or EOF.
function nextHeaderOrEnd(content: string, from: number): number {
  const re = /^\[/gm;
  re.lastIndex = from;
  const m = re.exec(content);
  return m ? m.index : content.length;
}

// ── pure synchronous SHA-256 ─────────────────────────────────────────────────
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256Hex(message: string): string {
  const bytes = utf8Bytes(message);
  const l = bytes.length;
  const withOne = new Uint8Array((((l + 8) >> 6) + 1) << 6);
  withOne.set(bytes);
  withOne[l] = 0x80;
  const bitLen = l * 8;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, bitLen >>> 0);
  dv.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000));

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let off = 0; off < withOne.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = s.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}
