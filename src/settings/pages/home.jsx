/* Home: the dock as it is now, and the three things people come to do. */
import React from "react";
import { t } from "../../i18n.js";
import { countContent } from "../../dock/layout-model.js";
import { DockPreview } from "../dock-preview.jsx";
import { Icon, PageHeader } from "../ui.jsx";

const ACTIONS = [
  ["apps", "plus", "premium.addApps", "home.appsHint"],
  ["widgets", "grid", "overhaul.addWidget", "home.widgetsHint"],
  ["dock", "palette", "overhaul.personalize", "home.dockHint"],
];

export function HomePage({ cfg, navigate, onSelect }) {
  const counts = countContent(cfg.pinned);
  return <>
    <PageHeader title={t("overhaul.home")}>{t("overhaul.welcome")}</PageHeader>
    <section className="card hero" aria-label={t("overhaul.preview")}>
      <DockPreview cfg={cfg} large onSelect={onSelect} />
      <dl className="hero-stats">
        <div><dt>{t("overhaul.apps")}</dt><dd>{counts.apps}</dd></div>
        <div><dt>{t("tab.widgets")}</dt><dd>{counts.widgets}</dd></div>
        <div><dt>{t("overhaul.groups")}</dt><dd>{counts.groups}</dd></div>
      </dl>
    </section>
    <div className="link-cards">
      {ACTIONS.map(([tab, glyph, title, hint]) => <button key={tab} type="button" className="card link-card" onClick={() => navigate(tab)}>
        <Icon name={glyph} className="link-card-icon" />
        <span className="link-card-text"><span className="link-card-title">{t(title)}</span><span className="link-card-hint">{t(hint)}</span></span>
        <Icon name="chevron-right" />
      </button>)}
    </div>
  </>;
}
