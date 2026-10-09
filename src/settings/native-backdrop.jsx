import { useEffect, useState } from 'react';
import { invoke } from '../api.js';
import { observePlatformPreferences } from '../platform-preferences.js';
import { createLatestTask } from '../latest-task.js';
import { resolveSurfaceStyle, transparencyReduced } from '../surface.js';

/** Turn on the native backdrop after the page can paint; solid remains the fallback. */
export function NativeBackdrop({ cfg }) {
  const [preferences, setPreferences] = useState(null);
  useEffect(() => observePlatformPreferences(setPreferences), []);
  const enabled = resolveSurfaceStyle(cfg) === 'mica' && cfg.nativeMaterial !== false && !transparencyReduced(cfg) && preferences?.systemBackdrop === true;
  const [worker] = useState(() => createLatestTask(
    ({ enabled, dark }) => invoke('settings_backdrop', { enabled, dark }),
    (applied, request) => document.body.classList.toggle('settings-mica', request.enabled && applied === true),
    () => document.body.classList.remove('settings-mica')
  ));
  useEffect(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    worker.request({ enabled, dark });
    return () => worker.request({ enabled: false, dark });
  }, [enabled, cfg.theme, preferences, worker]);
  return null;
}
