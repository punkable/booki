import React, { useEffect, useState } from 'react';
import { updates } from '../update.js';
import { t } from '../i18n.js';
import { Button, Row } from './ui.jsx';
export function UpdatesCard({ onWhatsNew, beforeApply }) {
  const [state, setState] = useState(updates.snapshot);
  useEffect(() => {
    const unsubscribe = updates.subscribe(setState);
    if (['idle', 'none', 'error'].includes(updates.snapshot().phase)) updates.check().catch(() => {});
    return unsubscribe;
  }, []);
  const { phase, update, pct, error } = state;
  const busy = phase === 'downloading' || phase === 'installing';
  return <>
    {error && <p className="update-error" role="alert">{t('ab.error')}</p>}
    {phase === 'available' || phase === 'ready' ? <Row label={<>{t('ab.newVersion')} <strong>v{update.version}</strong> {t('ab.available')}</>} hint={phase === 'ready' ? t('premium.updateReady') : t('premium.updateDownloadHint')}>
      <Button appearance="primary" onClick={() => (phase === 'ready' ? updates.apply(beforeApply) : updates.download()).catch(() => {})}>{t(phase === 'ready' ? 'premium.updateApply' : 'premium.updateDownload')}</Button>
    </Row> : busy ? <Row label={phase === 'installing' ? t('ab.installing') : `${t('ab.downloading')} ${pct == null ? '…' : Math.round(pct * 100) + '%'}`}>
      <div className={'upd-bar' + (pct == null ? ' indeterminate' : '')} role="progressbar" aria-label={t('ab.downloading')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct == null ? undefined : Math.round(pct * 100)}><i style={{ transform: `scaleX(${phase === 'installing' ? 1 : pct == null ? .35 : pct})` }} /></div>
    </Row> : <Row label={phase === 'none' ? t('ab.upToDate') : phase === 'error' ? t('ab.error') : t('ab.check')} hint={t('ab.keeps')}>
      <Button disabled={phase === 'checking'} onClick={() => updates.check().catch(() => {})}>{t(phase === 'checking' ? 'ab.checking' : 'ab.check')}</Button>
    </Row>}
    <p className="muted update-explanation">{t('premium.updateExplanation')}</p>
    {update?.body && <details className="update-notes"><summary>{t('overhaul.updateNotes')}</summary><pre>{update.body}</pre></details>}
    <Row label={t('ab.whatsNew')}><Button onClick={onWhatsNew}>{t('ab.whatsNew')}</Button></Row>
  </>;
}
