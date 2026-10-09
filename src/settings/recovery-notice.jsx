import React, { useEffect, useState } from 'react';
import { invoke } from '../api.js';
import { t } from '../i18n.js';

/** Never silently turn unreadable user files into a fresh installation. */
export function RecoveryNotice({ revision, onProfiles, onStartFresh }) {
  const [report, setReport] = useState(null), [armed, setArmed] = useState(false), [error, setError] = useState(false);
  useEffect(() => { let alive = true; invoke('config_recovery_status').then(value => { if (alive) setReport(value); }).catch(() => {}); return () => { alive = false; }; }, [revision]);
  if (!report?.kind) return null;
  const accept = async () => {
    if (report.blocked && !armed) { setArmed(true); return; }
    try { if (report.blocked) await onStartFresh(); else await invoke('acknowledge_config_recovery'); setReport(null); }
    catch { setError(true); }
  };
  return <section className="recovery-notice" role="alert">
    <strong>{t(report.blocked ? 'integral.recoveryBlocked' : 'integral.recoveryRestored')}</strong>
    <p>{t(report.blocked ? 'integral.recoveryKeep' : 'integral.recoveryBackup')}</p>
    {error && <p>{t('overhaul.failed')}</p>}
    <div className="workspace-actions"><button className="button" onClick={onProfiles}>{t('tab.profiles')}</button>
      <button className="button" onClick={accept}>{t(report.blocked ? armed ? 'integral.startFreshConfirm' : 'integral.startFresh' : 'w.done')}</button></div>
  </section>;
}
