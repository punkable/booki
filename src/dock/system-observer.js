/** Notifications accelerate visible surfaces; polling remains a recovery path. */
export function observeSystem(dock, handlers, onSupport) {
  let disposed = false;
  const stops = [];
  let windowsTimer = null;
  const retain = (stop) => { if (disposed) stop(); else stops.push(stop); };
  const refreshSupport = () => dock.systemEventsSupport().then((support) => { if (!disposed) onSupport(support || {}); }).catch(() => {});
  for (const [kind, handler] of Object.entries(handlers)) dock.onSystemChange(kind, () => {
    if (disposed) return;
    // Window creation/title events can arrive in bursts. Query once per second.
    if (kind === 'windows') {
      if (!windowsTimer) windowsTimer = setTimeout(() => { windowsTimer = null; if (!disposed) handler(); }, 1000);
    } else handler();
  }).then(retain).catch(() => {});
  dock.onSystemChange('ready', refreshSupport).then(retain).catch(() => {});
  refreshSupport();
  return () => { disposed = true; clearTimeout(windowsTimer); for (const stop of stops) stop(); };
}
export function recoveryInterval(support, kind, fallback) { return support[kind] ? 30000 : fallback; }
