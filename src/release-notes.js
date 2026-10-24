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

export function previousReleases() { return [release97(), release96(), release951(), release95(), release94(), release93(), release92(), release91(), release90(), release89(), release881(), release88(), release871(), release87(), release86(), release85(), release84(), release83(), release82(), release81(), overhaul80Release(), workspaceRelease(), libraryRelease(), surfaceRelease(), stabilityRelease(), overhaulRelease()]; }
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

function release90() {
  return { version: "0.90.0", date: "2026-10-19", headline: t("release90.headline"), sections: [
    { icon: "sparkles", title: t("release86.windowsTitle"), notes: [t("release90.material"), t("release90.controls")] },
  ] };
}

function release91() {
  return { version: "0.91.0", date: "2026-10-19", headline: t("release91.headline"), sections: [
    { icon: "sparkles", title: t("release86.widgetsTitle"), notes: [t("release91.ai"), t("release91.ui")] },
  ] };
}

function release92() {
  return { version: "0.92.0", date: "2026-10-19", headline: t("release92.headline"), sections: [
    { icon: "sparkles", title: t("release86.widgetsTitle"), notes: [t("release92.agents"), t("release92.focus"), t("release92.backup"), t("release92.fixes")] },
  ] };
}

function release93() {
  return { version: "0.93.0", date: "2026-10-21", headline: t("release93.headline"), sections: [
    { icon: "sparkles", title: t("release93.agentsTitle"), notes: [t("release93.agents"), t("release93.usage")] },
    { icon: "settings", title: t("release93.toolsTitle"), notes: [t("release93.collector"), t("release93.dock")] },
    { icon: "search", title: t("release93.updatesTitle"), notes: [t("release93.updates"), t("release93.docs")] },
  ] };
}

function release94() {
  return { version: "0.94.0", date: "2026-10-21", headline: t("release94.headline"), sections: [
    { icon: "folder", title: t("release94.groupsTitle"), notes: [t("release94.groups"), t("release94.appearance")] },
    { icon: "sparkles", title: t("release94.widgetsTitle"), notes: [t("release94.devices"), t("release94.ai"), t("release94.media")] },
    { icon: "download", title: t("release94.finishTitle"), notes: [t("release94.collector"), t("release94.updates"), t("release94.docs")] },
  ] };
}

function release95() {
  return { version: "0.95.0", date: "2026-10-21", headline: t("release95.headline"), sections: [
    { icon: "folder", title: t("release95.groupsTitle"), notes: [t("release95.groups"), t("release95.drag"), t("release95.menus")] },
    { icon: "sparkles", title: t("release95.lookTitle"), notes: [t("release95.look"), t("release95.notch")] },
    { icon: "grid", title: t("release95.widgetsTitle"), notes: [t("release95.widgets")] },
    { icon: "download", title: t("release95.collectorTitle"), notes: [t("release95.collector"), t("release95.updates")] },
  ] };
}

function release951() {
  return { version: "0.95.1", date: "2026-10-23", headline: t("release951.headline"), sections: [
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release951.settings"), t("release951.widgets")] },
    { icon: "sparkles", title: t("release95.lookTitle"), notes: [t("release951.contrast"), t("release951.capture"), t("release951.notch")] },
    { icon: "download", title: t("release95.collectorTitle"), notes: [t("release951.notices"), t("release951.durability")] },
  ] };
}

function release96() {
  return { version: "0.96.0", date: "2026-10-23", headline: t("release96.headline"), sections: [
    { icon: "grid", title: t("release95.widgetsTitle"), notes: [t("release96.settings"), t("release96.open"), t("release96.notes"), t("release96.preferences"), t("release96.panels"), t("release96.ai")] },
    { icon: "palette", title: t("release96.lookTitle"), notes: [t("release96.glass"), t("release96.motion"), t("release96.colors")] },
    { icon: "download", title: t("plugins.title"), notes: [t("release96.updates"), t("release96.plugins"), t("release96.notices")] },
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release96.launcher"), t("release96.position"), t("release96.addMenu"), t("release96.windows")] },
  ] };
}

function release97() {
  return { version: "0.97.0", date: "2026-10-24", headline: t("release97.headline"), sections: [
    { icon: "sparkles", title: t("release97.agentsTitle"), notes: [t("release97.claudeUsage"), t("release97.hooks"), t("release97.notchCard")] },
    { icon: "palette", title: t("release97.lookTitle"), notes: [t("release97.glass"), t("release97.controls")] },
    { icon: "grid", title: t("release97.everydayTitle"), notes: [t("release97.clipboard"), t("release97.folders"), t("release97.devices")] },
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release97.efficiency")] },
  ] };
}

export function currentRelease() {
  return { version: "0.97.1", date: "2026-10-24", headline: t("release971.headline"), sections: [
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release971.clicks"), t("release971.claude")] },
  ] };
}
