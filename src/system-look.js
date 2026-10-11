/* Applies the rules in look-model.js with what Windows reports right now.
   `paintedLook` turns a config into the one actually painted, so the dock,
   the notch and Settings all read their colours from one place. */
import { invoke, isTauri } from "./api.js";
import { observePlatformPreferences, platformSnapshot } from "./platform-preferences.js";
import { colorSource, resolveLook, surfaceColor } from "./look-model.js";

export { COLOR_SOURCES, SURFACE_COLORS, colorSource, surfaceColor } from "./look-model.js";
const HEX = /^#[0-9a-f]{6}$/i;

let wallpaper = "";
let wallpaperAsked = 0;
let wallpaperPending = false;
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(); };

function needsWallpaper(cfg) {
  const source = colorSource(cfg);
  return source === "wallpaper" || surfaceColor(cfg) === "wallpaper" || (source === "windows" && !platformSnapshot()?.accent);
}

/** Sample the wallpaper again (at most once a minute unless forced). */
function refreshWallpaper(force = false) {
  if (!isTauri || wallpaperPending || (!force && Date.now() - wallpaperAsked < 60000)) return;
  wallpaperAsked = Date.now();
  wallpaperPending = true;
  invoke("wallpaper_accent")
    .then((hex) => {
      const next = HEX.test(hex || "") ? hex.toLowerCase() : "";
      if (next !== wallpaper) {
        wallpaper = next;
        notify();
      }
    })
    .catch(() => {})
    .finally(() => { wallpaperPending = false; });
}

export function paintedLook(cfg) {
  if (needsWallpaper(cfg)) refreshWallpaper();
  return resolveLook(cfg, {
    platform: platformSnapshot(),
    wallpaper,
    systemDark: matchMedia("(prefers-color-scheme: dark)").matches,
  });
}

/** Run `callback` whenever the painted colours may have changed: the
 * accent, the Windows mode, the taskbar setting or the wallpaper. A new
 * wallpaper reaches us as a settings change, so it samples again then. */
export function onLookChange(callback) {
  listeners.add(callback);
  const stop = observePlatformPreferences(() => {
    if (wallpaperAsked) refreshWallpaper(true);
    callback();
  });
  return () => { listeners.delete(callback); stop(); };
}
