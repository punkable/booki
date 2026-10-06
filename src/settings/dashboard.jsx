import React, { useEffect, useState } from "react";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { LAYOUT_SCENARIOS, countContent } from "../dock/layout-model.js";
import { DockPreview } from "./dock-preview.jsx";
import { PageHeader, SettingsSection } from "./ui.jsx";

export function ScenarioPicker({ cfg, set }) {
  return <div className="scenario-grid" role="group" aria-label={t("overhaul.scenarios")}>
    {LAYOUT_SCENARIOS.map((scenario) => <button type="button" key={scenario.id}
      className={"scenario-card" + ((cfg.autoHideMode || "smart") === scenario.id ? " selected" : "")}
      aria-pressed={(cfg.autoHideMode || "smart") === scenario.id} onClick={() => set(scenario.patch)}>
      <span className="scenario-icon" dangerouslySetInnerHTML={{ __html: icon(scenario.icon) }} />
      <strong>{t(scenario.title)}</strong><span>{t(scenario.hint)}</span>
    </button>)}
  </div>;
}
export function Dashboard({ cfg, set, navigate, version, onProfile, listProfiles, onSelect }) {
  const [profiles, setProfiles] = useState([]);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  useEffect(() => { let alive = true; listProfiles().then((names) => { if (alive) setProfiles(names || []); }).catch(() => {}); return () => { alive = false; }; }, []);
  const counts = countContent(cfg.pinned);
  return <>
    <PageHeader title={t("overhaul.home")}>{t("overhaul.welcome")}</PageHeader>
    <section className="dashboard-hero" aria-label={t("overhaul.preview")}>
      <div className="dashboard-hero-head"><div><span className="dashboard-eyebrow">Booki · {version ? `v${version}` : "…"}</span>
        <h2>{cfg.lastProfile || t("overhaul.yourDock")}</h2>
        {profiles.length > 0 && <select disabled={switchingProfile} aria-label={t("tab.profiles")} value={cfg.lastProfile || ""} onChange={async (event) => { setSwitchingProfile(true); try { await onProfile(event.target.value); setProfileError(""); } catch (_) { setProfileError(t("overhaul.failed")); } finally { setSwitchingProfile(false); } }}><option value="" disabled>{t("tab.profiles")}</option>{profiles.map((name) => <option key={name}>{name}</option>)}</select>}
        {profileError && <p role="alert">{profileError}</p>}</div>
        <button className="s-btn s-btn-soft" onClick={() => navigate("appearance")}>{t("overhaul.personalize")}</button></div>
      <DockPreview cfg={cfg} large onSelect={onSelect} />
      <div className="dashboard-summary">
        <button onClick={() => navigate("apps")}><strong>{counts.apps}</strong>{t("overhaul.apps")}</button>
        <button onClick={() => navigate("widgets")}><strong>{counts.widgets}</strong>{t("tab.widgets")}</button>
        <button onClick={() => navigate("apps")}><strong>{counts.groups}</strong>{t("overhaul.groups")}</button>
      </div>
    </section>
    <div className="dashboard-actions">
      {[["apps", "plus", "premium.addApps"], ["widgets", "zap", "overhaul.addWidget"], ["profiles", "copy", "tab.profiles"]].map(([tab, glyph, label]) =>
        <button className="dashboard-action" key={tab} onClick={() => navigate(tab)}><span dangerouslySetInnerHTML={{ __html: icon(glyph) }} /><strong>{t(label)}</strong><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon("chevron-right") }} /></button>)}
    </div>
    <SettingsSection title={t("overhaul.scenarios")} hint={t("overhaul.scenariosHint")}><ScenarioPicker cfg={cfg} set={set} /></SettingsSection>
    <div className="dashboard-tip"><span dangerouslySetInnerHTML={{ __html: icon("info") }} /><p>{t("overhaul.tip")}</p>
      <button className="s-link" onClick={() => navigate("dock")}>{t("overhaul.configure")}</button></div>
  </>;
}
