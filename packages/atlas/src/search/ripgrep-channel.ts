/**
 * Ripgrep third seed channel — closes the "literal token, no indexed field"
 * miss (atlas-extension-plan note #7).
 *
 * FTS indexes {name, qualifiedName, docstring, signature} and vector embeds a
 * structural summary of the same fields. Neither sees JSX text children, CSS
 * class names, string literals, log messages, or error copy — so a query like
 * "Beta badge on the Automations button" (a `<span>Beta</span>` inside a
 * `className="sidebar-nav-badge"`) loses to grep. Fold ripgrep into the seed
 * pool and RRF-fuse it alongside FTS + vector so ONE atlas_explore call still
 * returns one ranked answer, and the tool stops losing to grep on UI/text
 * queries.
 *
 * Design goals:
 *  - Silent no-op if `rg` isn't on PATH — Atlas stays exactly today's tool.
 *  - Bounded work: cap match count, cap file count, ignore .git/node_modules,
 *    respect .gitignore (rg default). No shell interpolation of user query.
 *  - Map each file:line hit to the enclosing indexed node (start_line <= line
 *    <= end_line). Un-mapped hits are dropped — they'd have no node to seed.
 */
import { spawnSync } from 'child_process';
import type { QueryBuilder } from '../db/queries';
import type { SearchResult, Node } from '../types';
import { logDebug } from '../errors';

const MAX_HITS = 200; // ripgrep --max-count fan-out cap (per file)
const RG_TIMEOUT_MS = 2500;
// Query patterns shorter than this are too noisy to grep for — a 2-char pattern
// on a large repo returns tens of thousands of hits and buries the real answer.
const MIN_PATTERN_LEN = 3;

/**
 * Prose stop-words that inflate rg's hit set without carrying signal. Only
 * consulted for tokens that DON'T look identifier-shaped — a capitalized or
 * snake_case token beats stop-word filtering (e.g. `The` in `TheClass` isn't
 * a stop word). Kept intentionally small: covers the highest-frequency English
 * words in code + prose queries, not a full NLP list — extra entries are
 * essentially free (Set lookup) but a bigger list drifts toward filtering out
 * legitimate short symbol names.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been',
  'will', 'would', 'could', 'should', 'does', 'done', 'may', 'has', 'had',
  'was', 'were', 'are', 'not', 'but', 'about', 'into', 'over', 'through',
  'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whose',
  'too', 'very', 'just', 'also', 'only', 'even', 'more', 'most', 'much',
  'many', 'some', 'any', 'all', 'each', 'both', 'either', 'neither',
  'here', 'there', 'then', 'than', 'them', 'their', 'these', 'those',
  'like', 'because', 'while', 'during', 'after', 'before', 'until',
  'above', 'below', 'between', 'against', 'without',
]);

/**
 * True iff `rg` looks callable AND the operator hasn't opted out. Result is
 * cached module-wide since it's a fixed property of the environment.
 * `spawnSync` with `--version` is a few ms once. Set `ATLAS_GREP=off` (or `0`,
 * `false`, `no`) to force-disable — used by the A/B harness to measure the
 * channel's contribution against pre-Rung-2 behavior, and available as an
 * escape hatch if a project's rg is pathologically slow.
 */
let rgAvailable: boolean | null = null;
export function isRipgrepAvailable(): boolean {
  if (rgAvailable !== null) return rgAvailable;
  const off = (process.env.ATLAS_GREP ?? '').trim().toLowerCase();
  if (off === 'off' || off === '0' || off === 'false' || off === 'no') {
    rgAvailable = false;
    return false;
  }
  try {
    const r = spawnSync('rg', ['--version'], { timeout: 1000, stdio: 'ignore' });
    rgAvailable = r.status === 0;
  } catch {
    rgAvailable = false;
  }
  return rgAvailable;
}

