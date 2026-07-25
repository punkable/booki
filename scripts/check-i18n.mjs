/* Verify localization health:
     1. every language defines the same keys (parity), and
     2. every literal t("…") call references a key that actually exists.

   Both are exact and both are fatal. A typo in (2) ships a raw key like
   "be.reveal" to the user; a gap in (1) silently falls back to English, which
   is worse than a visible error because it looks deliberate.

   This started as a ratchet against a baseline of 243 already-missing keys,
   so CI could stay green while they were translated. They are all translated
   now, the baseline is gone, and the rule is simply: every language defines
   every key. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
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
const errors = [];
for (const [lang, keys] of Object.entries(missing)) {
  errors.push(`${lang}: ${keys.length} missing key(s)\n    ${keys.join("\n    ")}`);
}
for (const u of unknown) errors.push(`unknown key: ${u}`);

console.log(`Languages: ${langs.join(", ")}  |  ${allKeys.size} keys total`);
for (const l of langs) {
  const have = Object.keys(dicts[l]).length;
  const pct = Math.round((have / allKeys.size) * 100);
  console.log(`  ${l}: ${have}/${allKeys.size} (${pct}%)`);
}

if (errors.length) {
  console.error(`\ni18n check failed:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log("\ni18n check passed.");
