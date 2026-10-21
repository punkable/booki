/* Keep the public release entry points synchronized; no publishing or network. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentRelease, previousReleases } from "../src/release-notes.js";
import { setLang } from "../src/i18n.js";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
export const hash = (path) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
export function sourceFingerprint() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir)).sort()) {
      const path = `${dir}/${name}`;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk("src"); walk("assets");
  files.push("package.json", "package-lock.json", "vite.config.js", "scripts/capture-release.mjs", "tools/presentation/stills.mjs", "tools/presentation/fixtures.mjs", "tools/presentation/fonts/Inter.ttf");
  const text = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".json", ".svg", ".mjs", ".txt"]);
  const digest = (path) => text.has(extname(path))
    ? createHash("sha256").update(readFileSync(join(root, path), "utf8").replaceAll("\r\n", "\n")).digest("hex")
    : hash(path);
  return createHash("sha256").update(files.map((path) => `${path}:${digest(path)}`).join("\n")).digest("hex");
}
const regions = (language, { preview = false } = {}) => {
  const es = language === "es";
  setLang(language);
  const release = currentRelease();
  if (release.version !== version) throw new Error("The in-app changelog version differs from package.json; update src/release-notes.js first.");
  const base = `https://github.com/punkable/booki/releases/download/v${version}/Booki_${version}`;
  const history = previousReleases().slice(0, 3).map((entry) => `| [${entry.version}](docs/releases/v${entry.version}.md) | ${entry.headline} |`).join("\n");
  return {
    history: `## ${es ? "Actualizaciones recientes" : "Recent updates"}\n\n| ${es ? "Versión" : "Version"} | ${es ? "Qué cambió" : "What changed"} |\n|---|---|\n${history}\n\n[${es ? "Todas las versiones publicadas" : "All published releases"}](https://github.com/punkable/booki/releases)`,
    news: `## ${es ? "Novedades de" : "What's new in"} ${version}\n\n${release.headline}\n\n${release.sections.flatMap((section) => section.notes.map((note) => `- ${note}`)).join("\n")}\n\n[${es ? "Notas completas" : "Full release notes"}](docs/releases/v${version}.md)`,
    download: `<p align="center">\n  <a href="${base}_x64-setup.exe"><b>${es ? "Descargar para Windows" : "Download for Windows"} v${version} (x64)</b></a> ·\n  <a href="${base}_arm64-setup.exe">ARM64</a> ·\n  <a href="${base}_x64_en-US.msi">MSI x64</a> ·\n  <a href="docs/releases/v${version}.md">${es ? "Novedades" : "What's new"} v${version}</a> ·\n  <a href="${es ? "README.md" : "README.es.md"}">${es ? "English" : "Español"}</a>\n</p>`,
    media: preview
      ? `<p align="center"><sub>${es ? `Vista previa de esta rama, basada en v${version}, con iconos y datos de ejemplo. Incluye cambios aún no publicados; las descargas corresponden a la versión estable. El vidrio nativo requiere comprobación en Windows.` : `Branch preview based on v${version}, with example icons and data. Includes unpublished changes; downloads point to the stable release. Native glass still requires a Windows check.`}</sub></p>`
      : `<p align="center"><sub>${es ? `Capturas del frontend del código fuente v${version}, con datos de ejemplo. El desenfoque nativo de Windows requiere comprobación en la app.` : `Source frontend captures for v${version}, with example data. Native Windows blur requires an in-app check.`}</sub></p>`,
  };
};
function region(name, body) { return `<!-- booki:${name}:start -->\n${body}\n<!-- booki:${name}:end -->`; }
const captions = {
  en: { hero: "Booki dock with example apps, a group, clock, system readings, focus timer and Collector", island: "Claude Code, Cursor and Codex with working, waiting and finished states in the compact Booki notch", groups: "Booki Apps and folders page with example pins and the app catalog", widgets: "Current Booki widget gallery", settings: "Current Booki Settings home with example dock", dark: "Current Booki Dock settings in dark mode" },
  es: { hero: "Dock de Booki con apps de ejemplo, grupo, reloj, sistema, temporizador y Recolector", island: "Claude Code, Cursor y Codex con estados de trabajo, espera y finalización en el notch compacto de Booki", groups: "Apps y carpetas de Booki con elementos de ejemplo y catálogo de aplicaciones", widgets: "Galería actual de widgets de Booki", settings: "Inicio actual de Ajustes de Booki con dock de ejemplo", dark: "Ajustes actuales del Dock de Booki en modo oscuro" },
};
export function syncReadmes(options = {}) {
  for (const language of ["en", "es"]) {
    const path = join(root, language === "es" ? "README.es.md" : "README.md");
    let text = readFileSync(path, "utf8");
    for (const [name, body] of Object.entries(regions(language, options))) {
      const pattern = new RegExp(`<!-- booki:${name}:start -->[\\s\\S]*?<!-- booki:${name}:end -->`);
      if (!pattern.test(text)) throw new Error(`Missing managed ${name} region in ${path}`);
      text = text.replace(pattern, () => region(name, body));
    }
    for (const [name, caption] of Object.entries(captions[language])) {
      const pattern = new RegExp(`(<img src="docs/presentation/${name}-${language}\\.jpg"[^>]*alt=")[^"]*"`);
      text = text.replace(pattern, (_, prefix) => `${prefix}${caption}"`);
    }
    writeFileSync(path, text);
  }
}
export function checkReleaseDocs() {
  const notes = `docs/releases/v${version}.md`;
  if (!existsSync(join(root, notes)) || !readFileSync(join(root, notes), "utf8").startsWith(`# Booki ${version}`)) throw new Error(`Missing versioned release notes: ${notes}`);
  for (const language of ["en", "es"]) {
    const path = language === "es" ? "README.es.md" : "README.md";
    const text = readFileSync(join(root, path), "utf8");
    for (const [name, body] of Object.entries(regions(language))) {
      if (!text.includes(region(name, body))) throw new Error(`Stale ${name} in ${path}; run npm run release:prepare`);
    }
    for (const name of ["hero", "island", "groups", "widgets", "settings", "dark"]) {
      if (!text.includes(`docs/presentation/${name}-${language}.jpg`)) throw new Error(`Missing ${name} screenshot in ${path}`);
      if (!text.includes(`alt="${captions[language][name]}"`)) throw new Error(`Stale screenshot caption: ${name}/${language}`);
    }
  }
  const manifest = JSON.parse(readFileSync(join(root, "docs/presentation/release-captures.json"), "utf8"));
  validateCaptures(manifest, { version, source: sourceFingerprint(), hash });
  console.log(`Release documentation, download buttons and 12 screenshots match ${version}.`);
}
export function validateCaptures(manifest, expected) {
  if (manifest.version !== expected.version || manifest.source !== expected.source || manifest.edition !== "official") throw new Error("Screenshots do not match this version/source/edition; run npm run release:prepare");
  for (const language of ["en", "es"]) for (const name of ["hero", "island", "groups", "widgets", "settings", "dark"]) {
    const path = `docs/presentation/${name}-${language}.jpg`;
    if (!manifest.files?.[path] || manifest.files[path] !== expected.hash(path)) throw new Error(`Unverified screenshot: ${path}`);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes("--sync")) syncReadmes({ preview: process.argv.includes("--preview") });
  else checkReleaseDocs();
}