/**
 * Should we skip rg entirely for this query? Identifier-heavy queries (the
 * agent typed symbol names) are what FTS is authoritative for — running grep
 * on top costs the spawn latency and can only inject noise. "Identifier-heavy"
 * = ≥2 tokens where the majority look identifier-shaped (CamelCase, has `_`
 * or `-`, or contains a digit). A single-identifier prose query still runs
 * grep so a mixed query like "Beta badge on the Automations button" keeps its
 * UI-copy affordance.
 */
export function shouldSkipGrep(query: string): boolean {
  // Split on whitespace, not on `[^A-Za-z0-9_]+` — the hyphens in `server-entry`
  // and `--asset-add` are the identifier signal; splitting them off first strips
  // exactly the shape we want to detect. Leading punctuation (`--`) is trimmed
  // so `--asset-add` still counts as one length-≥3 token.
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/^\W+|\W+$/g, ''))
    .filter((t) => t.length >= MIN_PATTERN_LEN);
  if (tokens.length < 2) return false;
  const identShape = (t: string): boolean =>
    /[A-Z]/.test(t) || /[_-]/.test(t) || /\d/.test(t);
  const identCount = tokens.filter(identShape).length;
  // At least 2 identifier tokens AND identifiers dominate → symbol-search intent.
  return identCount >= 2 && identCount >= tokens.length * 0.6;
}

/** Extract the token set to grep from a natural-language query.
 *
 * Two-tier strategy so a prose-heavy query doesn't drown grep in stop-word
 * noise (the "Beta badge on the Automations button" regression: `the` alone
 * returned 10k+ hits, promoting unrelated central files into the entry-point
 * list). Precedence:
 *
 *   1. Identifier-shaped tokens (has an uppercase letter, `_`, or `-`) are
 *      high-signal — the agent typed a symbol name — so if ANY exist we use
 *      ONLY those and ignore the surrounding prose.
 *   2. Otherwise the query is prose: keep lowercase tokens that aren't in
 *      {@link STOP_WORDS}. This handles "onboarding welcome workspace flow"
 *      cleanly (all 4 survive) without letting "the/too/many" through.
 *
 * Returns [] when nothing survives — caller skips rg entirely, saving a spawn.
 */
export function extractGrepTerms(query: string): string[] {
  const raw = query.split(/[^A-Za-z0-9_]+/).filter((t) => t.length >= MIN_PATTERN_LEN);
  const looksLikeIdentifier = (t: string): boolean =>
    /[A-Z]/.test(t) || /[_-]/.test(t) || /\d/.test(t);

  // Dedup case-insensitively while preserving original case (rg -i handles case).
  const dedup = (tokens: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tokens) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  };

  const identifiers = raw.filter(looksLikeIdentifier);
  const chosen = identifiers.length > 0
    ? identifiers
    : raw.filter((t) => !STOP_WORDS.has(t.toLowerCase()));

  return dedup(chosen).slice(0, 6);
}

/**
 * Session cache of grep seed results, keyed by (projectRoot, query). The rg
 * spawn dominates the channel's cost (~50-100ms per query), and an agent
 * frequently re-issues the same query within a session — one hit here saves
 * the whole spawn. Bounded by SEEDS_CACHE_MAX to keep memory flat; LRU on
 * insert (drop oldest key when full). Cleared when the process exits (no
 * persistence needed — rg output is derivable and cheap on the miss path).
 */
const SEEDS_CACHE_MAX = 128;
const seedsCache = new Map<string, SearchResult[]>();

/**
 * Ripgrep seed channel: run a bounded rg over the project, map each file:line
 * hit to its enclosing indexed node, and return SearchResult[] ranked by hit
 * count per node (more hits in the same symbol = stronger signal).
 *
 * Returns [] silently when rg is missing, the query is empty/tiny, or nothing
 * matches — the caller then just runs without a grep channel (RRF fuses over
 * whichever channels contributed).
 */
