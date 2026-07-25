/* Verify localization health:
     1. every language defines the same keys (parity), and
     2. every literal t("…") call references a key that actually exists.

   (2) is exact and always fatal — a typo there ships a raw key like
   "be.reveal" to the user. (1) is enforced as a ratchet: the keys that are
   already missing today live in i18n-baseline.json, so CI stays green while
   they are being translated, but any NEW gap fails the build. Delete the
   baseline once it reaches zero. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts", "i18n-baseline.json");
const REFERENCE = "en"; // the language t() ultimately falls back to

const { DICT } = await import(pathToFileURL(path.join(ROOT, "src/i18n.js")).href);
const { EXTRA } = await import(pathToFileURL(path.join(ROOT, "src/i18n-extra.js")).href);

const dicts = { ...DICT, ...EXTRA };
const langs = Object.keys(dicts).sort();
if (!dicts[REFERENCE]) {
  console.error(`i18n check failed: no "${REFERENCE}" dictionary`);
  process.exit(1);
}

// Union of every key defined anywhere — a key only present in Spanish is still
// a key the product uses, so it must exist everywhere.
const allKeys = new Set();
for (const l of langs) for (const k of Object.keys(dicts[l])) allKeys.add(k);

const missing = {}; // lang -> [keys]
for (const l of langs) {
  const have = new Set(Object.keys(dicts[l]));
  const gaps = [...allKeys].filter((k) => !have.has(k)).sort();
  if (gaps.length) missing[l] = gaps;
}

// ── Literal t("…") call sites must resolve ────────────────────────────────
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const refKeys = new Set(Object.keys(dicts[REFERENCE]));
const unknown = [];
for (const file of walk(path.join(ROOT, "src"))) {
  if (/i18n(-extra)?\.js$/.test(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // Only literal calls: t("a.b"). Dynamic ones — t("kf." + name) — cannot be
    // checked statically and are skipped rather than guessed at.
    for (const m of line.matchAll(/\bt\(\s*"([^"]+)"\s*\)/g)) {
      const key = m[1];
      if (!refKeys.has(key) && !allKeys.has(key)) {
        unknown.push(`${path.relative(ROOT, file)}:${i + 1}  t("${key}")`);
      }
    }
  });
}

// ── Report ────────────────────────────────────────────────────────────────
const updating = process.argv.includes("--update-baseline");
let baseline = {};
if (fs.existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).missing || {};
}

if (updating) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        note:
          "Keys already missing when the i18n check was introduced. CI fails on " +
          "any NEW gap, not on these. Shrink this to {} and delete the file.",
        missing,
      },
      null,
      2
    )}\n`
  );
  const total = Object.values(missing).reduce((n, a) => n + a.length, 0);
  console.log(`i18n baseline written: ${total} known gaps across ${Object.keys(missing).length} languages`);
  process.exit(0);
}

const errors = [];
for (const [lang, keys] of Object.entries(missing)) {
  const known = new Set(baseline[lang] || []);
  const fresh = keys.filter((k) => !known.has(k));
  if (fresh.length) {
    errors.push(`${lang}: ${fresh.length} new missing key(s)\n    ${fresh.join("\n    ")}`);
  }
}
// A key that was in the baseline but is now defined is progress — report it so
// the baseline can be trimmed, but never fail on it.
const fixed = [];
for (const [lang, keys] of Object.entries(baseline)) {
  const stillMissing = new Set(missing[lang] || []);
  const done = keys.filter((k) => !stillMissing.has(k));
  if (done.length) fixed.push(`${lang}: ${done.length} baseline key(s) now translated`);
}

for (const u of unknown) errors.push(`unknown key: ${u}`);

console.log(`Languages: ${langs.join(", ")}  |  ${allKeys.size} keys total`);
for (const l of langs) {
  const have = Object.keys(dicts[l]).length;
  const pct = Math.round((have / allKeys.size) * 100);
  console.log(`  ${l}: ${have}/${allKeys.size} (${pct}%)`);
}
if (fixed.length) console.log(`\nProgress:\n  ${fixed.join("\n  ")}\n  → re-run with --update-baseline to trim.`);

if (errors.length) {
  console.error(`\ni18n check failed:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log("\ni18n check passed.");
