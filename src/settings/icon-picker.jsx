import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { dock, pickImageFile } from '../api.js';
import { t } from '../i18n.js';
import { ICON_LIBRARY, ICON_STYLES, isLibIcon, parseLibIcon, libToken, libIconDataUri, resolveLibIcon, currentAccentColors } from '../icon-library.js';
import { Icon, useModalControls } from './ui.jsx';

/** Preview a local draft before replacing an icon; Cancel leaves the pin intact. */
export function IconPickerModal({ item, onPick, onClose }) {
  useModalControls(onClose);
  const [draft, setDraft] = useState(item.icon ?? null);
  const [style, setStyle] = useState(isLibIcon(item.icon) ? parseLibIcon(item.icon).style : 'badge');
  const [query, setQuery] = useState('');
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const colors = currentAccentColors();
  const matches = useMemo(() => ICON_LIBRARY.filter((name) => name.includes(query.trim().toLowerCase())), [query]);
  useEffect(() => {
    let active = true;
    if (item.path) dock.appIcon(item.path).then((value) => { if (active) setOriginal(value); }).catch(() => {});
    return () => { active = false; };
  }, [item.path]);
  const upload = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const path = await pickImageFile();
      if (!path) return;
      const uri = await dock.imageDataUri(path);
      if (!uri) throw new Error('Image unavailable');
      setDraft(uri);
    } catch { setError(t('overhaul.failed')); }
    finally { setBusy(false); }
  };
  const preview = isLibIcon(draft) ? resolveLibIcon(draft) : draft || original;
  return createPortal(<div className="modal-scrim" onClick={onClose}>
    <div className="modal icon-picker" aria-busy={busy} role="dialog" aria-modal="true" aria-label={t('icon.title')} onClick={(event) => event.stopPropagation()}>
      <div className="modal-head"><strong>{t('icon.title')}</strong><button type="button" className="icon-button" aria-label={t('stack.close')} onClick={onClose}><Icon name="x" /></button></div>
      <div className="icon-picker-preview" aria-label={t('icon.preview')}>
        {preview ? <img src={preview} alt="" /> : <Icon name="app" />}<span>{item.name}</span>
      </div>
      <div className="icon-styles">{ICON_STYLES.map((value) => <button key={value} type="button" aria-pressed={style === value} className={'seg-mini' + (style === value ? ' active' : '')} onClick={() => { setStyle(value); if (isLibIcon(draft)) setDraft(libToken(parseLibIcon(draft).name, value)); }}>{t('icon.style.' + value)}</button>)}</div>
      <input type="search" className="text-field" aria-label={t('icon.search')} placeholder={t('icon.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="icon-grid">{matches.map((name) => <button key={name} type="button" className="icon-cell" title={name} aria-label={name} aria-pressed={isLibIcon(draft) && parseLibIcon(draft).name === name} onClick={() => setDraft(libToken(name, style))}><img src={libIconDataUri(name, style, colors)} alt="" /></button>)}</div>
      {!matches.length && <p role="status">{t('search.none')}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="workspace-actions"><button type="button" className="button" disabled={busy} onClick={upload}>{t('icon.upload')}</button><button type="button" className="button" onClick={() => setDraft(null)}>{t('icon.reset')}</button><button type="button" className="button" onClick={onClose}>{t('trash.cancel')}</button><button type="button" className="button button-accent" disabled={busy || draft === (item.icon ?? null)} onClick={() => onPick(draft)}>{t('prof.apply')}</button></div>
    </div>
  </div>, document.body);
}