export function computeGrepSeeds(
  queries: QueryBuilder,
  projectRoot: string,
  query: string,
  k: number,
): SearchResult[] {
  if (!isRipgrepAvailable()) return [];
  const terms = extractGrepTerms(query);
  if (terms.length === 0) return [];

  // Session cache: same query, same project → serve without spawning rg.
  const cacheKey = `${projectRoot}\0${query}\0${k}`;
  const cached = seedsCache.get(cacheKey);
  if (cached !== undefined) {
    // LRU touch: re-insert to move to newest position.
    seedsCache.delete(cacheKey);
    seedsCache.set(cacheKey, cached);
    return cached;
  }

  // (alt regex now built inside runRipgrep so it can attach each hit to its
  // originating term via --only-matching.)

  // Run rg with --only-matching so each hit carries WHICH term matched — lets
  // us rank by multi-term co-occurrence per node (a file that matches 3 distinct
  // query terms is a far stronger signal than one file with 30 hits of one
  // common term). Without this, grep returns noise on prose queries where a
  // common technical word like "JSON" flooded unrelated MCP config files and
  // regressed the "apply a JSON theme" query (dropped ThemeToggle/ThemeProvider
  // for write_atlas_mcp_config).
  let hits: Array<{ file: string; line: number; term: string }>;
  try {
    hits = runRipgrep(projectRoot, terms);
  } catch (err) {
    logDebug('ripgrep channel failed', { error: String(err) });
    return [];
  }
  if (hits.length === 0) return [];

  // Group by NODE id, tracking hit count AND the set of distinct query terms
  // that hit inside it (the multi-term signal).
  interface NodeAgg { hits: number; distinctTerms: Set<string> }
  const nodeAgg = new Map<string, NodeAgg>();
  const nodesByFileCache = new Map<string, Node[]>();
  for (const h of hits) {
    let fileNodes = nodesByFileCache.get(h.file);
    if (!fileNodes) {
      fileNodes = queries.getNodesByFile(h.file);
      nodesByFileCache.set(h.file, fileNodes);
    }
    if (fileNodes.length === 0) continue;
    // Smallest enclosing node wins — a method inside a class is more specific
    // than the class envelope, and that's the seed the agent actually wants.
    let best: Node | null = null;
    let bestSpan = Infinity;
    for (const n of fileNodes) {
      if (n.kind === 'file' || n.kind === 'import' || n.kind === 'export') continue;
      if (h.line < n.startLine || h.line > (n.endLine ?? n.startLine)) continue;
      const span = (n.endLine ?? n.startLine) - n.startLine + 1;
      if (span < bestSpan) { best = n; bestSpan = span; }
    }
    if (!best) continue;
    let agg = nodeAgg.get(best.id);
    if (!agg) { agg = { hits: 0, distinctTerms: new Set() }; nodeAgg.set(best.id, agg); }
    agg.hits++;
    agg.distinctTerms.add(h.term.toLowerCase());
  }

  // Rank by (distinct-term-count DESC, hits DESC). A node matching 2 distinct
  // terms outranks one with 30 hits of a single term. This is the same
  // corroboration signal the main pipeline uses to distinguish real matches
  // from single-word noise.
  const sorted = [...nodeAgg.entries()].sort((a, b) => {
    const dt = b[1].distinctTerms.size - a[1].distinctTerms.size;
    return dt !== 0 ? dt : b[1].hits - a[1].hits;
  });
  const out: SearchResult[] = [];
  for (const [id, agg] of sorted) {
    const node = queries.getNodeById(id);
    if (!node) continue;
    // Score encodes distinctness first, hits as tiebreak — so RRF rank
    // (derived from array order) reflects the multi-term signal.
    out.push({
      node,
      score: agg.distinctTerms.size * 1000 + agg.hits,
      channels: ['grep'],
    });
    if (out.length >= k) break;
  }

  // Cache-insert with LRU eviction.
  if (seedsCache.size >= SEEDS_CACHE_MAX) {
    const oldest = seedsCache.keys().next().value;
    if (oldest !== undefined) seedsCache.delete(oldest);
  }
  seedsCache.set(cacheKey, out);
  return out;
}

