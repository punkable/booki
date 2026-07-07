import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  ".git",
  "dist",
  "node_modules",
  "target",
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".nsh",
  ".rs",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);

const ROOT_TEXT_FILES = new Set([
  "LICENSE",
]);

const NEEDLES = [
  ["latin1-encoded emoji", "\u00f0\u0178"],
  ["mojibake quote/dash", "\u00e2\u20ac"],
  ["mojibake variation selector", "\u00ef\u00b8"],
  ["replacement character", "\ufffd"],
  ["mojibake inverted mark", "\u00c2\u00a1"],
  ["mojibake middle dot", "\u00c2\u00b7"],
  ["mojibake nbsp", "\u00c2\u00a0"],
  ["mojibake a-acute", "\u00c3\u00a1"],
  ["mojibake e-acute", "\u00c3\u00a9"],
  ["mojibake i-acute", "\u00c3\u00ad"],
  ["mojibake o-acute", "\u00c3\u00b3"],
  ["mojibake u-acute", "\u00c3\u00ba"],
  ["mojibake n-tilde", "\u00c3\u00b1"],
  ["mojibake A-acute", "\u00c3\u0081"],
  ["mojibake E-acute", "\u00c3\u0089"],
  ["mojibake I-acute", "\u00c3\u008d"],
  ["mojibake O-acute", "\u00c3\u0093"],
  ["mojibake U-acute", "\u00c3\u009a"],
  ["mojibake N-tilde", "\u00c3\u0091"],
];

function isTextFile(filePath) {
  const name = path.basename(filePath);
  return ROOT_TEXT_FILES.has(name) || TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function shouldSkipDir(dirName) {
  return SKIP_DIRS.has(dirName) || dirName === "target";
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const hits = [];

  text.split(/\r?\n/).forEach((line, index) => {
    for (const [label, needle] of NEEDLES) {
      if (line.includes(needle)) {
        hits.push({ line: index + 1, label, text: line });
        break;
      }
    }
  });

  return hits;
}

function walk(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walk(path.join(dir, entry.name), results);
      continue;
    }

    const filePath = path.join(dir, entry.name);
    if (!isTextFile(filePath)) continue;

    const hits = scanFile(filePath);
    if (hits.length) results.push({ filePath, hits });
  }
}

const results = [];
walk(ROOT, results);

if (results.length) {
  console.error("Possible mojibake/encoding issues found:");
  for (const { filePath, hits } of results) {
    console.error(`\n${path.relative(ROOT, filePath)}`);
    for (const hit of hits.slice(0, 8)) {
      console.error(`  ${hit.line} [${hit.label}] ${hit.text}`);
    }
    if (hits.length > 8) console.error(`  ... ${hits.length - 8} more`);
  }
  process.exit(1);
}

console.log("Text encoding check passed.");
