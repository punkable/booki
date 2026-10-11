import { dock, invoke } from './api.js';
let capabilities = null;
let pending = null;
let refreshQueued = false;
const subscribers = new Set();
let stop = null, watching = false, generation = 0;
export function platformSnapshot() { return capabilities; }
function refreshPlatformPreferences() {
  if (pending) { refreshQueued = true; return pending; }
  pending = invoke('platform_capabilities').then(value => {
    if (!value || typeof value.transparency !== 'boolean') return;
    capabilities = value;
    document.documentElement.toggleAttribute('data-reduce-transparency', !value.transparency);
    document.documentElement.toggleAttribute('data-reduce-motion', value.animations === false);
    // Windows reports high contrast separately; the backend also folds it into
    // `transparency`, but CSS needs to know it is a contrast theme, not just less glass.
    // forced-colors covers WebView2; this is the fallback when it does not match.
    document.documentElement.toggleAttribute('data-high-contrast', value.highContrast === true);
    applyTextScale(value.textScale);
    for (const subscriber of subscribers) subscriber(value);
  }).catch(() => {}).finally(() => {
    pending = null;
    if (refreshQueued) { refreshQueued = false; return refreshPlatformPreferences(); }
  });
  return pending;
}
/** Windows Accessibility > Text size (100–225 %) as `--os-text-scale` on the
 *  root. Only Settings' stylesheet reads it; the dock keeps its own sizes. */
export function applyTextScale(percent) {
  const scale = Math.min(2.25, Math.max(1, Number(percent) / 100 || 1));
  document.documentElement.style.setProperty('--os-text-scale', String(scale));
}
export function observePlatformPreferences(callback) {
  subscribers.add(callback);
  if (!watching) {
    watching = true; const ticket = ++generation;
    dock.onSystemChange('preferences', refreshPlatformPreferences).then(unlisten => { if (!watching || ticket !== generation) unlisten(); else stop = unlisten; }).catch(() => {});
    refreshPlatformPreferences();
  }
  if (capabilities) callback(capabilities);
  return () => { subscribers.delete(callback); if (!subscribers.size) { watching = false; generation++; stop?.(); stop = null; } };
}
