import React, { useEffect, useMemo, useRef, useState } from "react";
import { dock } from "../api.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { frequentCandidates, installedCandidates, runningCandidates, pinnedKeys, rank } from "../dock/add-panel.js";
import { SettingsSection } from "./ui.jsx";

function AppIcon({ path, name }) {
  const [src, setSrc] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      dock.appIcon(path).then((uri) => { if (alive) setSrc(uri); }).catch(() => {});
    });
    if (ref.current) observer.observe(ref.current);
    return () => { alive = false; observer.disconnect(); };
  }, [path]);
  return <span className="app-library-icon" ref={ref}>{src ? <img src={src} alt="" /> : name.charAt(0).toUpperCase()}</span>;
}
export function AppLibrary({ cfg, set, listInstalled }) {
  const [data, setData] = useState({ groups: [], running: [], used: [], folders: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const generation = useRef(0);
  const load = async (refresh = false) => {
    const seq = ++generation.current;
    setLoading(true); setFailed(false);
    const result = await Promise.allSettled([listInstalled(refresh), dock.listWindows(), dock.frequentApps(50), dock.knownFolders()]);
    if (seq !== generation.current) return;
    const value = (i) => result[i].status === "fulfilled" && Array.isArray(result[i].value) ? result[i].value : [];
    setData({ groups: value(0), running: value(1), used: value(2), folders: value(3) });
    setFailed(result.slice(0, 3).every((r) => r.status === "rejected")); setLoading(false);
  };
  useEffect(() => { load(); return () => { generation.current++; }; }, []);
  const keys = useMemo(() => pinnedKeys(cfg.pinned), [cfg.pinned]);
  const frequent = frequentCandidates(data.used, keys, 12);
  const running = runningCandidates(data.running, keys);
  const installed = rank(installedCandidates(data.groups, keys), query);
  const add = (candidate) => set({ pinned: [...cfg.pinned, { id: crypto.randomUUID(), kind: "app", name: candidate.name, path: candidate.path, args: [] }] });
  const cards = (candidates) => <div className="app-library-grid">{candidates.map((candidate) => <button key={candidate.path} type="button"
    className={"app-library-card" + (candidate.pinned ? " pinned" : "")} disabled={candidate.pinned} onClick={() => add(candidate)} title={candidate.name}>
    <AppIcon path={candidate.path} name={candidate.name} /><span>{candidate.name}</span><span className="app-library-add" dangerouslySetInnerHTML={{ __html: icon(candidate.pinned ? "check" : "plus") }} />
  </button>)}</div>;
  const PAGE_SIZE = 36;
  return <SettingsSection title={t("apps.suggest")} hint={t("overhaul.suggestionsHint")}>
    <div className="app-library-tools"><input type="search" aria-label={t("apps.search")} placeholder={t("apps.search")} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
      <button className="s-btn s-btn-soft" disabled={loading} onClick={() => load(true)}>{t("apps.refresh")}</button></div>
    {loading ? <p className="muted" role="status">{t("overhaul.loading")}</p> : failed ? <p role="alert">{t("overhaul.failed")}</p> : <>
      {!query.trim() && <>
        <h3 className="app-library-heading">{t("add.frequent")}</h3>
        {frequent.length ? cards(frequent) : <p className="muted">{t("overhaul.noUsage")}</p>}
        {running.length > 0 && <><h3 className="app-library-heading">{t("add.running")}</h3>{cards(running)}</>}
        <div className="app-library-folders">{data.folders.map(([key, path]) => <button key={key} disabled={keys.has(path.toLowerCase())} className="s-btn s-btn-soft" onClick={() => set({ pinned: [...cfg.pinned, { id: crypto.randomUUID(), kind: "folder", name: t(`kf.${key}`), path, args: [] }] })}>{t(`kf.${key}`)}</button>)}</div>
      </>}
      <h3 className="app-library-heading">{t("add.all")} <span>{installed.length}</span></h3>
      {cards(installed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))}
      {!installed.length && <p className="muted">{t("add.none")}</p>}
      {installed.length > PAGE_SIZE && <div className="app-library-pager"><button className="s-btn s-btn-soft" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("stack.previous")}</button><span>{page + 1} / {Math.ceil(installed.length / PAGE_SIZE)}</span><button className="s-btn s-btn-soft" disabled={(page + 1) * PAGE_SIZE >= installed.length} onClick={() => setPage(page + 1)}>{t("stack.next")}</button></div>}
    </>}
  </SettingsSection>;
}
