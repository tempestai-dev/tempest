// Runnable self-check for the UI-icon pack: `npx tsx src/icons/__uiIcon.test.ts`.
// Asserts (1) buildUiIconPath's extension-relative form, (2) every UiIcon
// `name=""` referenced in src/ resolves to a seeded SVG that uses currentColor
// and honours the --icon-sw / --icon-fill CSS vars UiIcon sets.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUiIconPath } from "./UiIconContext";

const __dirname = dirname(fileURLToPath(import.meta.url));

// (1) path builder
assert.equal(buildUiIconPath("./ui", "chevron-right"), "./ui/chevron-right.svg");
assert.equal(buildUiIconPath("./ui/", "x"), "./ui/x.svg");
assert.equal(buildUiIconPath("ui", "check"), "ui/check.svg");

// (2) pack contents
const packRoot = join(__dirname, "..", "..", "src-tauri", "resources", "extensions", "tempest.default-ui");
const manifest = JSON.parse(readFileSync(join(packRoot, "extension.json"), "utf8"));
assert.equal(manifest.contributes.uiIconPacks[0].format, "svg-directory");
const uiDir = join(packRoot, manifest.contributes.uiIconPacks[0].path.replace(/^\.\//, ""));

// Every seeded SVG is well-formed and uses the shared color/stroke contract.
const seededFiles = readdirSync(uiDir).filter((f) => f.endsWith(".svg"));
assert.ok(seededFiles.length >= 137, `expected 137+ seed SVGs, got ${seededFiles.length}`);
for (const f of seededFiles) {
  const body = readFileSync(join(uiDir, f), "utf8").trim();
  assert.ok(body.startsWith("<svg"), `not an SVG: ${f}`);
  assert.ok(body.includes("currentColor"), `must use currentColor: ${f}`);
  assert.ok(body.includes("--icon-sw"), `must honour --icon-sw override: ${f}`);
}

// (3) every UiIcon name="..." used in src/ has a matching SVG.
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) yield p;
  }
}
const srcDir = join(__dirname, "..");
const nameRe = /<UiIcon\s+name="([a-z0-9-]+)"/g;
const stringLiteralRe = /icon:\s*"([a-z0-9-]+)"/g; // covers chatModels tool-icon map
const referenced = new Set<string>();
for (const f of walk(srcDir)) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(nameRe)) if (m[1]) referenced.add(m[1]);
  if (f.endsWith("chatModels.ts")) for (const m of s.matchAll(stringLiteralRe)) if (m[1]) referenced.add(m[1]);
}
assert.ok(referenced.size > 0, "no <UiIcon name> references found");
const seededSet = new Set(seededFiles.map((f) => f.replace(/\.svg$/, "")));
const missing = [...referenced].filter((n) => n && !seededSet.has(n));
assert.deepEqual(missing, [], `unseeded icon names referenced in src/: ${missing.join(", ")}`);

console.log(`ok — UI icon pack invariants hold (${seededFiles.length} seeded, ${referenced.size} referenced)`);
