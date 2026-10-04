/* Current update is localized; historical notes retain their original text. */
import { t } from "./i18n.js";
export function currentRelease() {
  return { version: "0.70.0", date: "2026-10-03", headline: t("release.headline"), sections: [
    { icon: "sparkles", title: t("release.design"), notes: [t("release.dashboard"), t("release.widgets")] },
    { icon: "performance", title: t("release.workflow"), notes: [t("release.apps"), t("release.utilities")] },
    { icon: "undo", title: t("release.fixes"), notes: [t("release.shortcuts"), t("release.behavior"), t("release.persistence")] },
    { icon: "search", title: t("release.system"), notes: [t("release.updates"), t("release.diagnostics")] },
  ] };
}
