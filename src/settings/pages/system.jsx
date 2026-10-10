/* System: everything that is about Booki rather than the dock's look —
   language, startup, shortcuts, updates, profiles and backups, privacy,
   help and about. */
import React, { useEffect, useState } from "react";
import { dock as dockApi, pickSavePath } from "../../api.js";
import { t } from "../../i18n.js";
import { UpdatesCard } from "../updates.jsx";
import { ProfilesPage } from "../profiles.jsx";
import { HotkeyInput, LANG_OPTIONS, ModifierPicker } from "../controls.jsx";
import { CollapsibleSection, Icon, PageHeader, Row, Select, SettingsSection, Toggle } from "../ui.jsx";

const REPO = "https://github.com/punkable/booki";
const CONTACT = "punkable@protonmail.com";
const DONATE = [
  { key: "btc", name: "Bitcoin", src: "/brand/svg/bitcoin.svg", addr: "bc1pltth9wcqnctc2nqa6he6puqpqs83a2rdkxhyk8gk53uvk6v2mnustsq7t3" },
  { key: "sol", name: "Solana", src: "/brand/svg/solana.svg", addr: "JCRkiVEm5sPBNnna1j16CRu5E4VeNWtoj6TThxmVFB4W" },
];
const FAQ = ["what", "data", "where", "smartscreen", "updates", "resources", "opensource", "uninstall"];

function Autostart({ cfg, set }) {
  const [on, setOn] = useState(!!cfg.autostart);
  useEffect(() => { dockApi.getAutostart().then((v) => setOn(!!v)).catch(() => {}); }, []);
  return <Toggle label={t("be.autostart")} checked={on} onChange={async (value) => {
    setOn(value);
    await dockApi.setAutostart(value).catch(() => {});
    // Trust the registry, not our optimism.
    const real = !!(await dockApi.getAutostart().catch(() => value));
    setOn(real);
    set({ autostart: real });
  }} />;
}

function Diagnostics() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setStatus("");
    try {
      const path = await pickSavePath("booki-diagnostics.json");
      if (path) { await dockApi.exportDiagnostics(path); setStatus(t("overhaul.exported")); }
    } catch (_) { setStatus(t("overhaul.failed")); }
    finally { setBusy(false); }
  };
  return <Row label={t("overhaul.diagnostics")} hint={<span role="status">{status || t("overhaul.diagnosticsHint")}</span>}>
    <button type="button" className="button" disabled={busy} onClick={save}>{t("ap.export")}</button>
  </Row>;
}

function Donate() {
  const [copied, setCopied] = useState("");
  const copy = async (entry) => {
    try { await navigator.clipboard.writeText(entry.addr); setCopied(entry.key); setTimeout(() => setCopied(""), 1600); } catch (_) {}
  };
  return DONATE.map((entry) => <Row key={entry.key} stack label={<span className="donate-name"><img src={entry.src} alt="" width="20" height="20" />{entry.name}</span>}
    hint={<code className="selectable">{entry.addr}</code>}>
    <button type="button" className="button" onClick={() => copy(entry)}>{copied === entry.key ? t("ab.copied") : t("ab.copy")}</button>
  </Row>);
}

function ResetButton({ onReset }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return <button type="button" className={"button" + (armed ? " button-danger" : "")} onClick={() => {
    if (!armed) return setArmed(true);
    setArmed(false);
    onReset();
  }}>{armed ? t("ab.resetConfirm") : t("act.reset")}</button>;
}

