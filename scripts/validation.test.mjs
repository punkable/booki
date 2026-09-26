import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "prepare-release.mjs");
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "booki-release-validation-"));
  const version = "1.2.3";
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  for (const [target, arch] of [["x86_64-pc-windows-msvc", "x64"], ["aarch64-pc-windows-msvc", "arm64"]]) {
    const nsis = join(dir, "src-tauri", "target", target, "release", "bundle", "nsis");
    mkdirSync(nsis, { recursive: true });
    writeFileSync(join(nsis, `Booki_${version}_${arch}-setup.exe`), arch);
    writeFileSync(join(nsis, `Booki_${version}_${arch}-setup.exe.sig`), `signature-${arch}`);
  }
  const msi = join(dir, "src-tauri", "target", "x86_64-pc-windows-msvc", "release", "bundle", "msi");
  mkdirSync(msi, { recursive: true });
  writeFileSync(join(msi, `Booki_${version}_x64_en-US.msi`), "msi");
  return { dir, version };
}
function cleanup(dir) {
  if (!dir.startsWith(join(tmpdir(), "booki-release-validation-"))) throw new Error("Unsafe fixture path.");
  rmSync(dir, { recursive: true, force: true });
}
test("release manifest contains signed updates for both Windows architectures", () => {
  const { dir } = fixture();
  try {
    execFileSync(process.execPath, [script], { cwd: dir });
    const manifest = JSON.parse(readFileSync(join(dir, "dist", "release-assets", "latest.json"), "utf8"));
    assert.equal(manifest.version, "1.2.3");
    assert.equal(manifest.platforms["windows-x86_64"].signature, "signature-x64");
    assert.equal(manifest.platforms["windows-aarch64"].signature, "signature-arm64");
    assert.match(manifest.platforms["windows-aarch64"].url, /releases\/download\/v1\.2\.3\//);
  } finally { cleanup(dir); }
});
test("missing updater signature blocks release preparation", () => {
  const { dir, version } = fixture();
  try {
    rmSync(join(dir, "src-tauri", "target", "aarch64-pc-windows-msvc", "release", "bundle", "nsis", `Booki_${version}_arm64-setup.exe.sig`));
    assert.throws(() => execFileSync(process.execPath, [script], { cwd: dir, stdio: "pipe" }), /Missing/);
  } finally { cleanup(dir); }
});
