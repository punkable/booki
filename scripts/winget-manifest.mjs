/* Writes the three winget manifests (version, installer, defaultLocale) for
   the release that prepare-release.mjs just assembled. Run it after that
   script; it reads dist/release-assets and writes dist/winget/<version>/.
   Submitting is manual: copy the folder into a fork of microsoft/winget-pkgs
   under manifests/p/punkable/Booki/<version>/ and open a PR there. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ID = "punkable.Booki";
const SCHEMA = "1.6.0";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
const assets = join("dist", "release-assets");
const out = join("dist", "winget", version);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
}

function installer(name, arch) {
  const file = join(assets, name);
  if (!existsSync(file)) throw new Error(`Missing ${file}; run prepare-release.mjs first.`);
  return [
    `  - Architecture: ${arch}`,
    `    InstallerUrl: https://github.com/punkable/booki/releases/download/${tag}/${name}`,
    `    InstallerSha256: ${sha256(file)}`,
  ].join("\n");
}

const header = (type) => `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.${SCHEMA}.schema.json\n`;

const versionManifest = `${header("version")}
PackageIdentifier: ${ID}
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${SCHEMA}
`;

// NSIS installs per user and accepts /S for a silent install; the updater
// relies on the same switches.
const installerManifest = `${header("installer")}
PackageIdentifier: ${ID}
PackageVersion: ${version}
InstallerType: nullsoft
Scope: user
InstallModes:
  - interactive
  - silent
UpgradeBehavior: install
ReleaseDate: ${new Date().toISOString().slice(0, 10)}
Installers:
${installer(`Booki_${version}_x64-setup.exe`, "x64")}
${installer(`Booki_${version}_arm64-setup.exe`, "arm64")}
ManifestType: installer
ManifestVersion: ${SCHEMA}
`;

const localeManifest = `${header("defaultLocale")}
PackageIdentifier: ${ID}
PackageVersion: ${version}
PackageLocale: en-US
Publisher: Booki contributors
PublisherUrl: https://github.com/punkable
PublisherSupportUrl: https://github.com/punkable/booki/issues
PackageName: Booki
PackageUrl: https://github.com/punkable/booki
License: MIT
LicenseUrl: https://github.com/punkable/booki/blob/main/LICENSE
ShortDescription: A smart dock for Windows.
Description: Booki combines apps, folders and live widgets in a customizable dock for Windows 10 and 11. Your settings stay local and are preserved during updates.
Moniker: booki
Tags:
  - dock
  - launcher
  - taskbar
  - widgets
ReleaseNotesUrl: https://github.com/punkable/booki/releases/tag/${tag}
ManifestType: defaultLocale
ManifestVersion: ${SCHEMA}
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${ID}.yaml`), versionManifest);
writeFileSync(join(out, `${ID}.installer.yaml`), installerManifest);
writeFileSync(join(out, `${ID}.locale.en-US.yaml`), localeManifest);
console.log(`Wrote winget manifests for ${tag} to ${out}.`);
