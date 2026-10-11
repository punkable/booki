/* Where Booki's colours come from, as pure rules (no Tauri, no DOM), so
   they are unit-tested in tests/colors-and-groups.test.mjs.

   "custom" paints the accent and glass colour picked in Settings.
   "windows" follows Windows: its accent colour (which Windows itself takes
   from the wallpaper when the accent is set to Automatic), and the taskbar's
   look for the glass: dark or light like the Windows mode, tinted with the
   accent when Windows shows the accent on the taskbar.
   "wallpaper" samples the wallpaper and tints the glass with it. */
import { hexToRgb, rgbToHex } from "./util-color.js";

export const COLOR_SOURCES = ["windows", "wallpaper", "custom"];
const HEX = /^#[0-9a-f]{6}$/i;

export function colorSource(cfg) {
  return COLOR_SOURCES.includes(cfg?.colorSource) ? cfg.colorSource : "custom";
}

/** `a` moved toward `b` by `amount` (0–1). */
export function mixHex(a, b, amount) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const at = (p, q) => p + (q - p) * amount;
  return rgbToHex({ r: at(x.r, y.r), g: at(x.g, y.g), b: at(x.b, y.b) });
}

function themeIsDark(theme, systemDark) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (theme === "auto") {
    const hour = new Date().getHours();
    return hour < 7 || hour >= 19;
  }
  return systemDark;
}

/** Pure: a config, what Windows reports and the wallpaper colour → the
 * config to paint. A glass colour the user picked always wins. */
export function resolveLook(cfg, { platform = null, wallpaper = "", systemDark = false } = {}) {
  const source = colorSource(cfg);
  if (!cfg || source === "custom") return cfg;
  const windowsAccent = HEX.test(platform?.accent || "") ? platform.accent.toLowerCase() : "";
  const wall = HEX.test(wallpaper || "") ? wallpaper.toLowerCase() : "";
  const accent = (source === "windows" ? windowsAccent || wall : wall || windowsAccent) || cfg.accent;
  // The dock sits where the taskbar does, so it follows the Windows mode
  // (taskbar, Start), not the app mode, when the theme is left to the system.
  const theme = source === "windows" && (cfg.theme || "system") === "system" && platform
    ? (platform.systemLight ? "light" : "dark")
    : cfg.theme;
  let surfaceTint = cfg.surfaceTint;
  if (!HEX.test(String(cfg.surfaceTint || ""))) {
    const dark = themeIsDark(theme || "system", systemDark);
    if (source === "windows" && platform?.accentOnTaskbar && windowsAccent) {
      // Windows paints an accent taskbar with a deep shade of the accent.
      surfaceTint = mixHex(windowsAccent, "#000000", 0.45);
    } else if (source === "wallpaper" && wall) {
      surfaceTint = dark ? mixHex(wall, "#000000", 0.6) : mixHex(wall, "#ffffff", 0.72);
    }
  }
  return { ...cfg, accent, theme, surfaceTint };
}
