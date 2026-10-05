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

export function previousReleases() { return [stabilityRelease(), overhaulRelease()]; }
export function currentRelease() {
  return { version: "0.70.2", date: "2026-10-05", headline: t("surfaces.headline"), sections: [
    { icon: "sparkles", title: t("surfaces.design"), notes: [t("surfaces.unified"), t("surfaces.opacity"), t("surfaces.motion")] },
    { icon: "undo", title: t("surfaces.function"), notes: [t("surfaces.close"), t("surfaces.group"), t("surfaces.library")] },
  ] };
}
