/* Verify icon("…") names resolve and every emoji.js token has an asset. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const EMOJI_DIR = path.join(ROOT, "assets", "emoji");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|html)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const iconsSrc = read("src/icons.js");
const iconKeys = new Set();
for (const m of iconsSrc.matchAll(/^\s*(?:["']([a-z0-9-]+)["']|([a-z0-9]+))\s*:\s*icon/gim)) {
  iconKeys.add(m[1] || m[2]);
}

const emojiSrc = read("src/emoji.js");
const namesBlock = emojiSrc.match(/const NAMES = \[([\s\S]*?)\];/);
if (!namesBlock) {
  console.error("Icon/emoji check failed:\n  - could not find NAMES array in src/emoji.js");
  process.exit(1);
}
const emojiSet = new Set([...namesBlock[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));

const errors = [];

for (const name of emojiSet) {
  const png = path.join(EMOJI_DIR, `${name}.png`);
  if (!fs.existsSync(png)) errors.push(`missing emoji asset: assets/emoji/${name}.png`);
}

const files = walk(SRC);
const iconCall = /icon\(\s*["']([a-z0-9-]+)["']\s*\)/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(iconCall)) {
    if (!iconKeys.has(m[1])) {
      errors.push(`${path.relative(ROOT, file)}: unknown icon("${m[1]}")`);
    }
  }
}

const emoCall = /(?:emo|emoSrc)\(\s*["']([a-z0-9-]+)["']/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(emoCall)) {
    if (!emojiSet.has(m[1])) {
      errors.push(`${path.relative(ROOT, file)}: unknown emoji("${m[1]}")`);
    }
  }
}

if (!iconKeys.size) errors.push("failed to parse iconMap from src/icons.js");
if (!emojiSet.size) errors.push("failed to parse emoji names from src/emoji.js");

if (errors.length) {
  console.error("Icon/emoji check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log(
  `Icon check passed (${iconKeys.size} icons, ${emojiSet.size} emojis, ${files.length} source files).`
);
