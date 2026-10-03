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

// Tauri's bundler rejects different major/minor releases across its bridges.
for (const [crate, npmPackage] of [["tauri", "@tauri-apps/api"], ["tauri-plugin-dialog", "@tauri-apps/plugin-dialog"], ["tauri-plugin-process", "@tauri-apps/plugin-process"], ["tauri-plugin-updater", "@tauri-apps/plugin-updater"]]) {
  const native = cargoLock.match(new RegExp(`name = "${crate}"\\s+version = "([^" ]+)"`))?.[1];
  const frontend = lock.packages?.[`node_modules/${npmPackage}`]?.version;
  if (!native || !frontend || native.split(".").slice(0, 2).join(".") !== frontend.split(".").slice(0, 2).join(".")) {
    console.error(`Tauri bridge mismatch: ${crate} ${native}, ${npmPackage} ${frontend}`);
    process.exit(1);
  }
}
