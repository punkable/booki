import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
const output = join("dist", "release-assets");
mkdirSync(output, { recursive: true });
const platforms = {};
for (const [target, arch, platform] of [
  ["x86_64-pc-windows-msvc", "x64", "windows-x86_64"],
  ["aarch64-pc-windows-msvc", "arm64", "windows-aarch64"],
]) {
  const dir = join("src-tauri", "target", target, "release", "bundle", "nsis");
  if (!existsSync(dir)) throw new Error(`Missing ${dir}.`);
  const installer = readdirSync(dir).find((name) => name === `Booki_${version}_${arch}-setup.exe`);
  if (!installer) throw new Error(`Missing signed ${arch} NSIS installer.`);
  const signatureFile = join(dir, `${installer}.sig`);
  if (!existsSync(signatureFile)) throw new Error(`Missing ${signatureFile}.`);
  const signature = readFileSync(signatureFile, "utf8").trim();
  if (!signature) throw new Error(`Empty ${signatureFile}.`);
  copyFileSync(join(dir, installer), join(output, installer));
  copyFileSync(signatureFile, join(output, `${installer}.sig`));
  platforms[platform] = { signature, url: `https://github.com/punkable/booki/releases/download/${tag}/${installer}` };
}
const msiDir = join("src-tauri", "target", "x86_64-pc-windows-msvc", "release", "bundle", "msi");
const msi = existsSync(msiDir) ? readdirSync(msiDir).find((name) => name === `Booki_${version}_x64_en-US.msi`) : null;
if (!msi) throw new Error("Missing x64 MSI installer.");
copyFileSync(join(msiDir, msi), join(output, msi));
const notesPath = join("docs", "releases", `${tag}.md`);
const notes = existsSync(notesPath) ? readFileSync(notesPath, "utf8").trim() : "";
writeFileSync(join(output, "latest.json"), `${JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`);
console.log(`Prepared ${tag} with x64, arm64 and MSI assets.`);
