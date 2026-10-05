import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { canMergeKind, groupSelected } from '../pins.js';
import { t } from '../i18n.js';
import { useModalControls, Icon } from './ui.jsx';

/** A group enters the saved dock only after it has at least two members. */
export function GroupCreator({ pinned, onCreate, onClose }) {
  useModalControls(onClose);
  const [name, setName] = useState(t('group.new'));
  const [selected, setSelected] = useState([]);
  const candidates = pinned.filter((item) => canMergeKind(item.kind));
  const chosen = candidates.filter((item) => selected.includes(item.id));
  const create = () => {
    const next = groupSelected(pinned, chosen.map((item) => item.id), name.trim() || t('group.new'), crypto.randomUUID());
    if (next !== pinned) onCreate(next);
  };
  return createPortal(<div className="modal-scrim modal-scrim-locked">
    <div className="modal group-creator" role="dialog" aria-modal="true" aria-label={t('apps.newFolder')}>
      <div className="modal-head"><strong>{t('apps.newFolder')}</strong><button type="button" className="pin-btn ico" aria-label={t('stack.close')} onClick={onClose}><Icon name="x" /></button></div>
      <div className="group-creator-body">
        <label>{t('apps.rename')}<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
        <p className="muted">{t('workspace.groupHint')}</p>
        <div className="group-creator-items">{candidates.map((item) => <label key={item.id}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
          <Icon name={item.kind === 'widget' ? 'sparkles' : item.kind === 'folder' ? 'folder' : 'app'} /><span>{item.name}</span>
        </label>)}</div>
        {candidates.length < 2 && <p role="status" className="muted">{t('workspace.groupEmpty')}</p>}
      </div>
      <div className="group-creator-actions"><button type="button" className="s-btn s-btn-soft" onClick={onClose}>{t('trash.cancel')}</button><button type="button" className="s-btn" disabled={chosen.length < 2} onClick={create}>{t('workspace.createGroup')} ({chosen.length})</button></div>
    </div>
  </div>, document.body);
}
