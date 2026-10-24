/* Real frontend captures with offline example icons and editorial composition.
 * --preview labels unpublished branch UI and blocks release verification. */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertBuilt } from "../tests/harness.mjs";
import { root, version, hash, sourceFingerprint } from "./release-docs.mjs";

if (process.env.BOOKI_EDITION === "dev" || process.env.VITE_BOOKI_EDITION === "dev") throw new Error("Public screenshots require the official frontend build, not Booki Dev.");
assertBuilt();
if (readFileSync(join(root, "dist/settings.html"), "utf8").includes("Booki Dev")) throw new Error("Rebuild the official frontend before capturing public screenshots.");
const preview = process.argv.includes("--preview");
execFileSync(process.execPath, [join(root, "tools/presentation/stills.mjs")], {
  cwd: root, stdio: "inherit",
  env: { ...process.env, BOOKI_STILLS_LANGUAGE: "en", BOOKI_STILLS_PREVIEW: preview ? "1" : "0" },
});
const files = Object.fromEntries(["en"].flatMap((language) =>
  ["hero", "island", "groups", "widgets", "settings", "dark"].map((name) => {
    const path = `docs/presentation/${name}-${language}.jpg`;
    return [path, hash(path)];
  })));
writeFileSync(join(root, "docs/presentation/release-captures.json"), `${JSON.stringify({
  version, edition: preview ? "preview" : "official", source: sourceFingerprint(),
  kind: "composed browser frontend with offline placeholder app icons and example data; native blur not verified", files,
}, null, 2)}\n`);
console.log(`Captured ${Object.keys(files).length} composed README images for ${version}${preview ? " (unpublished preview)" : ""}.`);