/** How many distinct query terms the top grep seed matched. Used by callers to
 * gate downstream trust — a top seed with 1 distinct term is single-word grep
 * (weak signal), ≥2 is corroborated (strong). */
export function grepTopDistinctTerms(seeds: SearchResult[]): number {
  if (seeds.length === 0) return 0;
  const top = seeds[0];
  return Math.floor((top?.score ?? 0) / 1000);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Invoke `rg` with --only-matching and parse `file:line:matchedText` output.
 * The matched text lets the caller reconstruct WHICH query term hit — the
 * multi-term co-occurrence signal that distinguishes real matches from
 * single-word noise. Bounded on multiple axes so a pathological pattern can't
 * hang or OOM Atlas: per-file match cap, wall-clock timeout, output-buffer
 * cap. Follows .gitignore + smart-case by default.
 */
function runRipgrep(projectRoot: string, terms: string[]): Array<{ file: string; line: number; term: string }> {
  const alt = terms.map(escapeRegex).join('|');
  const args = [
    '--no-heading',
    '--line-number',
    '--only-matching',           // emit only the matched substring, one per hit
    '--no-messages',
    '--color', 'never',
    '-i',                        // case-insensitive (matches FTS's default)
    '--max-count', String(MAX_HITS),
    '--max-columns', '500',      // skip minified/binary-ish lines
    '--glob', '!**/.git/**',
    '--glob', '!**/node_modules/**',
    '--glob', '!**/.atlas/**',
    '--glob', '!**/.tempest/**',
    '--glob', '!**/dist/**',
    '--glob', '!**/build/**',
    '--glob', '!**/target/**',
    '--glob', '!**/*.lock',
    '--glob', '!**/*.min.*',
    '--glob', '!**/*.map',
    // Only search files atlas can actually index — the DB stores no nodes for
    // docs/config, so a hit outside these types can't ever map to a node
    // (wasted rg work + wasted node-lookup). Cuts wall-clock ~30-50% on repos
    // with large docs/ or generated blob dirs.
    '--type-add', 'code:*.{ts,tsx,js,jsx,mjs,cjs,cs,py,go,rb,php,swift,rs,cpp,cc,cxx,c,h,hpp,java,kt,scala,lua,dart,vue,svelte,astro,liquid,twig,razor}',
    '-tcode',
    '-e', alt,
    '.',                         // explicit cwd path — without it, rg on a piped
                                 // stdin (Node's default) reads from stdin instead
                                 // of the filesystem and always exits 0 hits.
  ];
  const r = spawnSync('rg', args, {
    cwd: projectRoot,
    timeout: RG_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,  // 8 MB is plenty for 200 hits per file
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'], // defense-in-depth: also detach stdin
  });
  // Exit code 1 = no matches — legitimate, not an error. 2 = actual rg error.
  if (r.status !== 0 && r.status !== 1) return [];
  if (!r.stdout) return [];

  const out: Array<{ file: string; line: number; term: string }> = [];
  for (const raw of r.stdout.split('\n')) {
    if (!raw) continue;
    // rg --only-matching format: "path:line:matchedText" — split on the first
    // two ':' only, since both the path and the match can themselves contain ':'.
    const firstColon = raw.indexOf(':');
    if (firstColon <= 0) continue;
    const secondColon = raw.indexOf(':', firstColon + 1);
    if (secondColon <= firstColon) continue;
    // rg emits `./path` when given `.` as the search root; strip the prefix so
    // the file key matches what the DB stores (project-relative POSIX, no `./`).
    const file = raw.slice(0, firstColon).replace(/\\/g, '/').replace(/^\.\//, '');
    const lineStr = raw.slice(firstColon + 1, secondColon);
    const line = Number.parseInt(lineStr, 10);
    if (!Number.isFinite(line) || line <= 0) continue;
    const term = raw.slice(secondColon + 1);
    if (!term) continue;
    out.push({ file, line, term });
  }
  return out;
}
