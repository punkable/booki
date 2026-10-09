import React from 'react';
import { FINISH_PRESETS, activeFinish } from '../surface.js';
import { t } from '../i18n.js';

/** One finish for dock and notch. Each card paints its own material sample. */
export function FinishPicker({ cfg, set }) {
  const current = activeFinish(cfg);
  return <div className="finish-grid" role="radiogroup" aria-label={t('finish.title')}>
    {FINISH_PRESETS.map(({ id, patch }) => {
      const selected = current === id;
      return <button className={`finish-card finish-${id}`} type="button" role="radio" key={id} aria-checked={selected}
        onClick={() => { if (!selected) set(patch); }}>
        <span className="finish-sample" aria-hidden="true"><span className="finish-sample-bar"><i /><i /><i /></span></span>
        <span className="finish-name">{t(`finish.${id}`)}</span>
        <span className="finish-hint">{t(`finish.${id}Hint`)}</span>
      </button>;
    })}
  </div>;
}
