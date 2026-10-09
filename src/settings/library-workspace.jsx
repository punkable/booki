import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n.js';
import { widgetDisplayName } from '../widgets-meta.js';

function pinLabel(item) {
  if (item.name && !(item.kind === 'action' && item.name === 'Booki')) return item.name;
  if (item.kind === 'action') return t('m.settings');
  if (item.kind === 'widget') return widgetDisplayName(item.widget, t);
  if (item.kind === 'group') return t('group.new');
  if (item.kind === 'trash') return t('trash.name');
  return item.kind === 'separator' ? t('m.separator') : item.path?.split(/[\\/]/).pop() || t('workspace.addApp');
}

import { dock, pickAppFile, pickFolder } from '../api.js';
import { findPin, updatePin, removePin, placePin, movePinBy, ungroupPin, mkPin, settingsPin, PIN_DRAG_TYPE, readPinDrop, canMergeKind } from '../pins.js';
import { appKey, pinnedKeys } from '../dock/app-candidates.js';
import { AppLibrary } from './app-library.jsx';
import { PreviewPin } from './dock-preview.jsx';
import { GroupCreator } from './group-creator.jsx';
import { Inspector } from './inspector.jsx';
import { Icon, PageHeader } from './ui.jsx';

/** Catalog, destination and inspector share one committed pin model. */
export function LibraryWorkspace({ cfg, set, listInstalled, focusedPin, iconPicker: IconPicker }) {
  const [selectedId, selectId] = useState(focusedPin || null);
  const [candidate, inspectCandidate] = useState(null);
  const [chosenIds, chooseIds] = useState([]);
  const [creatingGroup, createGroup] = useState(false);
  const [targetGroup, setTargetGroup] = useState('');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState(null);
  const [pickingIcon, pickIcon] = useState(null);
  const [webUrl, setWebUrl] = useState('');
  const [webName, setWebName] = useState('');
  const [webBusy, setWebBusy] = useState(false);
  const [pathMissing, setPathMissing] = useState(false);
  const [identities, setIdentities] = useState({});
  const latest = useRef(cfg); latest.current = cfg;
  const inspectorOrigin = useRef(null);
  const selected = candidate || findPin(cfg.pinned, selectedId);
  const selectedPath = selected?.path;
  const selectedKind = selected?.kind;
  useEffect(() => {
    let alive = true; setPathMissing(false);
    if (selectedPath && ['app', 'folder'].includes(selectedKind)) {
      dock.pathsExist([selectedPath]).then(flags => { if (alive) setPathMissing(flags?.[0] === false); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [selectedPath, selectedKind]);
  const candidatePinned = candidate && pinnedKeys(cfg.pinned, identities).has(appKey(candidate, identities));
  const groups = cfg.pinned.filter((item) => item.kind === 'group');
  const destination = groups.some((item) => item.id === targetGroup) ? targetGroup : '';
  const commit = (next) => {
    if (next === latest.current.pinned) return;
    setUndo({ before: latest.current.pinned, after: JSON.stringify(next) });
    set({ pinned: next }); setError('');
  };
  const add = (apps) => {
    let next = latest.current.pinned;
    const keys = pinnedKeys(next, identities);
    for (const app of apps) {
      const key = appKey(app, identities); if (keys.has(key)) continue; keys.add(key);
      const pin = { id: crypto.randomUUID(), kind: app.kind === 'folder' ? 'folder' : 'app', name: app.name, path: app.path, args: app.args || [], ...(app.icon ? { icon: app.icon } : {}) };
      next = placePin(next, pin, { groupId: destination || undefined });
    }
    commit(next);
  };
  const drop = (event, options = {}) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readPinDrop(event.dataTransfer);
    if (!payload) return;
    const current = findPin(latest.current.pinned, payload.id);
    if (!current && payload.kind === 'app' && pinnedKeys(latest.current.pinned, identities).has(appKey(payload, identities))) return;
    commit(placePin(latest.current.pinned, current || payload, options));
  };
  const dragOver = (event) => { if ([...event.dataTransfer.types].includes(PIN_DRAG_TYPE)) event.preventDefault(); };
  const inspect = (item) => { inspectorOrigin.current = document.activeElement; inspectCandidate(null); selectId(item.id); };
  const browse = async (folder) => {
    try {
      const path = await (folder ? pickFolder() : pickAppFile());
      if (path) commit(placePin(latest.current.pinned, mkPin(path, folder ? 'folder' : 'app'), { groupId: destination || undefined }));
    } catch (_) { setError(t('overhaul.failed')); }
  };
  const hasSettings = (items) => items.some((item) => item.kind === 'action' && item.action === 'settings' || hasSettings(item.children || []));
  return <>
    <PageHeader title={t('overhaul.appsFolders')}>{t('next.selectionHint')}</PageHeader>
    <section className="library-dock-editor" aria-label={t('workspace.pinned')} onDragOver={dragOver} onDrop={(event) => drop(event)}>
      <div className="library-dock-head"><strong>{t('workspace.pinned')}</strong><label className="library-destination">{t('next.destination')}<select value={destination} onChange={(event) => setTargetGroup(event.target.value)}><option value="">{t('workspace.pinned')}</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name || t('group.new')}</option>)}</select></label><div className="library-dock-actions">
        <button className="s-btn s-btn-soft" onClick={() => createGroup(true)}><Icon name="folder-plus" />{t('apps.newFolderShort')}</button>
        <button className="s-btn s-btn-soft" disabled={hasSettings(cfg.pinned)} onClick={() => commit([...latest.current.pinned, settingsPin()])}><Icon name="settings" />{t('next.addSettings')}</button>
        <button className="s-btn s-btn-soft" onClick={() => commit([...latest.current.pinned, { id: crypto.randomUUID(), kind: 'separator', name: '', path: '', args: [] }])}><Icon name="minus" />{t('m.separator')}</button>
        <button className="s-btn s-btn-soft" disabled={cfg.pinned.some(item => item.kind === 'trash')} onClick={() => commit([...latest.current.pinned, { id: crypto.randomUUID(), kind: 'trash', name: t('trash.name'), path: '', args: [] }])}><Icon name="trash" />{t('apps.addTrash')}</button>
        {undo && undo.after === JSON.stringify(cfg.pinned) && <button className="s-btn s-btn-soft" onClick={() => { set({ pinned: undo.before }); setUndo(null); }}><Icon name="undo" />{t('act.undo')}</button>}
      </div></div>

      <div className="library-pin-strip">{cfg.pinned.map((item) => <div key={item.id} className={'library-pin' + (selectedId === item.id ? ' selected' : '')}
        draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(item)); }}
        onDragOver={dragOver} onDrop={(event) => drop(event, { beforeId: item.id })}>
        <button type="button" aria-label={pinLabel(item)} aria-pressed={selectedId === item.id} onClick={() => inspect(item)}><PreviewPin item={item} size={36} gap={6} /><span className="library-pin-name">{pinLabel(item)}</span></button>
        {canMergeKind(item.kind) && <input type="checkbox" aria-label={`${t('premium.selectApp')}: ${pinLabel(item)}`} checked={chosenIds.includes(item.id)} onChange={(event) => chooseIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />}
        {item.kind === 'group' && <button className="library-group-drop" onDragOver={dragOver} onDrop={(event) => drop(event, { groupId: item.id })} onClick={() => { inspect(item); setTargetGroup(item.id); }} aria-label={t('apps.addToFolder')} title={t('apps.addToFolder')}><Icon name="plus" /><span>{item.children?.length || 0}</span></button>}
      </div>)}</div>
      {chosenIds.length > 0 && <div className="library-bulk-actions" role="group" aria-label={t('premium.addSelected')}>
        <span>{chosenIds.length}</span>
        <button className="s-btn s-btn-soft" onClick={() => { commit(chosenIds.reduce((items, id) => removePin(items, id), latest.current.pinned)); chooseIds([]); }}><Icon name="trash" />{t('apps.remove')}</button>
        {destination && <button className="s-btn s-btn-soft" onClick={() => {
          let next = latest.current.pinned;
          for (const id of chosenIds) { const pin = findPin(next, id); if (pin) next = placePin(next, pin, { groupId: destination }); }
          commit(next); chooseIds([]);
        }}><Icon name="folder" />{t('apps.addToFolder')}</button>}
        <button className="s-btn s-btn-soft" onClick={() => chooseIds([])}>{t('trash.cancel')}</button>
      </div>}
      <p className="library-drop-hint">{t('next.dropHint')}</p>
    </section>
    {error && <p role="alert">{error}</p>}
    <div className="library-workspace">
      <div className="library-catalog">
        <AppLibrary cfg={cfg} set={set} listInstalled={listInstalled} browseFile={() => browse(false)} browseFolder={() => browse(true)} addCandidates={add} onIdentities={setIdentities} onInspect={(app) => { inspectorOrigin.current = document.activeElement; inspectCandidate(app); selectId(null); }} />
    <details className="library-web"><summary>{t('apps.web')}</summary><div className="web-add"><input type="url" aria-label={t('apps.webPlaceholder')} placeholder={t('apps.webPlaceholder')} value={webUrl} onChange={(event) => setWebUrl(event.target.value)} /><input aria-label={t('apps.webName')} placeholder={t('apps.webName')} value={webName} maxLength={100} onChange={event=>setWebName(event.target.value)} /><button className="s-btn" disabled={webBusy || !webUrl.trim()} onClick={async () => {
      if (webBusy) return;
      try {
        const raw = webUrl.trim(); const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : 'https://' + raw);
        if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) throw new Error('unsupported');
        setWebBusy(true); const name = webName.trim() || url.hostname; let favicon = null;
        try { favicon = await dock.fetchFavicon(url.href); } catch { /* A favicon never prevents adding a website. */ }
        add([{ name, path: url.href, icon: favicon }]); setWebUrl(''); setWebName('');
      } catch { setError(t('overhaul.failed')); } finally { setWebBusy(false); }
    }}>{t(webBusy ? 'overhaul.loading' : 'apps.webAdd')}</button></div></details>
      </div>
      <Inspector dismissible={!!candidate} className={"library-inspector" + (candidate ? " library-candidate-inspector" : "")} selectionKey={selected?.id || candidate?.path} origin={inspectorOrigin} onBack={() => { inspectCandidate(null); selectId(null); }}>
        {selected ? <>
          <div className="library-inspector-title"><PreviewPin item={selected} size={32} gap={6} /><h2>{pinLabel(selected)}</h2></div>
          {candidate ? <><p className="muted">{selected.path}</p><button className="s-btn" disabled={!!candidatePinned} onClick={() => add([candidate])}><Icon name="plus" />{t('workspace.addApp')}</button></> : <>
            <label>{t('apps.rename')}<input value={selected.name || ''} onChange={(event) => set({ pinned: updatePin(latest.current.pinned, selected.id, { name: event.target.value }) })} /></label>
            {selected.kind !== 'separator' && selected.kind !== 'widget' && selected.kind !== 'trash' && <button className="s-btn s-btn-soft" onClick={() => pickIcon(selected)}><Icon name="palette" />{t('apps.changeIcon')}</button>}
            <div className="library-dock-actions">
              <button className="s-btn s-btn-soft" disabled={movePinBy(cfg.pinned, selected.id, -1) === cfg.pinned} onClick={() => commit(movePinBy(latest.current.pinned, selected.id, -1))}><Icon name="arrow-left" />{t('stack.previous')}</button>
              <button className="s-btn s-btn-soft" disabled={movePinBy(cfg.pinned, selected.id, 1) === cfg.pinned} onClick={() => commit(movePinBy(latest.current.pinned, selected.id, 1))}>{t('stack.next')}<Icon name="arrow-right" /></button>
            </div>
            {selected.path && <p className="muted">{selected.path}</p>}
            {pathMissing && <p role="status">{t('apps.missing')}</p>}
            {['app','folder'].includes(selected.kind) && <div className="workspace-actions">
              <button className="s-btn s-btn-soft" onClick={async () => { try { await dock.openLocation(selected.path); } catch { setError(t('overhaul.failed')); } }}><Icon name="external" />{t('apps.openLoc')}</button>
              <button className="s-btn s-btn-soft" onClick={async () => {
                const id = selected.id;
                try { const path = await (selected.kind === 'folder' ? pickFolder() : pickAppFile()); if (path && findPin(latest.current.pinned, id)) commit(updatePin(latest.current.pinned, id, { path, icon: null })); }
                catch { setError(t('overhaul.failed')); }
              }}><Icon name="folder" />{t('apps.reassign')}</button>
            </div>}
            {selected.kind === 'group' && <div className="library-group-members">{(selected.children || []).map((child) => <div key={child.id} draggable onDragStart={(event) => event.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(child))}>
              <button className="s-btn s-btn-soft" onClick={() => inspect(child)}>{pinLabel(child)}</button>
              <button className="pin-btn" aria-label={`${t('group.takeOut')}: ${child.name}`} onClick={() => commit(placePin(latest.current.pinned, child))}><Icon name="take-out" /></button>
            </div>)}</div>}
            {selected.kind === 'group' && <button className="s-btn s-btn-soft" onClick={() => { commit(ungroupPin(latest.current.pinned, selected.id)); selectId(null); }}><Icon name="take-out" />{t('group.ungroup')}</button>}
            <button className="s-btn s-btn-soft" onClick={() => { commit(removePin(latest.current.pinned, selected.id)); selectId(null); }}><Icon name="trash" />{t('apps.remove')}</button>
          </>}
        </> : <p className="muted">{t('next.inspectEmpty')}</p>}
      </Inspector>
    </div>

    {pickingIcon && IconPicker && <IconPicker item={pickingIcon} onClose={() => pickIcon(null)} onPick={(value) => { commit(updatePin(latest.current.pinned, pickingIcon.id, { icon: value })); pickIcon(null); }} />}
    {creatingGroup && <GroupCreator pinned={cfg.pinned} initialIds={chosenIds} onClose={() => createGroup(false)} onCreate={(next) => { commit(next); createGroup(false); chooseIds([]); }} />}
  </>;
}
