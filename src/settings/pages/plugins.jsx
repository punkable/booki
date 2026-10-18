/* Optional tools live together, independently from Booki's system settings. */
import { pluginError } from "../../plugin-errors.js";
import React, { useEffect, useState } from "react";
import PLUGINS from "../../plugin-catalog.json";
import { WIDGET_META, widgetDisplayName } from "../../widgets-meta.js";
import { dock as dockApi, pickRgbProfile } from "../../api.js";
import { t } from "../../i18n.js";
import { Icon, PageHeader, SettingsSection } from "../ui.jsx";

/** An optional open-source tool Booki can download into its own folder. It
 *  says what it adds, who makes it, its licence and where its source is,
 *  before anything is installed. */
/** The dock widget a plugin brings, if any (yt-dlp → Downloads). */
const widgetFor = (id) => Object.keys(WIDGET_META).find((w) => WIDGET_META[w].plugin === id);
const pinnedWidget = (pins, widget) => (pins || []).some((p) => p.widget === widget || (p.children || []).some((c) => c.widget === widget));

function PluginCard({ id, repo, source, external, license, open, cfg, set, companions }) {
  const [state, setState] = useState({ installed: false, version: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => dockApi.pluginStatus(id)
    .then((status) => setState({ installed: !!status?.installed, version: status?.version || null }))
    .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [id]);
  const run = async (action) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(pluginError(e)); }
    await refresh(); setBusy(false);
  };
  return <div className="row-block plugin-card">
    <div className="plugin-head">
      <span className="plugin-meta">{license} · {t("plugins.by").replace("{repo}", () => repo)}{state.installed && state.version ? ` · ${state.version}` : ""}</span>
    </div>
    <p className="plugin-desc">{t(`plugins.${id}.desc`)}</p>
    {companions?.length > 0 && <p className="plugin-desc plugin-fine">{t("plugins.includes").replace("{list}", () => companions.map((c) => { const p = PLUGINS.find((x) => x.id === c); return p ? `${p.name} (${p.license})` : c; }).join(", "))}</p>}
    <p className="plugin-desc plugin-fine">{t(external ? "plugins.winget.managed" : "plugins.howItWorks")}</p>
    {id === "librehardwaremonitor" && <p className="plugin-warning" role="note">{t("plugins.sensorWarning")}</p>}
    <p className="plugin-feeds"><Icon name="sparkles" />{t(`plugins.${id}.feeds`)}{state.installed ? ` · ${t("plugins.active")}` : ""}</p>
    {error && <p className="plugin-desc plugin-action-error" role="alert">{error}</p>}
    <div className="plugin-actions">
      {state.installed && ["openrgb", "librehardwaremonitor"].includes(id) && <button type="button" className="button" disabled={busy} onClick={() => run(() => dockApi.pluginOpen(id))}>{t(id === "librehardwaremonitor" ? "plugins.openAdmin" : "system.open")}</button>}
      {state.installed && id === "openrgb" && <button type="button" className="button" disabled={busy} onClick={() => run(async () => { const path = await pickRgbProfile(); if (path) await dockApi.pluginOpen(id, path); })}>{t("plugins.profile")}</button>}
      {external ? <button type="button" className="button" onClick={() => open("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1")}>{t("plugins.appInstaller")}</button> : state.installed
        ? <button type="button" className="button" disabled={busy} onClick={() => run(() => dockApi.pluginUninstall(id))}>{t("plugins.remove")}</button>
        : <button type="button" className="button button-accent" disabled={busy} onClick={() => run(() => dockApi.pluginInstall(id))}>{busy ? t("plugins.installing") : t("plugins.install")}</button>}
      {state.installed && widgetFor(id) && cfg && !pinnedWidget(cfg.pinned, widgetFor(id)) && <button type="button" className="button button-accent"
        onClick={() => set({ pinned: [...(cfg.pinned || []), { id: crypto.randomUUID(), kind: "widget", widget: widgetFor(id), name: widgetDisplayName(widgetFor(id), t), path: "", args: [], style: {} }] })}>
        <Icon name="plus" />{t("dl.addWidget")}</button>}
      <button type="button" className="link" onClick={() => open(source || `https://github.com/${repo}`)}>{t("plugins.source")}<Icon name="external" /></button>
    </div>
  </div>;
}


export function PluginsPage({ cfg, set }) {
  return <>
    <PageHeader title={t("plugins.title")}>{t("plugins.hint")}</PageHeader>
    {PLUGINS.filter((plugin) => !plugin.companion).map((plugin) => <SettingsSection key={plugin.id} icon="sparkles" title={plugin.name}>
      <PluginCard {...plugin} cfg={cfg} set={set} open={(url) => dockApi.launch(url)} />
    </SettingsSection>)}
  </>;
}
