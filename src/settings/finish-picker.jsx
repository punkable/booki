import React from 'react';
import { FINISH_PRESETS, resolveSurfaceStyle, legacyNotchFromSurface } from '../surface.js';
import { t } from '../i18n.js';

/** One selection for dock and notch, with independent details below. */
export function FinishPicker({ cfg, set }) {
  const current = resolveSurfaceStyle(cfg);
  return <div className="finish-grid" role="group" aria-label={t('ap.surface')}>
    {FINISH_PRESETS.map(({ id, patch }) => {
      const selected = current === patch.surfaceStyle;
      return <button className={`finish-card finish-${id}${selected ? ' active' : ''}`} type="button" key={id}
        aria-pressed={selected} aria-label={t(`premium.${id}`)}
        onClick={() => { if (!selected) set({ ...patch, notchStyle: legacyNotchFromSurface(patch.surfaceStyle) }); }}>
        <span className="finish-sample" aria-hidden="true"><span className="finish-sample-bar"><i /><i /><i /></span></span>
        <strong>{t(`premium.${id}`)}</strong><small>{t(`surface.${patch.surfaceStyle}Hint`)}</small>
      </button>;
    })}
  </div>;
}
