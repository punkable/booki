import React from 'react';
import { FINISH_PRESETS } from '../surface.js';
import { t } from '../i18n.js';
import { SettingsSection } from './ui.jsx';
export function FinishPicker({ set }) {
  return <SettingsSection title={t('premium.finishes')} hint={t('premium.finishesHint')}>
    <div className="finish-grid">{FINISH_PRESETS.map(({ id, patch }) => <button className={`finish-card finish-${id}`} type="button" key={id} onClick={() => set(patch)}>
      <span className="finish-sample" aria-hidden="true"><i /><i /><i /></span><strong>{t(`premium.${id}`)}</strong>
    </button>)}</div>
    <p className="finish-note">{t('premium.nativeHint')}</p>
  </SettingsSection>;
}
