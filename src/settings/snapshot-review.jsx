import React, { useState } from 'react';
import { t } from '../i18n.js';
import { DockPreview } from './dock-preview.jsx';
import { useModalControls } from './ui.jsx';
import { createPortal } from 'react-dom';
import { snapshotChangeGroups, snapshotScalar } from './snapshot-model.js';

export function SnapshotReview({ current, snapshot, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dismiss = () => { if (!busy) onClose(); };
  useModalControls(dismiss);
  const groups = snapshotChangeGroups(current, snapshot, t);
  return createPortal(<div className="modal-scrim" onClick={dismiss}><section className="modal snapshot-review" role="dialog" aria-modal="true" aria-label={t('integral.reviewSnapshot')} aria-busy={busy} onClick={event=>event.stopPropagation()}>
    <div className="modal-head"><strong>{t('integral.reviewSnapshot')}</strong><button className="s-btn s-btn-soft" disabled={busy} onClick={dismiss}>{t('trash.cancel')}</button></div>
    <div className="snapshot-review-body"><div className="snapshot-previews"><section><h3>{t('integral.currentDock')}</h3><DockPreview cfg={current} /></section><section><h3>{t('integral.replacementDock')}</h3><DockPreview cfg={snapshot} /></section></div>
      <p>{t('ap.backupImportConfirm')}</p><ul className="snapshot-changes">{groups.map(group => {
        const field = group.fields[0], before = snapshotScalar(current[field],t), after = snapshotScalar(snapshot[field],t);
        return <li key={group.label}><strong>{group.label}{group.fields.length > 1 ? ` · ${group.fields.length}` : ''}</strong>{group.fields.length === 1 && before !== null && after !== null && <span className="snapshot-values"><span>{before}</span><span aria-hidden="true">→</span><span>{after}</span></span>}</li>;
      })}</ul>
      {error && <p role="alert">{error}</p>}
    </div><div className="workspace-actions snapshot-review-footer"><button className="s-btn" disabled={busy} onClick={async()=>{ setBusy(true);setError('');try { await onConfirm();onClose(); } catch(e) { setError(t((String(e).includes('BOOKI_IMPORT_CHANGED') || String(e).includes('BOOKI_PROFILE_CHANGED'))?'integral.importChanged':'ap.backupError')); } finally { setBusy(false); } }}>{t(busy?'overhaul.loading':'prof.apply')}</button></div>
  </section></div>,document.body);
}
