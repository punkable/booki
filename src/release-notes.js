/* Current update is localized; historical notes retain their original text. */
import { t } from "./i18n.js";
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

export function previousReleases() { return [overhaul80Release(), workspaceRelease(), libraryRelease(), surfaceRelease(), stabilityRelease(), overhaulRelease()]; }
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

export function currentRelease() {
  return { version: "0.81.0", date: "2026-10-10", headline: t("release81.headline"), sections: [
    { icon: "settings", title: t("release80.settingsTitle"), notes: [t("release81.settings"), t("release81.apps")] },
    { icon: "sparkles", title: t("overhaul.groups"), notes: [t("release81.groups")] },
    { icon: "performance", title: t("be.notchMode"), notes: [t("release81.notch")] },
  ] };
}