export function SystemPage({ cfg, set, version, store, onWhatsNew }) {
  const open = (url) => dockApi.launch(url);
  return <>
    <PageHeader title={t("overhaul.system")}>{t("system.pageHint")}</PageHeader>

    <SettingsSection icon="settings" title={t("gen.title")}>
      <Row label={t("ap.language")} hint={t("gen.langHint")}>
        <Select label={t("ap.language")} value={cfg.language || "system"} onChange={(v) => set({ language: v })}
          options={LANG_OPTIONS.map((o) => ({ value: o.value, label: o.key ? t(o.key) : o.label }))} />
      </Row>
      <Autostart cfg={cfg} set={set} />
    </SettingsSection>

    <SettingsSection icon="keyboard" title={t("tab.shortcuts")}>
      <Row label={t("sc.toggle")} hint={t("sc.global")}>
        <HotkeyInput value={cfg.hotkey} onChange={(v) => { set({ hotkey: v }); dockApi.setHotkey(v); }} />
      </Row>
      <Toggle label={t("sc.positions")} checked={cfg.positionHotkeys !== false}
        onChange={(v) => { set({ positionHotkeys: v }); dockApi.applyHotkeys(cfg.hotkey || "", v, cfg.hotkeyModifier || "Alt"); }} />
      {cfg.positionHotkeys !== false && <Row label={t("sc.posMod")} hint={t("sc.posHint").replaceAll("{mod}", (cfg.hotkeyModifier || "Alt").replace("Super", "Win"))}>
        <ModifierPicker cfg={cfg} set={set} />
      </Row>}
    </SettingsSection>

    <SettingsSection icon="refresh" title={t("ab.updates")} hint={t("premium.updateExplanation")}>
      <UpdatesCard beforeApply={store.prepareConfigOperation} />
    </SettingsSection>

    <section className="ui-group-wrap profiles-wrap"><ProfilesPage embedded cfg={cfg} onApply={store.applyProfile} beforeSnapshot={store.prepareConfigOperation} onImport={store.importProfile} /></section>

    <SettingsSection icon="shield" title={t("system.privacy")} hint={t("faq.fact.net")}>
      <Toggle label={t("gen.captureVisible")} hint={t("gen.captureVisibleHint")} checked={!!cfg.captureVisible} onChange={(v) => set({ captureVisible: v })} />
      <Toggle label={t("gen.ctxMenu")} hint={t("gen.ctxMenuHint")} checked={cfg.contextMenu !== false} onChange={(v) => set({ contextMenu: v })} />
      <Row label={t("faq.link.data")} hint={<code>%APPDATA%\Booki</code>}><button type="button" className="button" onClick={() => dockApi.openDataDir().catch(() => {})}>{t("system.open")}</button></Row>
      <Diagnostics />
    </SettingsSection>

    <CollapsibleSection title={t("faq.title")} hint={t("faq.intro")}>
      {FAQ.map((key) => <details className="faq-item" key={key}><summary>{t(`faq.q.${key}`)}<Icon name="chevron-down" /></summary><p>{t(`faq.a.${key}`)}</p></details>)}
    </CollapsibleSection>

    <SettingsSection icon="info" title={t("ab.title")}>
      <div className="about">
        <img className="about-logo" src="/brand/svg/isotype.svg" alt="" />
        <div className="about-text">
          <span className="about-name">Booki <span className="about-version">v{version || "…"}</span></span>
          <span className="about-tagline">{t("ab.tagline")}</span>
        </div>
        <button type="button" className="button" onClick={onWhatsNew}>{t("ab.whatsNew")}</button>
      </div>
      <div className="link-row">
        <button type="button" className="link" onClick={() => open(REPO)}>{t("faq.link.repo")}<Icon name="external" /></button>
        <button type="button" className="link" onClick={() => open(`${REPO}/issues`)}>{t("faq.link.issues")}<Icon name="external" /></button>
        <button type="button" className="link" onClick={() => open(`${REPO}/blob/main/LICENSE`)}>{t("faq.link.license")}<Icon name="external" /></button>
        <button type="button" className="link" onClick={() => open(`mailto:${CONTACT}`)}>{CONTACT}<Icon name="external" /></button>
      </div>
    </SettingsSection>

    <CollapsibleSection title={t("ab.free")} hint={t("ab.donateHint").replace(/\s*[:：]\s*$/, "")}><Donate /></CollapsibleSection>

    <SettingsSection icon="alert-triangle" title={t("ab.danger")}>
      <Row label={t("act.reset")} hint={t("ab.resetHint")}><ResetButton onReset={store.reset} /></Row>
    </SettingsSection>
  </>;
}
