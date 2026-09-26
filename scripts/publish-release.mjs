import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
const repo = process.env.GITHUB_REPOSITORY || "punkable/booki";
if (repo !== "punkable/booki") throw new Error(`Unexpected repository: ${repo}`);
if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN required.");
const source = join("dist", "release-assets");
const files = readdirSync(source);
const expected = ["latest.json", `Booki_${version}_x64-setup.exe`, `Booki_${version}_x64-setup.exe.sig`, `Booki_${version}_arm64-setup.exe`, `Booki_${version}_arm64-setup.exe.sig`, `Booki_${version}_x64_en-US.msi`];
if (expected.some((name) => !files.includes(name))) throw new Error("Release asset set incomplete.");
const gh = (...args) => execFileSync("gh", [...args, "--repo", repo], { encoding: "utf8" }).trim();
try {
  const existing = JSON.parse(gh("release", "view", tag, "--json", "isDraft"));
  if (!existing.isDraft) throw new Error(`${tag} is already published.`);
} catch (error) {
  if (error.message.includes("already published")) throw error;
  gh("release", "create", tag, "--verify-tag", "--draft", "--title", `Booki ${tag}`, "--notes", `Booki ${tag} for Windows. See README for installation.`);
}
gh("release", "upload", tag, ...expected.map((name) => join(source, name)), "--clobber");
const verifyDir = join("dist", "release-verify");
mkdirSync(verifyDir, { recursive: true });
gh("release", "download", tag, "--dir", verifyDir, "--clobber");
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
for (const name of expected) {
  if (hash(join(source, name)) !== hash(join(verifyDir, name))) throw new Error(`Downloaded asset differs: ${name}`);
}
gh("release", "edit", tag, "--draft=false");
if (JSON.parse(gh("release", "view", tag, "--json", "isDraft")).isDraft) throw new Error(`${tag} is still a draft.`);
console.log(`Published verified ${tag}.`);
