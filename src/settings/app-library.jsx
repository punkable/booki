import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dock } from '../api.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { candidateSections, pinnedKeys, pathKey, appKey } from '../dock/app-candidates.js';
import { SettingsSection } from './ui.jsx';

function AppIcon({ path, name }) {
  const [src, setSrc] = useState(null); const ref = useRef(null);
  useEffect(() => {
    let alive = true; setSrc(null);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); dock.appIcon(path).then((uri) => { if (alive) setSrc(uri); }).catch(() => {});
    });
    if (ref.current) observer.observe(ref.current);
    return () => { alive = false; observer.disconnect(); };
  }, [path]);
  return <span className="app-library-icon" ref={ref}>{src ? <img src={src} alt="" /> : name.charAt(0).toUpperCase()}</span>;
}
const walkPaths = (items) => items.flatMap((i) => [i.path, ...walkPaths(i.children || [])]).filter(Boolean);
export function AppLibrary({ cfg, set, listInstalled }) {
  const [data, setData] = useState({ groups: [], running: [], used: [], folders: [], identities: {} });
  const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState([]); const [page, setPage] = useState(0);
  const [selected, setSelected] = useState({}); const [message, setMessage] = useState('');
  const generation = useRef(0);
  const load = async (refresh = false) => {
    const seq = ++generation.current; setLoading(true); setFailed([]); setPage(0);
    if (refresh) dock.invalidateIcons();
    const result = await Promise.allSettled([listInstalled(refresh), dock.listWindows(), cfg.usageRecommendationsEnabled === false ? Promise.resolve([]) : dock.frequentApps(50), dock.knownFolders()]);
    if (seq !== generation.current) return;
    const value = (i) => result[i].status === 'fulfilled' && Array.isArray(result[i].value) ? result[i].value : [];
    const next = { groups: value(0), running: value(1), used: value(2), folders: value(3) };
    const paths = [...new Set([...next.groups.flatMap((g) => g.items.map((i) => i.path)), ...next.running.map((w) => w.exe), ...next.used.map((u) => u.path), ...walkPaths(cfg.pinned)])];
    const identities = await dock.appIdentities(paths).then((v) => v || {}).catch(() => ({})); if (seq !== generation.current) return;
    setData({ ...next, identities }); setFailed(result.map((r, i) => r.status === 'rejected' ? i : -1).filter((i) => i >= 0)); setLoading(false);
  };
  useEffect(() => { load(); return () => { generation.current++; }; }, [cfg.usageRecommendationsEnabled]);
  const keys = useMemo(() => pinnedKeys(cfg.pinned, data.identities), [cfg.pinned, data.identities]);
  const sections = useMemo(() => candidateSections({ ...data, used: data.used.filter((u) => !(cfg.ignoredAppSuggestions || []).includes(pathKey(u.path))) }, keys, query, data.identities), [data, keys, query, cfg.ignoredAppSuggestions]);
  const add = (candidates) => {
    const fresh = candidates.filter((c) => !pinnedKeys(cfg.pinned, data.identities).has(appKey(c, data.identities)));
    if (!fresh.length) return;
    set({ pinned: [...cfg.pinned, ...fresh.map((c) => ({ id: crypto.randomUUID(), kind: 'app', name: c.name, path: c.path, args: c.args || [] }))] });
    setSelected({}); setMessage(t('add.added'));
  };
  const cards = (candidates, suggestions = false) => <div className="app-library-grid">{candidates.map((c) => <div className="app-library-choice" key={appKey(c, data.identities)}>
    <button type="button" className={'app-library-card' + (c.pinned ? ' pinned' : '')} disabled={c.pinned} onClick={() => add([c])} title={c.path}>
      <AppIcon path={c.path} name={c.name} /><span>{c.name}</span><span className="app-library-add" dangerouslySetInnerHTML={{ __html: icon(c.pinned ? 'check' : 'plus') }} />
    </button>
    {!c.pinned && <input type="checkbox" aria-label={`${t('premium.selectApp')}: ${c.name}`} checked={!!selected[appKey(c, data.identities)]} onChange={(e) => setSelected((prev) => ({ ...prev, [appKey(c, data.identities)]: e.target.checked ? c : null }))} />}
    {suggestions && <button className="suggestion-dismiss" aria-label={`${t('premium.hideSuggestion')}: ${c.name}`} onClick={() => set({ ignoredAppSuggestions: [...new Set([...(cfg.ignoredAppSuggestions || []), pathKey(c.path)])].slice(-256) })}>×</button>}
  </div>)}</div>;
  const PAGE_SIZE = 36;
  return <SettingsSection title={t('apps.suggest')} hint={t('overhaul.suggestionsHint')}>
    <div className="app-library-tools"><input type="search" aria-label={t('apps.search')} placeholder={t('apps.search')} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
      <button className="s-btn s-btn-soft" disabled={loading} onClick={() => load(true)}>{t('apps.refresh')}</button></div>
    <div role="status" aria-live="polite">{message}</div>
    {Object.values(selected).some(Boolean) && <div className="app-library-selection"><button className="s-btn" onClick={() => add(Object.values(selected).filter(Boolean))}>{t('premium.addSelected')} ({Object.values(selected).filter(Boolean).length})</button><button className="s-btn s-btn-soft" onClick={() => setSelected({})}>{t('act.cancel')}</button></div>}
    {loading ? <p className="muted" role="status">{t('overhaul.loading')}</p> : <>
      {failed.length > 0 && <p role="alert">{t('overhaul.partialApps')}</p>}
      {sections.frequent.length > 0 && <><h3 className="app-library-heading">{t('add.frequent')}</h3>{cards(sections.frequent, true)}</>}
      {!query.trim() && !sections.frequent.length && <p className="muted">{t('overhaul.noUsage')}</p>}
      {sections.running.length > 0 && <><h3 className="app-library-heading">{t('add.running')}</h3>{cards(sections.running)}</>}
      {!query.trim() && <div className="app-library-folders">{data.folders.map(([key, path]) => <button key={key} disabled={keys.has(data.identities[path] || pathKey(path))} className="s-btn s-btn-soft" onClick={() => set({ pinned: [...cfg.pinned, { id: crypto.randomUUID(), kind: 'folder', name: t(`kf.${key}`), path, args: [] }] })}>{t(`kf.${key}`)}</button>)}</div>}
      <h3 className="app-library-heading">{t('add.all')} <span>{sections.installed.length}</span></h3>
      {cards(sections.installed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))}
      {!sections.installed.length && !failed.includes(0) && <p className="muted">{t('add.none')}</p>}
      {sections.installed.length > PAGE_SIZE && <div className="app-library-pager"><button className="s-btn s-btn-soft" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('stack.previous')}</button><span>{page + 1} / {Math.ceil(sections.installed.length / PAGE_SIZE)}</span><button className="s-btn s-btn-soft" disabled={(page + 1) * PAGE_SIZE >= sections.installed.length} onClick={() => setPage(page + 1)}>{t('stack.next')}</button></div>}
    </>}
    <details className="app-library-privacy"><summary>{t('premium.suggestionSettings')}</summary>
      <label><input type="checkbox" checked={cfg.usageRecommendationsEnabled !== false} onChange={(e) => set({ usageRecommendationsEnabled: e.target.checked })} />{t('premium.localRecommendations')}</label>
      <button className="s-btn s-btn-soft" onClick={() => set({ ignoredAppSuggestions: [] })}>{t('premium.restoreSuggestions')}</button>
      <button className="s-btn s-btn-soft" onClick={async () => { try { await dock.clearUsage(); await load(); setMessage(t('premium.historyCleared')); } catch (_) { setMessage(t('overhaul.failed')); } }}>{t('premium.clearHistory')}</button>
    </details>
  </SettingsSection>;
}
