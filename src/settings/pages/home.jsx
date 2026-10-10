/* Home: your dock on a little desktop, what it is set to at a glance, and
   what changed in this version. Every tile leads to where it is changed. */
import React, { useEffect, useState } from "react";
import { dock as dockApi } from "../../api.js";
import { curLang, t } from "../../i18n.js";
import { pinnedKeys, pathKey } from "../../dock/app-candidates.js";
import { countContent, LAYOUT_SCENARIOS } from "../../dock/layout-model.js";
import { activeFinish, FINISH_PRESETS } from "../../surface.js";
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

const SETUP_DISMISSED = "booki.homeSetupDismissed";
const readDismissed = () => { try { return localStorage.getItem(SETUP_DISMISSED) === "1"; } catch (_) { return false; } };

/* First steps for a new dock: bring in the apps you already use and start
   with Windows. It disappears once both are done, or when dismissed. */
function SetupCard({ cfg, set, apps, navigate }) {
  const [autostart, setAutostart] = useState(null);
  const [frequent, setFrequent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  useEffect(() => { dockApi.getAutostart().then((v) => setAutostart(!!v)).catch(() => setAutostart(false)); }, []);
  useEffect(() => {
    if (cfg.usageRecommendationsEnabled === false) { setFrequent([]); return; }
    let alive = true;
    dockApi.frequentApps(12).then((rows) => { if (alive) setFrequent(Array.isArray(rows) ? rows : []); }).catch(() => {});
    return () => { alive = false; };
  }, [cfg.usageRecommendationsEnabled]);
  const keys = pinnedKeys(cfg.pinned);
  const fresh = frequent.filter((app) => app.path && !keys.has(pathKey(app.path))).slice(0, 6);
  const appsDone = apps >= 3;
  if (dismissed || autostart === null || (appsDone && autostart)) return null;
  const addFrequent = () => {
    set({ pinned: [...cfg.pinned, ...fresh.map((app) => ({ id: crypto.randomUUID(), kind: "app", name: app.name, path: app.path, args: [] }))] });
  };
  const toggleStart = async () => {
    setBusy(true);
    await dockApi.setAutostart(true).catch(() => {});
    const real = !!(await dockApi.getAutostart().catch(() => false));
    setAutostart(real); set({ autostart: real }); setBusy(false);
  };
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(SETUP_DISMISSED, "1"); } catch (_) {} };
  return <section className="card setup-card" aria-labelledby="setup-title">
    <header className="setup-head">
      <h2 id="setup-title">{t("setup.title")}</h2>
      <button type="button" className="button setup-dismiss" aria-label={t("setup.dismiss")} title={t("setup.dismiss")} onClick={dismiss}><Icon name="x" /></button>
    </header>
    <ol className="setup-steps">
      <li data-done={appsDone}>
        <Icon name={appsDone ? "check" : "app"} className="setup-icon" />
        <span className="setup-text"><strong>{t("setup.appsTitle")}</strong><span>{appsDone ? t("setup.appsDone") : fresh.length ? t("setup.appsFrequent").replace("{n}", String(fresh.length)) : t("setup.appsHint")}</span></span>
        {!appsDone && <span className="setup-actions">
          {fresh.length > 0 && <button type="button" className="button button-accent" onClick={addFrequent}><Icon name="plus" />{t("setup.addFrequent")}</button>}
          <button type="button" className="button" onClick={() => navigate("apps")}>{t("setup.pickApps")}</button>
        </span>}
      </li>
      <li data-done={!!autostart}>
        <Icon name={autostart ? "check" : "power"} className="setup-icon" />
        <span className="setup-text"><strong>{t("be.autostart")}</strong><span>{autostart ? t("setup.startDone") : t("setup.startHint")}</span></span>
        {!autostart && <span className="setup-actions"><button type="button" className="button" disabled={busy} onClick={toggleStart}>{t("setup.startOn")}</button></span>}
      </li>
      <li>
        <Icon name="palette" className="setup-icon" />
        <span className="setup-text"><strong>{t("finish.title")}</strong><span>{t("setup.finishHint")}</span></span>
        <span className="setup-actions chips" role="group" aria-label={t("finish.title")}>
          {FINISH_PRESETS.map(({ id, patch }) => <button key={id} type="button" className="chip" aria-pressed={activeFinish(cfg) === id} onClick={() => set(patch)}>{t(`finish.${id}`)}</button>)}
        </span>
      </li>
    </ol>
  </section>;
}

/* What Booki costs on this PC right now, measured from its own processes
   (the app and its web view). Hidden where it can't be measured. */
function UsageCard() {
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      dockApi.appUsage().then((u) => { if (alive) setUsage(u || null); }, () => {});
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (!usage) return null;
  const fmt = (n) => n.toLocaleString(curLang(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cpu = usage.cpu < 0.1 ? `< ${fmt(0.1)}` : fmt(usage.cpu);
  return <section className="card home-usage" aria-live="off">
    <Icon name="zap" className="home-usage-icon" />
    <div className="home-usage-text">
      <strong>{t("home.usageTitle")}</strong>
      <span>{t("home.usageHint")}</span>
    </div>
    <div className="home-usage-figures">
      <span><strong>{usage.memoryMb.toLocaleString(curLang())}</strong> MB {t("home.usageMemory")}</span>
      <span><strong>{cpu}</strong> % {t("home.usageCpu")}</span>
    </div>
  </section>;
}

export function HomePage({ cfg, set, navigate, reveal, onSelect, onWhatsNew }) {
  const counts = countContent(cfg.pinned);
  const scenario = LAYOUT_SCENARIOS.find((s) => s.id === (cfg.autoHideMode || "smart"));
  const release = currentRelease();
  // Each tile opens the Dock page at the control it summarises.
  const toDock = (key) => () => (reveal ? reveal("dock", key) : navigate("dock"));
  return <>
    <PageHeader title={t("overhaul.home")}>{t("overhaul.welcome")}</PageHeader>

    <SetupCard cfg={cfg} set={set} apps={counts.apps} navigate={navigate} />

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
      <QuickTile glyph="eye" hue="#5e7bff" label={t("dock.behavior")} value={t(scenario?.title || "overhaul.smart")} onClick={toDock("dock.behavior")} />
      <QuickTile glyph="palette" hue="#ff4f7b" label={t("finish.title")} value={t(`finish.${activeFinish(cfg)}`)} onClick={toDock("tab.appearance")} />
      <QuickTile glyph="sun" hue="#ff9a2e" label={t("ap.theme")} value={t(`theme.${cfg.theme || "system"}`)} onClick={toDock("ap.theme")} />
      <QuickTile glyph="app" hue="#30b0c7" label={t("be.position")} value={t(`edge.${cfg.edge || "bottom"}`)} onClick={toDock("be.position")} />
      <QuickTile glyph="sparkles" hue="#a35bff" label={t("be.notchMode")} value={t(NOTCH_LABELS[resolveNotchMode(cfg)])} onClick={toDock("be.notchMode")} />
      <QuickTile glyph="grid" hue="#34c759" label={t("ap.iconSize")} value={`${cfg.iconSize ?? 48} px`} onClick={toDock("ap.iconSize")} />
    </div>

    <UsageCard />

    <section className="card whats-new">
      <span className="whats-new-badge">v{release.version}</span>
      <div className="whats-new-text"><strong>{t("cl.title")}</strong><span>{release.headline}</span></div>
      <button type="button" className="button" onClick={onWhatsNew}>{t("ab.whatsNew")}</button>
    </section>
  </>;
}
