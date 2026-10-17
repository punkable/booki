/* Optional tools live together, independently from Booki's system settings. */
import React, { useEffect, useState } from "react";
import PLUGINS from "../../plugin-catalog.json";
import { dock as dockApi, pickRgbProfile } from "../../api.js";
import { t } from "../../i18n.js";
import { Icon, PageHeader, SettingsSection } from "../ui.jsx";

/** An optional open-source tool Booki can download into its own folder. It
 *  says what it adds, who makes it, its licence and where its source is,
 *  before anything is installed. */
function PluginCard({ id, repo, source, external, license, open }) {
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
    try { await action(); } catch (e) { setError(String(e || "")); }
    await refresh(); setBusy(false);
  };
  return <div className="row-block plugin-card">
    <div className="plugin-head">
      <span className="plugin-meta">{license} · {t("plugins.by").replace("{repo}", () => repo)}{state.installed && state.version ? ` · ${state.version}` : ""}</span>
    </div>
    <p className="plugin-desc">{t(`plugins.${id}.desc`)}</p>
    <p className="plugin-desc plugin-fine">{t(external ? "plugins.winget.managed" : "plugins.howItWorks")}</p>
    {id === "librehardwaremonitor" && <p className="plugin-warning" role="note">{t("plugins.sensorWarning")}</p>}
    <p className="plugin-feeds"><Icon name="sparkles" />{t(`plugins.${id}.feeds`)}{state.installed ? ` · ${t("plugins.active")}` : ""}</p>
    {error && <p className="plugin-desc plugin-action-error" role="alert">{t("plugins.failed")} {error}</p>}
    <div className="plugin-actions">
      {state.installed && ["openrgb", "librehardwaremonitor"].includes(id) && <button type="button" className="button" disabled={busy} onClick={() => run(() => dockApi.pluginOpen(id))}>{t(id === "librehardwaremonitor" ? "plugins.openAdmin" : "system.open")}</button>}
      {state.installed && id === "openrgb" && <button type="button" className="button" disabled={busy} onClick={() => run(async () => { const path = await pickRgbProfile(); if (path) await dockApi.pluginOpen(id, path); })}>{t("plugins.profile")}</button>}
      {external ? <button type="button" className="button" onClick={() => open("ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1")}>{t("plugins.appInstaller")}</button> : state.installed
        ? <button type="button" className="button" disabled={busy} onClick={() => run(() => dockApi.pluginUninstall(id))}>{t("plugins.remove")}</button>
        : <button type="button" className="button button-accent" disabled={busy} onClick={() => run(() => dockApi.pluginInstall(id))}>{busy ? t("plugins.installing") : t("plugins.install")}</button>}
      <button type="button" className="link" onClick={() => open(source || `https://github.com/${repo}`)}>{t("plugins.source")}<Icon name="external" /></button>
    </div>
  </div>;
}


export function PluginsPage() {
  return <>
    <PageHeader title={t("plugins.title")}>{t("plugins.hint")}</PageHeader>
    {PLUGINS.map((plugin) => <SettingsSection key={plugin.id} icon="sparkles" title={plugin.name}>
      <PluginCard {...plugin} open={(url) => dockApi.launch(url)} />
    </SettingsSection>)}
  </>;
}
