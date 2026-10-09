/* Booki Settings: a sidebar with five pages and a search box.
   State lives in settings/store.js; each page is its own module. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { dock as dockApi, onShowChangelog, onShowTab } from "./api.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { showBookiMenu } from "./native-context-menu.js";
import { isTextEditor } from "./dock/context-menu.js";
import { useSettingsStore } from "./settings/store.js";
import { findSettings } from "./settings/search.js";
import { NativeBackdrop } from "./settings/native-backdrop.jsx";
import { RecoveryNotice } from "./settings/recovery-notice.jsx";
import { SettingsBoundary } from "./settings/error-boundary.jsx";
import { ChangelogModal } from "./settings/changelog.jsx";
import { HomePage } from "./settings/pages/home.jsx";
import { DockPage } from "./settings/pages/dock.jsx";
import { WidgetsPage } from "./settings/pages/widgets.jsx";
import { AppsPage } from "./settings/pages/apps.jsx";
import { SystemPage } from "./settings/pages/system.jsx";

// [id, label, glyph, tile colour]
const PAGES = [
  ["home", "overhaul.home", "grid", "var(--accent)"],
  ["dock", "tab.dock", "app", "#5e7bff"],
  ["widgets", "tab.widgets", "zap", "#ff4f7b"],
  ["apps", "overhaul.appsFolders", "folder", "#ff9a2e"],
  ["system", "overhaul.system", "settings", "#8d8a93"],
];
const PAGE_IDS = PAGES.map(([id]) => id);
/** Pages from older builds (the dock, saved state, search) → where they live now. */
const MOVED = { appearance: "dock", autohide: "dock", notch: "dock", general: "system", profiles: "system", shortcuts: "system", faq: "system", about: "system", clipboard: "widgets" };
const pageOf = (id) => (PAGE_IDS.includes(id) ? id : MOVED[id] || null);

function Search({ onChoose }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const results = useMemo(() => findSettings(query), [query]);
  const open = !!query.trim();
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const focus = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);
  const choose = (result) => { if (!result) return; setQuery(""); onChoose(result); };
  const onKeyDown = (e) => {
    if (e.key === "Escape" && query) { e.preventDefault(); e.stopPropagation(); setQuery(""); return; }
    if (!results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
  };
  return <div className="search">
    <span className="search-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon("search") }} />
    <input ref={input} type="search" placeholder={t("search.placeholder")} value={query} role="combobox" aria-autocomplete="list"
      aria-label={t("search.placeholder")} aria-expanded={open} aria-controls={open ? "settings-search-results" : undefined}
      aria-activedescendant={open && results[active] ? `settings-search-${results[active].key}` : undefined}
      onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
    {open && <div id="settings-search-results" className="search-results" role="listbox">
      {results.map((result, index) => <button key={result.key} id={`settings-search-${result.key}`} type="button" role="option"
        aria-selected={index === active} onClick={() => choose(result)}>
        <span>{result.label}</span><span className="search-page">{result.tabLabel}</span>
      </button>)}
      {!results.length && <p className="search-none">{t("search.none")}</p>}
    </div>}
  </div>;
}

/** Scroll to and highlight the setting a search result points at. */
function useRevealSetting(page, target) {
  useEffect(() => {
    if (!target) return undefined;
    let frame, timer;
    const find = () => [...document.querySelectorAll("[data-setting-label]")].find((el) => el.dataset.settingLabel === target.label);
    frame = requestAnimationFrame(() => {
      // Open only the collapsed groups that contain the target.
      for (let parent = find()?.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches("details")) parent.open = true;
        if (parent.classList.contains("ui-collapsible")) parent.querySelector(':scope > .ui-group > .ui-disclosure[aria-expanded="false"]')?.click();
      }
      frame = requestAnimationFrame(() => {
        const el = find();
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        el.classList.add("search-target");
        el.querySelector("input, select, button")?.focus({ preventScroll: true });
        timer = setTimeout(() => el.classList.remove("search-target"), 2500);
      });
    });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [page, target]);
}

