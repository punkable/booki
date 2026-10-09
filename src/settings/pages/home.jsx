/* Home: your dock on a little desktop, what it is set to at a glance, and
   what changed in this version. Every tile leads to where it is changed. */
import React from "react";
import { t } from "../../i18n.js";
import { countContent, LAYOUT_SCENARIOS } from "../../dock/layout-model.js";
import { activeFinish } from "../../surface.js";
import { resolveNotchMode } from "../../notch-mode.js";
import { currentRelease } from "../../release-notes.js";
import { DockPreview } from "../dock-preview.jsx";
import { Icon, PageHeader } from "../ui.jsx";

const NOTCH_LABELS = { attached: "be.notchModeAttached", floating: "be.notchModeFloating", smart: "be.notchModeSmart" };

function QuickTile({ glyph, hue, label, value, onClick }) {
  return <button type="button" className="quick-tile" style={{ "--hue": hue }} onClick={onClick}>
    <Icon name={glyph} className="quick-icon" />
    <span className="quick-text"><span className="quick-label">{label}</span><span className="quick-value">{value}</span></span>
    <Icon name="chevron-right" className="quick-chev" />
  </button>;
}

export function HomePage({ cfg, navigate, onSelect, onWhatsNew }) {
  const counts = countContent(cfg.pinned);
  const scenario = LAYOUT_SCENARIOS.find((s) => s.id === (cfg.autoHideMode || "smart"));
  const release = currentRelease();
  const toDock = () => navigate("dock");
  return <>
    <PageHeader title={t("overhaul.home")}>{t("overhaul.welcome")}</PageHeader>

    <section className="card home-hero" aria-label={t("overhaul.preview")}>
      <DockPreview cfg={cfg} large stage onSelect={onSelect} />
      <div className="home-hero-bar">
        <div className="home-stats">
          <span><strong>{counts.apps}</strong> {t("overhaul.apps")}</span>
          <span><strong>{counts.widgets}</strong> {t("tab.widgets")}</span>
          <span><strong>{counts.groups}</strong> {t("overhaul.groups")}</span>
        </div>
        <div className="home-actions">
          <button type="button" className="button" onClick={() => navigate("widgets")}><Icon name="zap" />{t("overhaul.addWidget")}</button>
          <button type="button" className="button button-accent" onClick={() => navigate("apps")}><Icon name="plus" />{t("premium.addApps")}</button>
        </div>
      </div>
    </section>

    <h2 className="ui-group-title home-subtitle">{t("home.atGlance")}</h2>
    <div className="quick-grid">
      <QuickTile glyph="eye" hue="#5e7bff" label={t("dock.behavior")} value={t(scenario?.title || "overhaul.smart")} onClick={toDock} />
      <QuickTile glyph="palette" hue="#ff4f7b" label={t("finish.title")} value={t(`finish.${activeFinish(cfg)}`)} onClick={toDock} />
      <QuickTile glyph="sun" hue="#ff9a2e" label={t("ap.theme")} value={t(`theme.${cfg.theme || "system"}`)} onClick={toDock} />
      <QuickTile glyph="app" hue="#30b0c7" label={t("be.position")} value={t(`edge.${cfg.edge || "bottom"}`)} onClick={toDock} />
      <QuickTile glyph="sparkles" hue="#a35bff" label={t("be.notchMode")} value={t(NOTCH_LABELS[resolveNotchMode(cfg)])} onClick={toDock} />
      <QuickTile glyph="grid" hue="#34c759" label={t("ap.iconSize")} value={`${cfg.iconSize ?? 48} px`} onClick={toDock} />
    </div>

    <section className="card whats-new">
      <span className="whats-new-badge">v{release.version}</span>
      <div className="whats-new-text"><strong>{t("cl.title")}</strong><span>{release.headline}</span></div>
      <button type="button" className="button" onClick={onWhatsNew}>{t("ab.whatsNew")}</button>
    </section>
  </>;
}
