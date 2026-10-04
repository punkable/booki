/* Read-only release audit. Downloads only to the explicitly supplied directory. */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, createPublicKey, verify } from 'node:crypto';
const repo = 'punkable/booki';
const release = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/releases/latest`], { encoding: 'utf8' }));
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/audit-release.mjs <download-directory>');
const out = resolve(directory); mkdirSync(out, { recursive: true });
if (release.draft || release.prerelease) throw new Error('Latest release is not a public stable release.');
const version = release.tag_name.replace(/^v/, '');
const expected = ['latest.json', `Booki_${version}_x64-setup.exe`, `Booki_${version}_x64-setup.exe.sig`, `Booki_${version}_arm64-setup.exe`, `Booki_${version}_arm64-setup.exe.sig`, `Booki_${version}_x64_en-US.msi`];
for (const name of expected) if (!release.assets.some((asset) => asset.name === name)) throw new Error(`Missing ${name}`);
execFileSync('gh', ['release', 'download', release.tag_name, '--repo', repo, '--dir', out, '--clobber'], { stdio: 'inherit' });
for (const name of expected) {
  const asset = release.assets.find((item) => item.name === name);
  const bytes = readFileSync(join(out, name));
  if (bytes.length !== asset.size) throw new Error(`Size mismatch: ${name}`);
  if (asset.digest && asset.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`) throw new Error(`Digest mismatch: ${name}`);
}
const manifest = JSON.parse(readFileSync(join(out, 'latest.json'), 'utf8'));
if (manifest.version !== version || !Number.isFinite(Date.parse(manifest.pub_date))) throw new Error('Invalid updater manifest version/date');
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const publicLines = Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8').trim().split(/\r?\n/);
const publicBytes = Buffer.from(publicLines[1], 'base64');
const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicBytes.subarray(10)]), format: 'der', type: 'spki' });
for (const [platform, arch] of [['windows-x86_64', 'x64'], ['windows-aarch64', 'arm64']]) {
  const name = `Booki_${version}_${arch}-setup.exe`;
  const entry = manifest.platforms?.[platform];
  if (entry?.url !== `https://github.com/${repo}/releases/download/${release.tag_name}/${name}`) throw new Error(`Wrong updater URL for ${platform}`);
  const encoded = readFileSync(join(out, `${name}.sig`), 'utf8').trim();
  if (entry.signature !== encoded) throw new Error(`Manifest signature differs: ${platform}`);
  const lines = Buffer.from(encoded, 'base64').toString('utf8').trim().split(/\r?\n/);
  const signature = Buffer.from(lines[1], 'base64');
  const bytes = readFileSync(join(out, name));
  const algorithm = signature.subarray(0, 2).toString();
  if (!['Ed', 'ED'].includes(algorithm) || !signature.subarray(2, 10).equals(publicBytes.subarray(2, 10))) throw new Error('Unsupported signature/key ID');
  const payload = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  if (!verify(null, payload, key, signature.subarray(10))) throw new Error(`Installer signature invalid: ${platform}`);
  const comment = lines[2]?.replace(/^trusted comment: /, '');
  if (!comment || !verify(null, Buffer.concat([signature.subarray(10), Buffer.from(comment)]), key, Buffer.from(lines[3], 'base64'))) throw new Error('Signature comment invalid');
  // NSIS uses an x86 bootstrap executable even for x64/ARM64 payloads.
  // Its PE header cannot prove the architecture of the embedded application.
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.subarray(0, 2).toString() !== 'MZ' || bytes.subarray(pe, pe + 4).toString() !== 'PE\0\0' || ![0x14c, 0x8664, 0xaa64].includes(bytes.readUInt16LE(pe + 4))) throw new Error(`Invalid NSIS executable: ${platform}`);
  console.log(`${platform}: digest, updater signature and NSIS executable OK`);
}
const msi = readFileSync(join(out, `Booki_${version}_x64_en-US.msi`));
if (!msi.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) throw new Error('Invalid MSI container');
console.log(`${release.tag_name}: all six release assets and updater manifest verified. This does not execute Windows installers or verify Authenticode.`);
