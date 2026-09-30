// One-shot migration: rewrites every `import ... from "lucide-react"` line
// into an import of `UiIcon` plus local component shims for each name used,
// preserving `as` aliases. Callers keep their JSX as-is.
//
// Run: node scripts/migrate-lucide.mjs
//
// ponytail: shim per file trades a few extra lines against a full JSX rewrite
// across 75 files. If a shim ever needs a special prop, edit that file only.

import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep, posix } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const SRC = join(REPO, "src");
const UI_ICON_ABS = join(SRC, "icons", "UiIcon");

function kebab(pascal) {
  return pascal
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/([0-9])([A-Za-z])/g, "$1-$2")
    .toLowerCase();
}

async function walk(dir) {
  const out = [];
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function toRelImport(fromFile) {
  let r = relative(dirname(fromFile), UI_ICON_ABS).split(sep).join(posix.sep);
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}

// Parse `Foo, Bar as Baz, Qux` → [{name:"Foo",alias:"Foo"},{name:"Bar",alias:"Baz"},...]
function parseSpecifiers(body) {
  return body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!m) throw new Error(`bad specifier: ${s}`);
      return { name: m[1], alias: m[2] ?? m[1] };
    });
}

function buildReplacement(specs, relPath) {
  const shimLines = specs
    .map((s) => `const ${s.alias} = (p: any) => <UiIcon name="${kebab(s.name)}" {...p} />;`)
    .join("\n");
  return `import { UiIcon } from "${relPath}";\n${shimLines}`;
}

const IMPORT_RE = /import\s*\{([^{}]*?)\}\s*from\s*["']lucide-react["'];?/g;

let changed = 0, scanned = 0;
const files = await walk(SRC);
for (const f of files) {
  if (!f.endsWith(".tsx")) continue;
  scanned++;
  const orig = readFileSync(f, "utf-8");
  if (!orig.includes("lucide-react")) continue;
  const relPath = toRelImport(f);
  let replaced = orig;
  let hit = false;
  replaced = replaced.replace(IMPORT_RE, (_m, body) => {
    hit = true;
    const specs = parseSpecifiers(body);
    return buildReplacement(specs, relPath);
  });
  if (!hit) continue;
  writeFileSync(f, replaced);
  changed++;
}
console.log(`scanned ${scanned} .tsx files; rewrote ${changed}`);
