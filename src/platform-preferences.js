import { dock, invoke } from './api.js';
let capabilities = null;
let pending = null;
let refreshQueued = false;
const subscribers = new Set();
let stop = null, watching = false, generation = 0;
export function platformSnapshot() { return capabilities; }
export function refreshPlatformPreferences() {
  if (pending) { refreshQueued = true; return pending; }
  pending = invoke('platform_capabilities').then(value => {
    if (!value || typeof value.transparency !== 'boolean') return;
    capabilities = value;
    document.documentElement.toggleAttribute('data-reduce-transparency', !value.transparency);
    document.documentElement.toggleAttribute('data-reduce-motion', value.animations === false);
    for (const subscriber of subscribers) subscriber(value);
  }).catch(() => {}).finally(() => {
    pending = null;
    if (refreshQueued) { refreshQueued = false; return refreshPlatformPreferences(); }
  });
  return pending;
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
