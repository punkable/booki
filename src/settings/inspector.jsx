import React, { useLayoutEffect, useRef } from 'react';
import { t } from '../i18n.js';
import { Icon } from './ui.jsx';

/** A shared, keyboard reachable detail surface with a return path on small windows. */
export function Inspector({ selectionKey, origin, onBack, className, children, dismissible = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!selectionKey) return;
    const panel = ref.current;
    if (!panel) return;
    panel.focus({ preventScroll: true });
    const scroller = panel.closest('.library-workspace') || panel.closest('.s-content');
    const bounds = panel.getBoundingClientRect();
    const viewport = scroller?.getBoundingClientRect();
    if (viewport && (bounds.top < viewport.top || bounds.top > viewport.bottom - 80)) {
      panel.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [selectionKey]);
  const back = () => {
    const target = origin?.current;
    onBack();
    if (target?.isConnected) { target.scrollIntoView({ block: 'nearest' }); target.focus({ preventScroll: true }); }
  };
  return <aside ref={ref} tabIndex={-1} className={`workspace-inspector ${className || ''}`}
    data-empty={!selectionKey} aria-label={t('next.inspector')}>
    {selectionKey && <button type="button" className={"s-btn s-btn-soft " + (dismissible ? "inspector-dismiss" : "inspector-back")} aria-label={dismissible ? t('stack.close') : undefined} title={dismissible ? t('stack.close') : undefined} onClick={back}><Icon name={dismissible ? "x" : "arrow-left"} />{!dismissible && t('stack.previous')}</button>}
    {children}
  </aside>;
}
