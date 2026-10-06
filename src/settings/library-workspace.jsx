import React, { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n.js';
import { widgetDisplayName } from '../widgets-meta.js';

function pinLabel(item) {
  if (item.name && !(item.kind === 'action' && item.name === 'Booki')) return item.name;
  if (item.kind === 'action') return t('m.settings');
  if (item.kind === 'widget') return widgetDisplayName(item.widget, t);
  if (item.kind === 'group') return t('group.new');
  return item.kind === 'separator' ? t('m.separator') : item.path?.split(/[\\/]/).pop() || t('workspace.addApp');
}

import { pickAppFile, pickFolder } from '../api.js';
import { findPin, updatePin, removePin, placePin, mkPin, settingsPin, PIN_DRAG_TYPE, readPinDrop, canMergeKind } from '../pins.js';
import { appKey, pinnedKeys } from '../dock/app-candidates.js';
import { AppLibrary } from './app-library.jsx';
import { DockPreview } from './dock-preview.jsx';
import { GroupCreator } from './group-creator.jsx';
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
  const [identities, setIdentities] = useState({});
  const latest = useRef(cfg); latest.current = cfg;
  const editorRef = useRef(null);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const scroller = editor?.closest('.s-content');
    if (!editor || !scroller) return;
    const update = () => scroller.style.setProperty('--library-editor-height', `${Math.ceil(editor.getBoundingClientRect().height) + 12}px`);
    const observer = new ResizeObserver(update); observer.observe(editor); update();
    return () => { observer.disconnect(); scroller.style.removeProperty('--library-editor-height'); };
  }, []);
  const selected = candidate || findPin(cfg.pinned, selectedId);
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
      const pin = { id: crypto.randomUUID(), kind: 'app', name: app.name, path: app.path, args: app.args || [] };
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
  const inspect = (item) => { inspectCandidate(null); selectId(item.id); };
  const browse = async (folder) => {
    try {
      const path = await (folder ? pickFolder() : pickAppFile());
      if (path) commit(placePin(latest.current.pinned, mkPin(path, folder ? 'folder' : 'app'), { groupId: destination || undefined }));
    } catch (_) { setError(t('overhaul.failed')); }
  };
  const hasSettings = (items) => items.some((item) => item.kind === 'action' && item.action === 'settings' || hasSettings(item.children || []));
  return <>
    <PageHeader title={t('overhaul.appsFolders')}>{t('next.selectionHint')}</PageHeader>
    <section ref={editorRef} className="library-dock-editor" aria-label={t('workspace.pinned')} onDragOver={dragOver} onDrop={(event) => drop(event)}>
      <div className="library-dock-head"><strong>{t('workspace.pinned')}</strong><div className="library-dock-actions">
        <button className="s-btn s-btn-soft" onClick={() => createGroup(true)}><Icon name="folder-plus" />{t('apps.newFolderShort')}</button>
        <button className="s-btn s-btn-soft" disabled={hasSettings(cfg.pinned)} onClick={() => commit([...cfg.pinned, settingsPin()])}><Icon name="settings" />{t('next.addSettings')}</button>
        {undo && undo.after === JSON.stringify(cfg.pinned) && <button className="s-btn s-btn-soft" onClick={() => { set({ pinned: undo.before }); setUndo(null); }}><Icon name="undo" />{t('act.undo')}</button>}
      </div></div>
      <DockPreview cfg={cfg} onSelect={inspect} onDragPin={(event, item) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(item)); }} onDragOver={dragOver} onDropPin={(event, item) => drop(event, item.kind === 'group' ? { groupId: item.id } : { beforeId: item.id })} />
      <div className="library-pin-strip">{cfg.pinned.map((item) => <div key={item.id} className={'library-pin' + (selectedId === item.id ? ' selected' : '')}
        draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(item)); }}
        onDragOver={dragOver} onDrop={(event) => drop(event, { beforeId: item.id })}>
        <button type="button" aria-pressed={selectedId === item.id} onClick={() => inspect(item)}><Icon name={item.kind === 'group' ? 'folder' : item.kind === 'widget' ? 'sparkles' : item.kind === 'action' ? 'settings' : 'app'} />{pinLabel(item)}</button>
        {canMergeKind(item.kind) && <input type="checkbox" aria-label={`${t('premium.selectApp')}: ${item.name}`} checked={chosenIds.includes(item.id)} onChange={(event) => chooseIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />}
        {item.kind === 'group' && <button className="library-group-drop" onDragOver={dragOver} onDrop={(event) => drop(event, { groupId: item.id })} onClick={() => { inspect(item); setTargetGroup(item.id); }}>{t('apps.addToFolder')}</button>}
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
      <p className="muted">{t('next.dropHint')}</p>
    </section>
    {error && <p role="alert">{error}</p>}
    <div className="library-workspace">
      <div className="library-catalog"><label className="library-destination">{t('next.destination')}<select value={destination} onChange={(event) => setTargetGroup(event.target.value)}><option value="">{t('workspace.pinned')}</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name || t('group.new')}</option>)}</select></label>
        <AppLibrary cfg={cfg} set={set} listInstalled={listInstalled} browseFile={() => browse(false)} browseFolder={() => browse(true)} addCandidates={add} onIdentities={setIdentities} onInspect={(app) => { inspectCandidate(app); selectId(null); }} />
      </div>
      <aside className="library-inspector" aria-label={t('next.inspector')}>
        {selected ? <>
          <h2>{pinLabel(selected)}</h2>
          {candidate ? <><p className="muted">{selected.path}</p><button className="s-btn" disabled={!!candidatePinned} onClick={() => add([candidate])}><Icon name="plus" />{t('workspace.addApp')}</button></> : <>
            <label>{t('apps.rename')}<input value={selected.name || ''} onChange={(event) => set({ pinned: updatePin(latest.current.pinned, selected.id, { name: event.target.value }) })} /></label>
            {selected.kind !== 'separator' && selected.kind !== 'widget' && <button className="s-btn s-btn-soft" onClick={() => pickIcon(selected)}><Icon name="palette" />{t('apps.changeIcon')}</button>}
            {selected.path && <p className="muted">{selected.path}</p>}
            {selected.kind === 'group' && <div className="library-group-members">{(selected.children || []).map((child) => <div key={child.id} draggable onDragStart={(event) => event.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(child))}>
              <button className="s-btn s-btn-soft" onClick={() => inspect(child)}>{pinLabel(child)}</button>
              <button className="pin-btn" aria-label={`${t('group.takeOut')}: ${child.name}`} onClick={() => commit(placePin(latest.current.pinned, child))}><Icon name="take-out" /></button>
            </div>)}</div>}
            <button className="s-btn s-btn-soft" onClick={() => { commit(removePin(latest.current.pinned, selected.id)); selectId(null); }}><Icon name="trash" />{t('apps.remove')}</button>
          </>}
        </> : <p className="muted">{t('next.inspectEmpty')}</p>}
      </aside>
    </div>
    <details className="library-web"><summary>{t('apps.web')}</summary><div className="web-add"><input type="url" aria-label={t('apps.webPlaceholder')} placeholder={t('apps.webPlaceholder')} value={webUrl} onChange={(event) => setWebUrl(event.target.value)} /><button className="s-btn" onClick={() => {
      try { const url = new URL(webUrl.trim()); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported'); add([{ name: url.hostname, path: url.href }]); setWebUrl(''); } catch (_) { setError(t('overhaul.failed')); }
    }}>{t('apps.webAdd')}</button></div></details>
    {pickingIcon && IconPicker && <IconPicker item={pickingIcon} onClose={() => pickIcon(null)} onPick={(value) => { commit(updatePin(latest.current.pinned, pickingIcon.id, { icon: value })); pickIcon(null); }} />}
    {creatingGroup && <GroupCreator pinned={cfg.pinned} initialIds={chosenIds} onClose={() => createGroup(false)} onCreate={(next) => { commit(next); createGroup(false); chooseIds([]); }} />}
  </>;
}
