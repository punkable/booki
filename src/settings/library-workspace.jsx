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
import { findPin, updatePin, removePin, placePin, movePinBy, ungroupPin, mkPin, mergePins, settingsPin, PIN_DRAG_TYPE, readPinDrop, canMergeKind, pinsKey } from '../pins.js';
import { appKey, pinnedKeys } from '../dock/app-candidates.js';
import { AppLibrary } from './app-library.jsx';
import { PreviewPin } from './dock-preview.jsx';
import { GroupLook } from './group-look.jsx';
import { GroupCreator } from './group-creator.jsx';
import { Inspector } from './inspector.jsx';
import { Icon, PageHeader } from './ui.jsx';

/** Catalog, destination and inspector share one committed pin model.
 *
 * Opening a group turns the dock strip itself into the group, like opening
 * a folder: its members take the strip's place, nothing unfolds below it.
 * Dragging a member out of the strip takes it out of the group, and
 * dragging an app in adds it. */
export function LibraryWorkspace({ cfg, set, listInstalled, focusedPin, iconPicker: IconPicker }) {
  const [selectedId, selectId] = useState(focusedPin || null);
  const [candidate, inspectCandidate] = useState(null);
  const [chosenIds, chooseIds] = useState([]);
  const [creatingGroup, createGroup] = useState(false);
  const [targetGroup, setTargetGroup] = useState('');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');
  const [undo, setUndo] = useState(null);
  const [pickingIcon, pickIcon] = useState(null);
  const [webUrl, setWebUrl] = useState('');
  const [webName, setWebName] = useState('');
  const [webBusy, setWebBusy] = useState(false);
  const [pathMissing, setPathMissing] = useState(false);
  const [identities, setIdentities] = useState({});
  const [dropHint, setDropHint] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [outside, setOutside] = useState(false);
  const dragging = useRef(null);
  const springTimer = useRef(null);
  const springFor = useRef(null);
  const stripRef = useRef(null);
  const cancelSpring = () => { clearTimeout(springTimer.current); springFor.current = null; };
  const spring = (key, action) => {
    if (springFor.current === key) return;
    cancelSpring(); springFor.current = key;
    springTimer.current = setTimeout(() => { if (springFor.current === key) { springFor.current = null; action(); } }, 650);
  };
  const latest = useRef(cfg); latest.current = cfg;
  const found = openId && findPin(cfg.pinned, openId);
  const openGroup = found?.kind === 'group' ? found : null;
  const openRef = useRef(openGroup); openRef.current = openGroup;
  const isMember = (group, id) => !!group?.children?.some((child) => child.id === id);
  const commit = (next) => {
    if (next === latest.current.pinned) return;
    setUndo({ before: latest.current.pinned, after: pinsKey(next) });
    set({ pinned: next }); setError('');
  };
  // A member taken out lands right after its group, where it came from.
  const afterGroup = (groupId) => {
    const rows = latest.current.pinned;
    return rows[rows.findIndex((row) => row.id === groupId) + 1]?.id;
  };
  const takeOut = (pin, groupId) => commit(placePin(latest.current.pinned, pin, { beforeId: afterGroup(groupId) }));
  const takeOutRef = useRef(takeOut); takeOutRef.current = takeOut;
  // A drop handled here stops propagation, and a pin moved by it is gone from
  // the strip before its dragend fires, so every drop ends the drag itself.
  const endDrag = () => { dragging.current = null; setDragId(null); setDropHint(null); setOutside(false); cancelSpring(); };
  const endDragRef = useRef(endDrag); endDragRef.current = endDrag;
  useEffect(() => {
    const memberDrag = (event) => openRef.current && dragging.current && isMember(openRef.current, dragging.current.id)
      && [...(event.dataTransfer?.types || [])].includes(PIN_DRAG_TYPE);
    const reset = () => endDragRef.current();
    // Anywhere outside the strip accepts a member, so letting go of it there
    // takes it out of the group.
    const over = (event) => {
      if (!memberDrag(event)) return;
      event.preventDefault();
      setOutside(!stripRef.current?.contains(event.target));
    };
    const drop = (event) => {
      if (!event.defaultPrevented && memberDrag(event) && !stripRef.current?.contains(event.target)) {
        event.preventDefault();
        takeOutRef.current(findPin(latest.current.pinned, dragging.current.id) || dragging.current, openRef.current.id);
      }
      reset();
    };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop); window.addEventListener('dragend', reset);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); window.removeEventListener('dragend', reset); };
  }, []);
  const startDrag = (event, item) => {
    dragging.current = item; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(item));
    // Carry just the icon under the pointer, like dragging an icon on the desktop.
    const art = event.currentTarget.querySelector('.live-preview-app, .live-preview-separator, button > :first-child');
    if (art && event.dataTransfer.setDragImage) { const box = art.getBoundingClientRect(); event.dataTransfer.setDragImage(art, box.width / 2, box.height / 2); }
    // Dim the source after the browser has taken its drag snapshot.
    requestAnimationFrame(() => setDragId(item.id));
  };
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
  const enter = (group) => {
    cancelSpring(); setDropHint(null); chooseIds([]);
    setOpenId(group.id); setTargetGroup(group.id); inspectCandidate(null); selectId(null);
  };
  const leave = () => {
    cancelSpring(); setDropHint(null); chooseIds([]);
    if (targetGroup === openId) setTargetGroup('');
    setOpenId(null);
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
    try { dropPin(event, options); } finally { endDrag(); }
  };
  const dropPin = (event, options) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readPinDrop(event.dataTransfer);
    if (!payload) return;
    const current = findPin(latest.current.pinned, payload.id);
    if (!current && payload.kind === 'app' && pinnedKeys(latest.current.pinned, identities).has(appKey(payload, identities))) return;
    const pin = current || payload;
    if (options.mergeWith) {
      // Bring the app next to its partner first, so a group member or a
      // catalog app can make a group in one step.
      const placed = placePin(latest.current.pinned, pin, { beforeId: options.mergeWith });
      const merged = mergePins(placed, pin.id, options.mergeWith, t('group.new'));
      if (merged !== placed) commit(merged);
      return;
    }
    commit(placePin(latest.current.pinned, pin, options));
  };
  const dragOver = (event) => { if ([...event.dataTransfer.types].includes(PIN_DRAG_TYPE)) event.preventDefault(); };
  // Dropping on a pin works like the dock: its middle files the dragged app
  // into a group (or makes a new group with an app), its sides reorder.
  // Inside an open group only the sides count: groups don't nest.
  const dropModeAt = (event, item) => {
    const box = event.currentTarget.getBoundingClientRect();
    const along = (event.clientX - box.left) / (box.width || 1);
    const dragged = dragging.current;
    if (dragged?.id === item.id) return null;
    if (openRef.current) return along < 0.5 ? 'before' : 'after';
    const mergeable = !dragged || (dragged.kind !== 'group' && canMergeKind(dragged.kind));
    if (mergeable && item.kind === 'group' && along > 0.2 && along < 0.8) return 'into';
    if (mergeable && canMergeKind(item.kind) && along > 0.3 && along < 0.7) return 'merge';
    return along < 0.5 ? 'before' : 'after';
  };
  const pinDragOver = (event, item) => {
    if (![...event.dataTransfer.types].includes(PIN_DRAG_TYPE)) return;
    if (openRef.current && dragging.current?.kind === 'group') return;
    event.preventDefault(); event.stopPropagation();
    const mode = dropModeAt(event, item);
    setDropHint((hint) => hint?.id === item.id && hint.mode === mode ? hint : mode ? { id: item.id, mode } : null);
    // Resting on a group opens it in place, so the app can be placed
    // between its members, like a spring-loaded folder.
    if (mode === 'into') spring(item.id, () => enter(item));
    else cancelSpring(); // left the group (or never on one): no late opening
  };
  const pinDrop = (event, item) => {
    cancelSpring();
    const mode = dropModeAt(event, item); setDropHint(null);
    const group = openRef.current;
    if (group) {
      const kids = group.children || [];
      const next = mode === 'after' ? kids.slice(kids.findIndex((kid) => kid.id === item.id) + 1).find((kid) => kid.id !== dragging.current?.id) : item;
      return drop(event, { groupId: group.id, beforeId: next?.id });
    }
    if (mode === 'into') return drop(event, { groupId: item.id });
    if (mode === 'merge') return drop(event, { mergeWith: item.id });
    const rows = latest.current.pinned.filter((row) => row.kind !== 'widget');
    const after = rows[rows.findIndex((row) => row.id === item.id) + 1];
    return drop(event, mode === 'after' ? { beforeId: after?.id } : { beforeId: item.id });
  };
  const stripItems = openGroup ? openGroup.children || [] : cfg.pinned.filter((item) => item.kind !== 'widget');
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
    <section className={'library-dock-editor' + (openGroup ? ' group-open' : '')} aria-label={openGroup ? `${t('apps.inDock')}: ${pinLabel(openGroup)}` : t('workspace.pinned')}
      onDragOver={dragOver} onDrop={(event) => drop(event, openGroup ? { beforeId: afterGroup(openGroup.id) } : {})}
      onKeyDown={(event) => { if (event.key === 'Escape' && openGroup && !event.defaultPrevented) { event.preventDefault(); leave(); } }}>
      <div className="library-dock-head">
        {openGroup ? <div className="library-crumbs">
          <button type="button" className={'button library-crumb-back' + (outside && dragId ? ' drop-out' : '')} onClick={leave}
            onDragOver={(event) => { if (dragging.current && isMember(openGroup, dragging.current.id)) return; if ([...event.dataTransfer.types].includes(PIN_DRAG_TYPE)) spring('back', leave); }}
            onDragLeave={() => { if (springFor.current === 'back') cancelSpring(); }}>
            <Icon name="arrow-left" />{t('apps.inDock')}
          </button>
          <Icon name="chevron-right" />
          <button type="button" className="library-crumb-group" aria-pressed={selectedId === openGroup.id} title={t('next.inspector')} onClick={() => inspect(openGroup)}>
            <strong>{pinLabel(openGroup)}</strong><span className="library-count">{openGroup.children?.length || 0}</span><Icon name="settings" />
          </button>
        </div>
        : <strong>{t('apps.inDock')}<span className="library-count">{cfg.pinned.filter((item) => item.kind !== 'widget').length}</span></strong>}
        <div className="library-dock-actions">
          {undo && undo.after === pinsKey(cfg.pinned) && <button className="button" onClick={() => { set({ pinned: undo.before }); setUndo(null); }}><Icon name="undo" />{t('act.undo')}</button>}
          {!openGroup && <>
            <button className="button button-accent" onClick={() => createGroup(true)}><Icon name="folder-plus" />{t('apps.newFolderShort')}</button>
            <button className="button" onClick={() => commit([...latest.current.pinned, { id: crypto.randomUUID(), kind: 'separator', name: '', path: '', args: [] }])}><Icon name="minus" />{t('m.separator')}</button>
            <button className="button" disabled={hasSettings(cfg.pinned)} onClick={() => commit([...latest.current.pinned, settingsPin()])}><Icon name="settings" />{t('next.addSettings')}</button>
            <button className="button" disabled={cfg.pinned.some(item => item.kind === 'trash')} onClick={() => commit([...latest.current.pinned, { id: crypto.randomUUID(), kind: 'trash', name: t('trash.name'), path: '', args: [] }])}><Icon name="trash" />{t('apps.addTrash')}</button>
          </>}
        </div>
      </div>

      <div ref={stripRef} key={openGroup ? openGroup.id : 'dock'} className={"library-pin-strip" + (openGroup ? " in-group" : "") + (chosenIds.length ? " selecting" : "") + (openGroup && outside && dragId ? " taking-out" : "")}
        onDragOver={openGroup ? (event) => { if ([...event.dataTransfer.types].includes(PIN_DRAG_TYPE) && dragging.current?.kind !== 'group') event.preventDefault(); } : undefined}
        onDrop={openGroup ? (event) => { setDropHint(null); drop(event, { groupId: openGroup.id }); } : undefined}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropHint(null); }}>{stripItems.map((item) => <div key={item.id} className={'library-pin' + (item.kind === 'separator' ? ' is-separator' : '') + (selectedId === item.id ? ' selected' : '') + (dropHint?.id === item.id ? ` drop-${dropHint.mode}` : '') + (dragId === item.id ? ' is-dragging' : '')}
        draggable onDragStart={(event) => startDrag(event, item)}
        onDragOver={(event) => pinDragOver(event, item)} onDrop={(event) => pinDrop(event, item)}
        onDragLeave={(event) => { if (springFor.current === item.id && !event.currentTarget.contains(event.relatedTarget)) cancelSpring(); }}>
        <button type="button" aria-label={pinLabel(item)} aria-pressed={selectedId === item.id} onClick={() => item.kind === 'group' ? enter(item) : inspect(item)}><PreviewPin item={item} size={40} gap={6} /><span className="library-pin-name">{pinLabel(item)}</span></button>
        {canMergeKind(item.kind) && <input type="checkbox" aria-label={`${t('premium.selectApp')}: ${pinLabel(item)}`} checked={chosenIds.includes(item.id)} onChange={(event) => chooseIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />}
        {item.kind === 'group' && <span className="library-group-count" aria-hidden="true">{item.children?.length || 0}</span>}
        {openGroup && <button className="library-take-out" aria-label={`${t('group.takeOut')}: ${pinLabel(item)}`} title={t('group.takeOut')} onClick={() => takeOut(item, openGroup.id)}><Icon name="take-out" /></button>}
        {dropHint?.id === item.id && ['into', 'merge'].includes(dropHint.mode) && <span className="library-drop-label" aria-hidden="true">{dropHint.mode === 'into' ? t('drop.addTo').replace('{name}', pinLabel(item)) : t('drag.makeGroup')}</span>}
      </div>)}
        {!stripItems.length && <p className="library-empty">{t(openGroup ? 'apps.groupEmptyHint' : 'add.none')}</p>}
        {openGroup && outside && dragId && <span className="library-take-out-label" aria-hidden="true">{t('group.takeOut')}</span>}
      </div>
      {chosenIds.length > 0 && <div className="library-bulk-actions" role="group" aria-label={t('premium.addSelected')}>
        <span>{chosenIds.length}</span>
        <button className="button" onClick={() => { commit(chosenIds.reduce((items, id) => removePin(items, id), latest.current.pinned)); chooseIds([]); }}><Icon name="trash" />{t('apps.remove')}</button>
        {openGroup ? <button className="button" onClick={() => {
          let next = latest.current.pinned; const before = afterGroup(openGroup.id);
          for (const id of chosenIds) { const pin = findPin(next, id); if (pin) next = placePin(next, pin, { beforeId: before }); }
          commit(next); chooseIds([]);
        }}><Icon name="take-out" />{t('group.takeOut')}</button>
        : destination && <button className="button" onClick={() => {
          let next = latest.current.pinned;
          for (const id of chosenIds) { const pin = findPin(next, id); if (pin) next = placePin(next, pin, { groupId: destination }); }
          commit(next); chooseIds([]);
        }}><Icon name="folder" />{t('apps.addToFolder')}</button>}
        <button className="button" onClick={() => chooseIds([])}>{t('trash.cancel')}</button>
      </div>}
      <p className="library-drop-hint">{openGroup ? t('apps.groupDragHint') : <>{t('apps.dragHint')}{cfg.pinned.some((item) => item.kind === 'widget') && <> · {t('apps.widgetsElsewhere')}</>}</>}</p>
    </section>
    {error && <p role="alert">{error}</p>}
    <div className="library-workspace">
      <div className="library-catalog">
        <AppLibrary cfg={cfg} set={set} listInstalled={listInstalled} browseFile={() => browse(false)} browseFolder={() => browse(true)} addCandidates={add} onIdentities={setIdentities} onInspect={(app) => { inspectorOrigin.current = document.activeElement; inspectCandidate(app); selectId(null); }}
          destination={<label className="library-destination">{t('next.destination')}<select value={destination} onChange={(event) => setTargetGroup(event.target.value)}><option value="">{t('workspace.pinned')}</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name || t('group.new')}</option>)}</select></label>}
          webPanel={<div className="web-add"><input type="url" aria-label={t('apps.webPlaceholder')} placeholder={t('apps.webPlaceholder')} value={webUrl} onChange={(event) => setWebUrl(event.target.value)} /><input aria-label={t('apps.webName')} placeholder={t('apps.webName')} value={webName} maxLength={100} onChange={event=>setWebName(event.target.value)} /><button className="button button-accent" disabled={webBusy || !webUrl.trim()} onClick={async () => {
      if (webBusy) return;
      try {
        const raw = webUrl.trim(); const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) || /^(mailto|tel):/i.test(raw) ? raw : 'https://' + raw);
        if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) throw new Error('unsupported');
        setWebBusy(true); const name = webName.trim() || url.hostname; let favicon = null;
        try { favicon = await dock.fetchFavicon(url.href); } catch { /* A favicon never prevents adding a website. */ }
        add([{ name, path: url.href, icon: favicon }]); setWebUrl(''); setWebName('');
      } catch { setError(t('overhaul.failed')); } finally { setWebBusy(false); }
    }}>{t(webBusy ? 'overhaul.loading' : 'apps.webAdd')}</button></div>} />
      </div>
      <Inspector dismissible={!!candidate} className={"library-inspector" + (candidate ? " library-candidate-inspector" : "")} selectionKey={selected?.id || candidate?.path} origin={inspectorOrigin} onBack={() => { inspectCandidate(null); selectId(null); }}>
        {selected ? <>
          <div className="library-inspector-title"><PreviewPin item={selected} size={44} gap={6} /><h2>{pinLabel(selected)}</h2></div>
          {candidate ? <><p className="muted">{selected.path}</p><button className="button button-accent" disabled={!!candidatePinned} onClick={() => add([candidate])}><Icon name="plus" />{t('workspace.addApp')}</button></> : <>
            {selected.kind !== 'separator' && <label>{t('apps.rename')}<input value={selected.name || ''} onChange={(event) => set({ pinned: updatePin(latest.current.pinned, selected.id, { name: event.target.value }) })} /></label>}
            {selected.kind === 'group' && <GroupLook key={selected.id} item={selected} onChange={(style) => commit(updatePin(latest.current.pinned, selected.id, { style }))} />}
            {selected.kind !== 'separator' && selected.kind !== 'widget' && selected.kind !== 'trash' && !(selected.kind === 'group' && selected.style?.glyph) && <button className="button" onClick={() => pickIcon(selected)}><Icon name="palette" />{t('apps.changeIcon')}</button>}
            <div className="library-dock-actions">
              <button className="button" disabled={movePinBy(cfg.pinned, selected.id, -1) === cfg.pinned} onClick={() => commit(movePinBy(latest.current.pinned, selected.id, -1))}><Icon name="arrow-left" />{t('stack.previous')}</button>
              <button className="button" disabled={movePinBy(cfg.pinned, selected.id, 1) === cfg.pinned} onClick={() => commit(movePinBy(latest.current.pinned, selected.id, 1))}>{t('stack.next')}<Icon name="arrow-right" /></button>
            </div>
            {selected.path && <p className="muted">{selected.path}</p>}
            {pathMissing && <p role="status">{t('apps.missing')}</p>}
            {['app','folder'].includes(selected.kind) && <div className="workspace-actions">
              <button className="button" onClick={async () => { try { await dock.openLocation(selected.path); } catch { setError(t('overhaul.failed')); } }}><Icon name="external" />{t('apps.openLoc')}</button>
              <button className="button" onClick={async () => {
                const id = selected.id;
                try { const path = await (selected.kind === 'folder' ? pickFolder() : pickAppFile()); if (path && findPin(latest.current.pinned, id)) commit(updatePin(latest.current.pinned, id, { path, icon: null })); }
                catch { setError(t('overhaul.failed')); }
              }}><Icon name="folder" />{t('apps.reassign')}</button>
            </div>}
            {selected.kind === 'group' && <button className="button" onClick={() => { commit(ungroupPin(latest.current.pinned, selected.id)); selectId(null); if (openId === selected.id) leave(); }}><Icon name="take-out" />{t('group.ungroup')}</button>}
            <button className="button" onClick={() => { commit(removePin(latest.current.pinned, selected.id)); selectId(null); if (openId === selected.id) leave(); }}><Icon name="trash" />{t('apps.remove')}</button>
          </>}
        </> : <p className="muted">{t('next.inspectEmpty')}</p>}
      </Inspector>
    </div>

    {pickingIcon && IconPicker && <IconPicker item={pickingIcon} onClose={() => pickIcon(null)} onPick={(value) => { commit(updatePin(latest.current.pinned, pickingIcon.id, { icon: value })); pickIcon(null); }} />}
    {creatingGroup && <GroupCreator pinned={cfg.pinned} initialIds={chosenIds} onClose={() => createGroup(false)} onCreate={(next) => { commit(next); createGroup(false); chooseIds([]); }} />}
  </>;
}
