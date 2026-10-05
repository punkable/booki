import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
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
const notesPath = join("docs", "releases", `${tag}.md`);
const gh = (...args) => execFileSync("gh", [...args, "--repo", repo], { encoding: "utf8" }).trim();
try {
  const existing = JSON.parse(gh("release", "view", tag, "--json", "isDraft"));
  if (!existing.isDraft) throw new Error(`${tag} is already published.`);
} catch (error) {
  if (error.message.includes("already published")) throw error;
  const notesArgs = existsSync(notesPath) ? ["--notes-file", notesPath] : ["--notes", `Booki ${tag} for Windows. See README for installation.`];
  gh("release", "create", tag, "--verify-tag", "--draft", "--title", `Booki ${tag}`, ...notesArgs);
}
if (existsSync(notesPath)) gh("release", "edit", tag, "--notes-file", notesPath);
gh("release", "upload", tag, ...expected.map((name) => join(source, name)), "--clobber");
const verifyDir = join("dist", "release-verify");
mkdirSync(verifyDir, { recursive: true });
gh("release", "download", tag, "--dir", verifyDir, "--clobber");
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
for (const name of expected) {
  if (hash(join(source, name)) !== hash(join(verifyDir, name))) throw new Error(`Downloaded asset differs: ${name}`);
}
gh("release", "edit", tag, "--draft=false", "--latest");
if (JSON.parse(gh("release", "view", tag, "--json", "isDraft")).isDraft) throw new Error(`${tag} is still a draft.`);
const api = (...args) => execFileSync("gh", ["api", ...args], { encoding: "utf8" }).trim();
const latest = JSON.parse(api(`repos/${repo}/releases/latest`));
if (latest.tag_name !== tag) throw new Error(`${tag} is not the latest public release.`);
// Keep superseded installers privately for rollback, with only the verified
// replacement publicly downloadable. Tags and repository history are retained.
const releases = JSON.parse(api(`repos/${repo}/releases?per_page=100`, "--paginate", "--slurp")).flat();
for (const release of releases) {
  if (release.tag_name !== tag && !release.draft) {
    api("--method", "PATCH", `repos/${repo}/releases/${release.id}`, "-F", "draft=true");
  }
}
console.log(`Published verified ${tag}.`);
