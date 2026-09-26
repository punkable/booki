import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const arch = process.argv[2];
if (!["x64", "arm64"].includes(arch)) throw new Error("Expected x64 or arm64.");
const target = arch === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc";
const root = join("src-tauri", "target", target, "release", "bundle");
function requireBundle(kind, suffix) {
  const folder = join(root, kind);
  const files = existsSync(folder) ? readdirSync(folder) : [];
  if (!files.some((file) => file.startsWith("Booki_") && file.endsWith(suffix))) {
    throw new Error(`Missing ${arch} ${kind} ${suffix} bundle in ${folder}.`);
  }
}
requireBundle("nsis", `_${arch}-setup.exe`);
if (arch === "x64") requireBundle("msi", `_${arch}_en-US.msi`);
console.log(`${arch} installer set complete.`);
