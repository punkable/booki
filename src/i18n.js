/* Minimal i18n. t(key) returns the active-language string.
   Every language lives in src/locales/<lang>.js. es/en ship in the bundle;
   pt/fr/de are loaded on demand. DICT is exported so tooling
   (scripts/check-i18n.mjs) can verify the languages stay in step. */

import es from "./locales/es.js";
import en from "./locales/en.js";

export const LANGS = ["es", "en", "pt", "fr", "de"];
export const DICT = { es, en };
const LAZY = {
  pt: () => import("./locales/pt.js"),
  fr: () => import("./locales/fr.js"),
  de: () => import("./locales/de.js"),
};
let lang = "en";
const SUPPORTED = LANGS;

// Map a full BCP-47 locale (e.g. "pt-BR", "de-DE") to the best supported
// language, falling back to English for anything unsupported.
export function resolveLang(value) {
  if (value && value !== "system" && SUPPORTED.includes(value)) return value;
  const n = (typeof navigator !== "undefined" ? navigator.language : "en") || "en";
  const base = n.toLowerCase().split("-")[0];
  return SUPPORTED.includes(base) ? base : "en";
}

// pt/fr/de are fetched on demand, one language at a time; es/en ship inline.
let languageGeneration = 0;

export async function ensureLang(value) {
  const generation = ++languageGeneration;
  const l = resolveLang(value);
  if (!DICT[l]) {
    try {
      DICT[l] = (await LAZY[l]()).default;
    } catch (_) { /* fall back to English */ }
  }
  if (generation === languageGeneration) setLang(l);
}

export function setLang(value) {
  languageGeneration += 1;
  lang = resolveLang(value);
  // Tell the document what language it is actually in. The three pages ship
  // with a hard-coded lang attribute (two said "es", one said "en") that was
  // never updated, so a screen reader announced every string in the wrong
  // language for four of the five locales — and for Spanish users on the notch.
  //
  // ensureLang() routes through here rather than assigning `lang` itself, so
  // there is one place that decides the language and one place that records
  // it. Settings only ever calls ensureLang on mount, which is exactly how the
  // attribute stayed wrong there.
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function t(key) {
  return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || DICT.es[key] || key;
}

export function curLang() {
  return lang;
}
