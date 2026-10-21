/* Redacted, local-only publication check. Never print a matched secret. */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const files = [...new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean))];
const forbiddenPath = /(?:^|\/)(?:test-results|node_modules|\.codex|\.claude|\.cursor|\.agents)(?:\/|$)|^src-tauri\/target\/|^docs\/quality\/booki-local-audit-/;
const credentialFile = /(?:^|\/)(?:\.env(?:\.[^/]+)?|auth\.json|credentials?\.(?:json|toml)|id_(?:rsa|ed25519)|[^/]+\.key)$/i;
const patterns = {
  "private key": /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  "access token": /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
  "API credential": /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{40,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16})\b/,
};
const normalized = (text) => text.replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
const localHomes = [process.env.USERPROFILE, process.env.HOME].filter((home) => home && home.length > 8).map(normalized);
const findings = [];
for (const file of files) {
  if (forbiddenPath.test(file) || (credentialFile.test(file) && !file.endsWith(".env.example"))) findings.push(`${file}: excluded local or credential file`);
  if (!/\.(?:js|jsx|mjs|json|md|html|css|rs|toml|yml|yaml|nsh|ps1|py|txt|svg)$/.test(file) || statSync(file).size > 2_000_000) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (localHomes.some((home) => normalized(line).includes(home))) findings.push(`${file}:${index + 1}: personal home path (content redacted)`);
    for (const [name, pattern] of Object.entries(patterns)) if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${name} (content redacted)`);
  }
}
if (findings.length) { console.error(findings.join("\n")); process.exitCode = 1; }
else console.log(`Publication privacy check passed for ${files.length} source files; local data and credentials excluded.`);
