import { useEffect, useState } from 'react';
import { invoke } from '../api.js';
import { observePlatformPreferences } from '../platform-preferences.js';
import { createLatestTask } from '../latest-task.js';
import { transparencyReduced } from '../surface.js';

/** Settings sits on Windows 11 Mica like the system Settings app, whatever
 *  finish the dock uses; the solid page background remains the fallback. */
export function NativeBackdrop({ cfg }) {
  const [preferences, setPreferences] = useState(null);
  useEffect(() => observePlatformPreferences(setPreferences), []);
  const enabled = cfg.nativeMaterial !== false && !transparencyReduced(cfg) && preferences?.systemBackdrop === true;
  const [worker] = useState(() => createLatestTask(
    ({ enabled, dark }) => invoke('settings_backdrop', { enabled, dark }),
    (applied, request) => document.body.classList.toggle('settings-mica', request.enabled && applied === true),
    () => document.body.classList.remove('settings-mica')
  ));
  useEffect(() => {
    const root = document.documentElement;
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    const request = () => {
      const theme = root.getAttribute('data-theme');
      worker.request({ enabled, dark: theme ? theme === 'dark' : systemTheme.matches });
    };
    // Theme changes can also come from the system or scheduled day/night
    // appearance, without changing the saved configuration.
    const observer = new MutationObserver(request);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    systemTheme.addEventListener('change', request); request();
    return () => { observer.disconnect(); systemTheme.removeEventListener('change', request); worker.request({ enabled: false, dark: systemTheme.matches }); };
  }, [enabled, cfg.theme, preferences, worker]);
  return null;
}
