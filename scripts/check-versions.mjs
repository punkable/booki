import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const configVersion = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")).version;
const cargo = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoLock = readFileSync(join(root, "src-tauri", "Cargo.lock"), "utf8");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\s+name = "booki-dock"\s+version = "([^"]+)"/m)?.[1];
const versions = [packageVersion, lock.version, lock.packages?.[""]?.version, configVersion, cargoVersion, cargoLockVersion];
if (versions.some((value) => value !== packageVersion)) {
  console.error(`Version mismatch: ${JSON.stringify(versions)}`);
  process.exit(1);
}
const tag = process.argv[2];
if (tag && (tag !== `v${packageVersion}` || !/^v\d+\.\d+\.\d+$/.test(tag))) {
  console.error(`Release tag ${tag} does not match v${packageVersion}.`);
  process.exit(1);
}
console.log(`Versions match: ${packageVersion}`);
