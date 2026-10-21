/* Optional tools live together, independently from Booki's system settings. */
import { CollectorSettings } from "../collector-settings.jsx";
import { pluginError } from "../../plugin-errors.js";
import React, { useEffect, useState } from "react";
import PLUGINS from "../../plugin-catalog.json";
import { WIDGET_META, widgetDisplayName } from "../../widgets-meta.js";
import { dock as dockApi, pickRgbProfile } from "../../api.js";
import { t } from "../../i18n.js";
import { Icon, PageHeader } from "../ui.jsx";

/** An optional open-source tool Booki can download into its own folder. It
 *  says what it adds, who makes it, its licence and where its source is,
 *  before anything is installed. */
/** The dock widget a plugin brings, if any (yt-dlp → Downloads). */
export const TERMS_URL = "https://github.com/punkable/booki/blob/main/TERMS.md";

const widgetFor = (id) => Object.keys(WIDGET_META).find((w) => WIDGET_META[w].plugin === id);
const pinnedWidget = (pins, widget) => (pins || []).some((p) => p.widget === widget || (p.children || []).some((c) => c.widget === widget));

function PluginCard({ id, name, repo, source, external, license, open, cfg, set, companions }) {
  const [state, setState] = useState({ installed: false, version: null, source: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const termsOk = (cfg?.pluginTerms || 0) >= 1;
  const refresh = () => dockApi.pluginStatus(id)
    .then((status) => setState({ installed: !!status?.installed, version: status?.version || null, source: status?.source || null }))
    .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [id]);
  const run = async (action) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(pluginError(e)); }
    await refresh(); setBusy(false);
  };
  return <article className="card plugin-card" data-setting-label={name}>
    <header className="plugin-head">
      <h3 className="plugin-name">{name}</h3>
      {state.installed && <span className="plugin-badge"><Icon name="check" />{t(state.source === "system" || state.source === "shared" ? "plugins.onPc" : "plugins.active")}</span>}
    </header>
    <span className="plugin-meta">{license} · {t("plugins.by").replace("{repo}", () => repo)}{state.installed && state.version ? ` · ${state.version}` : ""}</span>
    <p className="plugin-desc">{t(`plugins.${id}.desc`)}</p>
    {companions?.length > 0 && <p className="plugin-desc plugin-fine">{t("plugins.includes").replace("{list}", () => companions.map((c) => { const p = PLUGINS.find((x) => x.id === c); return p ? `${p.name} (${p.license})` : c; }).join(", "))}</p>}
    {external && <p className="plugin-desc plugin-fine">{t("plugins.winget.managed")}</p>}
    {state.source === "system" && <p className="plugin-desc plugin-fine">{t("plugins.onPcHint")}</p>}
    {state.source === "shared" && <p className="plugin-desc plugin-fine">{t("plugins.sharedHint")}</p>}
    {id === "librehardwaremonitor" && <p className="plugin-warning" role="note">{t("plugins.sensorWarning")}</p>}
    <p className="plugin-feeds"><Icon name="sparkles" />{t(`plugins.${id}.feeds`)}</p>
    {error && <p className="plugin-desc plugin-action-error" role="alert">{error}</p>}
    {id === "yt-dlp" && <details className="collector-settings"><summary>{t("refine.collectorSettings")}</summary><CollectorSettings cfg={cfg} set={set} /></details>}
    <div className="plugin-actions">
      {state.installed && ["openrgb", "librehardwaremonitor"].includes(id) && <button type="button" className="button" disabled={busy} onClick={() => run(() => dockApi.pluginOpen(id))}>{t(id === "librehardwaremonitor" ? "plugins.openAdmin" : "system.open")}</button>}
      {state.installed && id === "openrgb" && <button type="button" className="button" disabled={busy} onClick={() => run(async () => { const path = await pickRgbProfile(); if (path) await dockApi.pluginOpen(id, path); })}>{t("plugins.profile")}</button>}
      {external ? <button type="button" className="button" onClick={() => open("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1")}>{t("plugins.appInstaller")}</button> : state.source === "system" || state.source === "shared" ? null : state.installed
        ? <button type="button" className="button" disabled={busy} onClick={() => run(() => dockApi.pluginUninstall(id))}>{t("plugins.remove")}</button>
        : <button type="button" className="button button-accent" disabled={busy || !termsOk} title={termsOk ? undefined : t("plugins.acceptTerms")}
            onClick={() => run(() => dockApi.pluginInstall(id))}>{busy ? t("plugins.installing") : t("plugins.install")}</button>}
      {state.installed && widgetFor(id) && cfg && !pinnedWidget(cfg.pinned, widgetFor(id)) && <button type="button" className="button button-accent"
        onClick={() => set({ pinned: [...(cfg.pinned || []), { id: crypto.randomUUID(), kind: "widget", widget: widgetFor(id), name: widgetDisplayName(widgetFor(id), t), path: "", args: [], style: {} }] })}>
        <Icon name="plus" />{t("dl.addWidget")}</button>}
      <button type="button" className="link plugin-source" onClick={() => open(source || `https://github.com/${repo}`)}>{t("plugins.source")}<Icon name="external" /></button>
    </div>
  </article>;
}

/** What every plugin shares, said once: how installs work, the terms, and
 *  the one acceptance that unlocks every Install button. */
function PluginTerms({ cfg, set, open }) {
  const accepted = (cfg?.pluginTerms || 0) >= 1;
  return <div className="card plugin-terms">
    <p className="plugin-desc">{t("plugins.howItWorks")}</p>
    <p className="plugin-desc">{t("plugins.terms")} <button type="button" className="link" onClick={() => open(TERMS_URL)}>{t("plugins.termsLink")}</button></p>
    <label className="terms-check"><input type="checkbox" checked={accepted} disabled={accepted}
      onChange={(e) => { if (e.target.checked) set({ pluginTerms: 1 }, { flush: true }); }} />{t("plugins.acceptTerms")}</label>
  </div>;
}

export function PluginsPage({ cfg, set }) {
  return <>
    <PageHeader title={t("plugins.title")}>{t("plugins.hint")}</PageHeader>
    <PluginTerms cfg={cfg} set={set} open={(url) => dockApi.launch(url)} />
    <div className="plugin-grid">
      {PLUGINS.filter((plugin) => !plugin.companion).map((plugin) => <PluginCard key={plugin.id} {...plugin} cfg={cfg} set={set} open={(url) => dockApi.launch(url)} />)}
    </div>
  </>;
}
