import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const arch = process.argv[2];
if (!["x64", "arm64"].includes(arch)) throw new Error("Expected x64 or arm64.");
const prefix = "Booki_";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const target = arch === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc";
const root = join("src-tauri", "target", target, "release", "bundle");
function requireBundle(kind, suffixes) {
  const folder = join(root, kind);
  const files = existsSync(folder) ? readdirSync(folder) : [];
  const expected = suffixes.map((suffix) => `${prefix}${version}${suffix}`);
  for (const name of expected) if (!files.includes(name)) {
    throw new Error(`Missing ${arch} ${kind} ${name} bundle in ${folder}.`);
  }
  if (files.some((file) => /\.(exe|msi)$/.test(file) && !expected.includes(file))) throw new Error(`Mixed or stale installers in ${folder}.`);
}
requireBundle("nsis", [`_${arch}-setup.exe`]);
if (arch === "x64") {
  const configPath = join("src-tauri", "tauri.conf.json");
  const languages = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")).bundle?.windows?.wix?.language || ["en-US"] : ["en-US"];
  requireBundle("msi", languages.map((language) => `_${arch}_${language}.msi`));
}
console.log(`${arch} installer set complete.`);