function App() {
  const store = useSettingsStore();
  const { cfg, set, saveState, configConflict, closeError } = store;
  const main = useRef(null);
  const [version, setVersion] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [searchTarget, setSearchTarget] = useState(null);
  const [focusedPin, setFocusedPin] = useState(null);
  const [page, setPageRaw] = useState(() => {
    try { return pageOf(localStorage.getItem("booki.lastTab")) || "home"; } catch (_) { return "home"; }
  });
  const navigate = (id) => {
    const next = pageOf(id) || "home";
    setFocusedPin(null);
    setPageRaw(next);
    try { localStorage.setItem("booki.lastTab", next); } catch (_) {}
    requestAnimationFrame(() => { if (main.current) main.current.scrollTop = 0; });
  };
  useRevealSetting(page, searchTarget);

  useEffect(() => {
    dockApi.appVersion().then(setVersion).catch(() => {});
    // The dock can ask for "What's new" or a page, before or after this window exists.
    dockApi.takePendingChangelog().then((v) => v && setShowChangelog(true)).catch(() => {});
    const showTab = () => dockApi.takePendingTab().then((tab) => tab && navigate(tab)).catch(() => {});
    showTab();
    const unlisten = [onShowChangelog(() => setShowChangelog(true)), onShowTab(showTab)];
    // Pinned icons are <img>; a native drag would let Windows save a stray .png.
    const noDrag = (e) => { if (!e.target.closest('[draggable="true"]')) e.preventDefault(); };
    window.addEventListener("dragstart", noDrag);
    return () => { unlisten.forEach((p) => p.then((un) => un?.())); window.removeEventListener("dragstart", noDrag); };
  }, []);

  // Escape closes the dialog first, then the window.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.key !== "Escape") return;
      if (showChangelog) setShowChangelog(false);
      else store.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showChangelog, store.close]);

  if (!cfg) return <div className="settings" aria-busy="true"><aside className="sidebar" /><main className="settings-main" /></div>;

  const select = (item) => { navigate(item.kind === "widget" ? "widgets" : "apps"); setFocusedPin(item.id); };
  const pageProps = { cfg, set, focusedPin };
  return <div className="settings">
    <aside className="sidebar">
      <div className="brand">
        <img src="/brand/svg/isotype.svg" alt="" />
        <img className="brand-word only-light" src="/brand/svg/logoonlytextblack.svg" alt="Booki" />
        <img className="brand-word only-dark" src="/brand/svg/logoonlytextwhite.svg" alt="Booki" />
        {version && <span className="brand-version">v{version}</span>}
      </div>
      <Search onChoose={(result) => { navigate(result.tab); setSearchTarget(result); }} />
      <nav className="nav" aria-label={t("nav.label")}>
        {PAGES.map(([id, label, glyph, hue]) => <button key={id} type="button" className="nav-item" aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}>
          <span className="nav-icon" style={{ "--hue": hue }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(glyph) }} />
          <span>{t(label)}</span>
        </button>)}
      </nav>
      <div className="sidebar-foot">
        <button type="button" className="nav-item nav-quit" onClick={async () => { if (await store.settled()) dockApi.quit(); }}>
          <span className="nav-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon("x") }} /><span>{t("act.quit")}</span>
        </button>
      </div>
    </aside>
    <main ref={main} className="settings-main">
      <div className={"page page-" + page}>
        <p className={"save-status is-" + saveState} role="status" aria-live="polite">
          {saveState === "saving" ? t("status.saving") : saveState === "saved" ? t("status.saved") : saveState === "error" ? t("status.saveError") : ""}
        </p>
        {configConflict && <div className="notice notice-error conflict-error" role="alert"><span>{t("workspace.conflict")}</span>
          <button type="button" className="button" onClick={() => store.resolveConfigConflict(true)}>{t("workspace.keepMine")}</button>
          <button type="button" className="button" onClick={() => store.resolveConfigConflict(false)}>{t("workspace.useOther")}</button></div>}
        {closeError && <div className="notice notice-error close-error" role="alert"><span>{t("workspace.closeFailed")}</span>
          <button type="button" className="button" onClick={store.close}>{t("focus.retry")}</button></div>}
        <NativeBackdrop cfg={cfg} />
        <RecoveryNotice revision={cfg.revision} onProfiles={() => navigate("system")} onStartFresh={store.startFresh} />
        <SettingsBoundary key={page} onHome={() => navigate("home")}>
          {page === "home" && <HomePage cfg={cfg} navigate={navigate} onSelect={select} onWhatsNew={() => setShowChangelog(true)} />}
          {page === "dock" && <DockPage {...pageProps} />}
          {page === "widgets" && <WidgetsPage {...pageProps} />}
          {page === "apps" && <AppsPage {...pageProps} />}
          {page === "system" && <SystemPage {...pageProps} version={version} store={store} onWhatsNew={() => setShowChangelog(true)} />}
        </SettingsBoundary>
      </div>
    </main>
    {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
  </div>;
}

const settingsRoot = import.meta.hot?.data.settingsRoot || createRoot(document.getElementById("root"));
settingsRoot.render(<SettingsBoundary><App /></SettingsBoundary>);
if (import.meta.hot) import.meta.hot.dispose((data) => { data.settingsRoot = settingsRoot; });

// Text fields keep their editing commands; everything else gets Booki's menu.
document.addEventListener("contextmenu", (event) => { if (!isTextEditor(event.target)) showBookiMenu(event); });
