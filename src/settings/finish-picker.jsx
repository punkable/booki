import React from 'react';
import { FINISH_PRESETS, activeFinish, resolveGlassTint, surfaceAlpha, surfaceForeground, translucent } from '../surface.js';
import { paintedLook } from '../system-look.js';
import { t } from '../i18n.js';

/** The dock's style. Each card paints the real look of that style, with the
 * current theme and fill, over a small wallpaper so the blur shows. */
export function FinishPicker({ cfg, set }) {
  const current = activeFinish(cfg);
  return <div className="finish-grid" role="radiogroup" aria-label={t('finish.title')}>
    {FINISH_PRESETS.map(({ id, patch }) => {
      const selected = current === id;
      const look = paintedLook({ ...cfg, ...patch, reduceTransparency: false });
      const tint = resolveGlassTint(look) || 'var(--surface-tint)';
      const ink = surfaceForeground(look);
      const sample = {
        '--sample-fill': `color-mix(in srgb, ${tint} ${Math.round(surfaceAlpha(look) * 100)}%, transparent)`,
        '--sample-ink': ink || undefined,
      };
      return <button className={`finish-card finish-${id}`} type="button" role="radio" key={id} aria-checked={selected}
        onClick={() => { if (!selected) set(patch); }}>
        <span className="finish-sample" aria-hidden="true">
          <span className={'finish-sample-bar' + (translucent(look) ? ' is-glass' : '')} style={sample}><b>9:41</b><i /><i /><i /></span>
        </span>
        <span className="finish-name">{t(`finish.${id}`)}</span>
        <span className="finish-hint">{t(`finish.${id}Hint`)}</span>
      </button>;
    })}
  </div>;
}
