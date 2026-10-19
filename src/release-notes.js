/* Current update is localized; historical notes retain their original text. */
import { t, curLang } from "./i18n.js";

// Release dates are written as "2026-10-05" or, in older notes, "2 jul 2026".
const MONTHS = { jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11, dic: 11 };
function parseReleaseDate(text) {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || "");
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2}) ([a-z]+)\.? (\d{4})$/i.exec(text || "");
  const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return month === undefined ? null : new Date(Date.UTC(+m[3], month, +m[1]));
}
/** A release date in the reader's language; text that does not parse is shown as written. */
export function formatReleaseDate(text, lang = curLang()) {
  const date = parseReleaseDate(text);
  if (!date) return text;
  try { return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
  catch (_) { return text; }
}
function overhaulRelease() {
  return { version: "0.70.0", date: "2026-10-05", headline: t("release.headline"), sections: [
    { icon: "sparkles", title: t("release.design"), notes: [t("release.dashboard"), t("release.widgets"), t("release.premium")] },
    { icon: "performance", title: t("release.workflow"), notes: [t("release.apps"), t("release.utilities"), t("release.discovery"), t("release.productivity")] },
    { icon: "undo", title: t("release.fixes"), notes: [t("release.shortcuts"), t("release.behavior"), t("release.persistence")] },
    { icon: "search", title: t("release.system"), notes: [t("release.updates"), t("release.diagnostics"), t("release.safeUpdates")] },
  ] };
}

function stabilityRelease() {
  return { version: "0.70.1", date: "2026-10-05", headline: t("hotfix.headline"), sections: [
    { icon: "undo", title: t("hotfix.title"), notes: [t("hotfix.settings"), t("hotfix.surfaces"), t("hotfix.icons"), t("hotfix.backup")] },
  ] };
}

export function previousReleases() { return [release89(), release881(), release88(), release871(), release87(), release86(), release85(), release84(), release83(), release82(), release81(), overhaul80Release(), workspaceRelease(), libraryRelease(), surfaceRelease(), stabilityRelease(), overhaulRelease()]; }
function surfaceRelease() {
  return { version: "0.70.2", date: "2026-10-05", headline: t("surfaces.headline"), sections: [
    { icon: "sparkles", title: t("surfaces.design"), notes: [t("surfaces.unified"), t("surfaces.opacity"), t("surfaces.motion")] },
    { icon: "undo", title: t("surfaces.function"), notes: [t("surfaces.close"), t("surfaces.group"), t("surfaces.library")] },
  ] };
}

function libraryRelease() {
  return { version: "0.71.0", date: "2026-10-06", headline: t("nextRelease.headline"), sections: [
    { icon: "search", title: t("nextRelease.library"), notes: [t("nextRelease.editing"), t("nextRelease.discovery")] },
    { icon: "sparkles", title: t("nextRelease.settings"), notes: [t("nextRelease.widgets"), t("nextRelease.menus")] },
    { icon: "performance", title: t("nextRelease.system"), notes: [t("nextRelease.events"), t("nextRelease.storage")] },
  ] };
}

function workspaceRelease() {
  return { version: "0.72.0", date: "2026-10-09", headline: t("release72.headline"), sections: [
    { icon: "search", title: t("nextRelease.library"), notes: [t("release72.library")] },
    { icon: "settings", title: t("nextRelease.settings"), notes: [t("release72.interface")] },
    { icon: "undo", title: t("nextRelease.system"), notes: [t("release72.recovery")] },
  ] };
}

function overhaul80Release() {
  return { version: "0.80.0", date: "2026-10-09", headline: t("release80.headline"), sections: [
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release80.settings")] },
    { icon: "sparkles", title: t("release80.finishTitle"), notes: [t("release80.finish"), t("release80.notch")] },
    { icon: "performance", title: t("release80.widgetsTitle"), notes: [t("release80.widgets")] },
  ] };
}

function release81() {
  return { version: "0.81.0", date: "2026-10-10", headline: t("release81.headline"), sections: [
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release81.settings"), t("release81.apps")] },
    { icon: "sparkles", title: t("overhaul.groups"), notes: [t("release81.groups")] },
    { icon: "performance", title: t("release82.notchTitle"), notes: [t("release81.notch")] },
  ] };
}

function release82() {
  return { version: "0.82.0", date: "2026-10-10", headline: t("release82.headline"), sections: [
    { icon: "performance", title: t("release82.dockTitle"), notes: [t("release82.apps"), t("release82.groups")] },
    { icon: "sparkles", title: t("release82.notchTitle"), notes: [t("release82.notch")] },
    { icon: "settings", title: t("release80.widgetsTitle"), notes: [t("release82.panels"), t("release82.profiles")] },
  ] };
}

function release83() {
  return { version: "0.83.0", date: "2026-10-11", headline: t("release83.headline"), sections: [
    { icon: "sparkles", title: t("release83.colorsTitle"), notes: [t("release83.colors"), t("release83.palette")] },
    { icon: "settings", title: t("overhaul.groups"), notes: [t("release83.groups")] },
  ] };
}

function release84() {
  return { version: "0.84.0", date: "2026-10-11", headline: t("release84.headline"), sections: [
    { icon: "performance", title: t("release84.windowsTitle"), notes: [t("release84.windows"), t("release84.native")] },
    { icon: "sparkles", title: t("release83.colorsTitle"), notes: [t("release84.groups")] },
    { icon: "settings", title: t("release84.fixesTitle"), notes: [t("release84.fixes")] },
  ] };
}

function release85() {
  return { version: "0.85.0", date: "2026-10-11", headline: t("release85.headline"), sections: [
    { icon: "sparkles", title: t("release85.stylesTitle"), notes: [t("release85.styles"), t("release85.colors")] },
    { icon: "performance", title: t("release85.glassTitle"), notes: [t("release85.glass")] },
    { icon: "settings", title: t("release84.fixesTitle"), notes: [t("release85.menu"), t("release85.fixes")] },
  ] };
}

function release86() {
  return { version: "0.86.0", date: "2026-10-17", headline: t("release86.headline"), sections: [
    { icon: "sparkles", title: t("release86.windowsTitle"), notes: [t("release86.fluent"), t("release86.notch")] },
    { icon: "performance", title: t("release86.widgetsTitle"), notes: [t("release86.devices"), t("release86.ai"), t("release86.plugins")] },
    { icon: "settings", title: t("release86.easierTitle"), notes: [t("release86.start"), t("release86.settings"), t("release86.fixes")] },
  ] };
}

function release87() {
  return { version: "0.87.0", date: "2026-10-17", headline: t("release87.headline"), sections: [
    { icon: "settings", title: t("release86.widgetsTitle"), notes: [t("release87.plugins"), t("release87.panels"), t("release87.sensor")] },
    { icon: "sparkles", title: t("release86.windowsTitle"), notes: [t("release87.theme"), t("release87.motion")] },
  ] };
}

function release871() {
  return { version: "0.87.1", date: "2026-10-17", headline: t("release871.headline"), sections: [
    { icon: "settings", title: t("plugins.title"), notes: [t("release871.plugins")] },
    { icon: "sparkles", title: t("release86.windowsTitle"), notes: [t("release871.surface"), t("release871.scroll")] },
  ] };
}

function release88() {
  return { version: "0.88.0", date: "2026-10-18", headline: t("release88.headline"), sections: [
    { icon: "sparkles", title: t("release86.widgetsTitle"), notes: [t("release88.collector"), t("release88.widgets"), t("release88.devices"), t("release88.ai"), t("release88.notices")] },
    { icon: "settings", title: t("release86.easierTitle"), notes: [t("release88.position"), t("release88.folders")] },
    { icon: "performance", title: t("plugins.title"), notes: [t("release88.trust"), t("release88.fixes")] },
  ] };
}

function release881() {
  return { version: "0.88.1", date: "2026-10-18", headline: t("release881.headline"), sections: [
    { icon: "sparkles", title: t("release86.windowsTitle"), notes: [t("release881.motion"), t("release881.panels")] },
    { icon: "performance", title: t("plugins.title"), notes: [t("release881.plugins"), t("release881.fixes")] },
  ] };
}

function release89() {
  return { version: "0.89.0", date: "2026-10-18", headline: t("release89.headline"), sections: [
    { icon: "sparkles", title: t("release86.widgetsTitle"), notes: [t("release89.collector"), t("release89.devices"), t("release89.ai")] },
    { icon: "performance", title: t("plugins.title"), notes: [t("release89.plugins")] },
  ] };
}

export function currentRelease() {
  return { version: "0.90.0", date: "2026-10-19", headline: t("release90.headline"), sections: [
    { icon: "sparkles", title: t("release86.windowsTitle"), notes: [t("release90.material"), t("release90.controls")] },
  ] };
}
