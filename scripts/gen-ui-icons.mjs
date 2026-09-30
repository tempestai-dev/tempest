// Reads lucide-react's per-icon .mjs files, emits SVGs into
// src-tauri/resources/extensions/tempest.default-ui/ui/ for the tempest-ui pack.
// Run: node scripts/gen-ui-icons.mjs
//
// Emitted SVGs use CSS custom props so UiIcon can override at render time:
//   stroke-width="var(--icon-sw, 2)"
//   fill="var(--icon-fill, none)"
// Stroke color inherits via currentColor, so the parent's `color` propagates.
//
// ponytail: single script, no build wiring, re-run only when the icon set changes.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const LUCIDE_DIR = join(REPO, "node_modules", "lucide-react", "dist", "esm", "icons");
const OUT_DIR = join(REPO, "src-tauri", "resources", "extensions", "tempest.default-ui", "ui");

const NAMES = [
  "AlertTriangle","AlignCenterHorizontal","AlignCenterVertical","AlignEndHorizontal","AlignEndVertical",
  "AlignHorizontalDistributeCenter","AlignStartHorizontal","AlignStartVertical","AlignVerticalDistributeCenter",
  "ArrowLeft","ArrowRight","ArrowUp","BarChart3","Bell","BellOff","Bold","BookOpen","Bot","Brain","Bug",
  "Captions","CaptionsOff","Check","CheckCircle2","ChevronDown","ChevronLeft","ChevronRight",
  "ChevronsDownUp","ChevronsUpDown","CircleArrowRight","Code","Code2","Cog","Columns","Columns2","Command",
  "Copy","Cpu","Database","Download","Eraser","ExternalLink","Eye","EyeOff","FilePlus2","FileText",
  "FlaskConical","FoldVertical","Folder","FolderPlus","Gauge","Ghost","GitBranch","GitCommit",
  "GitCommitHorizontal","GitPullRequest","Globe","GripVertical","HardDrive","Heading1","Heading2","Heading3",
  "Hexagon","Image","ImagePlus","Info","Italic","KeyRound","Keyboard","LayoutGrid","Link","List",
  "ListChecks","ListOrdered","Loader","Loader2","Lock","Mail","Maximize2","Megaphone","MessageSquare",
  "MessagesSquare","Minimize2","Minus","Monitor","Moon","MoreHorizontal","MoreVertical","Package","Palette",
  "PanelLeft","PanelRight","Pause","Pencil","PencilLine","Pin","Play","Plus","Quote","Radio","RefreshCw",
  "Rocket","RotateCcw","Rows","Rows2","Search","Send","Settings","Shield","ShieldAlert","ShieldCheck",
  "SlidersHorizontal","Smartphone","Sparkles","SplitSquareHorizontal","Square","SquareTerminal","StickyNote",
  "Strikethrough","Sun","SunMoon","Tablet","Terminal","TerminalSquare","Trash","Trash2","Underline",
  "UnfoldVertical","Waypoints","Workflow","WrapText","Wrench","X","XCircle","Zap","ZoomIn","ZoomOut",
];

// PascalCase -> kebab-case (lucide file basename). Handles digit boundaries.
function kebab(pascal) {
  return pascal
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/([0-9])([A-Za-z])/g, "$1-$2")
    .toLowerCase();
}

// Very small attr renderer — order-agnostic, self-closes.
function renderNode([tag, attrs, children]) {
  const attrStr = Object.entries(attrs)
    .filter(([k]) => k !== "key") // drop React key
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
  if (children && children.length) {
    return `<${tag} ${attrStr}>${children.map(renderNode).join("")}</${tag}>`;
  }
  return `<${tag} ${attrStr}/>`;
}

// Extract the `node` array from a lucide .mjs file. Follows one level of
// re-export (e.g., `columns.mjs` re-exports `columns-2.mjs`). We can't
// `import()` because the module references lucide's runtime; parse instead.
function extractNodes(mjsSrc, resolveNeighbor) {
  const reExport = mjsSrc.match(/export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([^'"]+)['"]/);
  if (reExport) {
    const nextSrc = resolveNeighbor(reExport[1]);
    return extractNodes(nextSrc, resolveNeighbor);
  }
  // Find `node:` then match balanced brackets.
  const start = mjsSrc.search(/\bnode\s*:\s*\[/);
  if (start < 0) throw new Error("no node array");
  const openIdx = mjsSrc.indexOf("[", start);
  let depth = 0, i = openIdx;
  for (; i < mjsSrc.length; i++) {
    const c = mjsSrc[i];
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = mjsSrc.slice(openIdx, i);
  // Body is JS-ish (unquoted keys). Wrap in a Function.
  return new Function(`return (${literal});`)();
}

function buildSvg(nodes) {
  const inner = nodes.map(renderNode).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--icon-fill,none)" stroke="currentColor" stroke-width="var(--icon-sw,2)" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;
}

mkdirSync(OUT_DIR, { recursive: true });

// Delete any leftover SVGs no longer in NAMES so orphans don't linger.
const wanted = new Set(NAMES.map((n) => `${kebab(n)}.svg`));
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith(".svg") && !wanted.has(f)) {
    try { unlinkSync(join(OUT_DIR, f)); } catch {}
  }
}

const resolveNeighbor = (rel) => readFileSync(join(LUCIDE_DIR, rel), "utf-8");

let ok = 0, fail = 0;
for (const pascal of NAMES) {
  const k = kebab(pascal);
  try {
    const src = readFileSync(join(LUCIDE_DIR, `${k}.mjs`), "utf-8");
    const nodes = extractNodes(src, resolveNeighbor);
    writeFileSync(join(OUT_DIR, `${k}.svg`), buildSvg(nodes));
    ok++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${pascal} (${k}):`, e.message);
  }
}
console.log(`wrote ${ok} SVGs; ${fail} failures; out=${OUT_DIR}`);
