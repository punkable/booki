/* What the dock and the notch paint, as pure rules (no Tauri, no DOM), so
   they are unit-tested in tests/colors-and-groups.test.mjs.

   Three separate choices, each with one job:
   - the style (`surfaceStyle`): "taskbar" looks like the Windows taskbar,
     "glass" is tinted acrylic, "clear" is barely tinted acrylic, "solid" is
     opaque;
   - the fill (`surfaceColor`): "auto" (the style's own neutral), "wallpaper",
     "accent" or a colour picked by hand. The taskbar style ignores it and
     takes the taskbar's colour, as Windows paints it;
   - the accent (`colorSource`): Windows' accent, the wallpaper's colour or
     one picked by hand. It colours indicators and selection, never the fill. */
import { hexToRgb, rgbToHex } from "./util-color.js";
import { resolveSurfaceStyle } from "./surface.js";

export const COLOR_SOURCES = ["windows", "wallpaper", "custom"];
export const SURFACE_COLORS = ["auto", "wallpaper", "accent"];
const HEX = /^#[0-9a-f]{6}$/i;
// The Windows 11 taskbar's own fills in dark and light mode.
export const TASKBAR_DARK = "#202020";
export const TASKBAR_LIGHT = "#eeeeee";
// Neutral acrylic tints (the "auto" fill) for the glass styles.
const GLASS_AUTO = { dark: "#1c1c1c", light: "#f3f3f3" };
const CLEAR_AUTO = { dark: "#0a0a0a", light: "#ffffff" };

export function colorSource(cfg) {
  return COLOR_SOURCES.includes(cfg?.colorSource) ? cfg.colorSource : "custom";
}

/** The fill choice. Configs saved before `surfaceColor` existed carry a
 * hand-picked glass colour in `surfaceTint`. */
export function surfaceColor(cfg) {
  const value = String(cfg?.surfaceColor ?? "").trim().toLowerCase();
  if (SURFACE_COLORS.includes(value) || HEX.test(value)) return value;
  const legacy = String(cfg?.surfaceTint ?? "").trim().toLowerCase();
  return HEX.test(legacy) ? legacy : "auto";
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

/** The taskbar's fill: Windows paints it dark or light like its mode, and
 * with a deep shade of the accent when "show accent on taskbar" is on (dark
 * mode only, as in Windows). */
export function taskbarFill(dark, platform) {
  const accent = HEX.test(platform?.accent || "") ? platform.accent.toLowerCase() : "";
  if (!dark) return TASKBAR_LIGHT;
  return platform?.accentOnTaskbar && accent ? mixHex(accent, "#000000", 0.45) : TASKBAR_DARK;
}

/** Pure: a config, what Windows reports and the wallpaper colour → the
 * config to paint, with `glassTint` (the fill colour, "" for the theme's)
 * and the canonical `surfaceStyle`. */
export function resolveLook(cfg, { platform = null, wallpaper = "", systemDark = false } = {}) {
  if (!cfg) return cfg;
  const source = colorSource(cfg);
  const style = resolveSurfaceStyle(cfg);
  const windowsAccent = HEX.test(platform?.accent || "") ? platform.accent.toLowerCase() : "";
  const wall = HEX.test(wallpaper || "") ? wallpaper.toLowerCase() : "";
  const accent = source === "windows" ? windowsAccent || wall || cfg.accent
    : source === "wallpaper" ? wall || windowsAccent || cfg.accent
    : cfg.accent;
  // The taskbar style sits where the taskbar does, so it follows the Windows
  // mode (taskbar, Start), not the app mode, when the theme is left to the
  // system.
  const theme = style === "taskbar" && (cfg.theme || "system") === "system" && platform
    ? (platform.systemLight ? "light" : "dark")
    : cfg.theme;
  const dark = themeIsDark(theme || "system", systemDark);
  const tone = dark ? "dark" : "light";
  let glassTint = "";
  if (style === "taskbar") glassTint = taskbarFill(dark, platform);
  else {
    const fill = surfaceColor(cfg);
    if (HEX.test(fill)) glassTint = fill;
    else if (fill === "wallpaper" && wall) glassTint = dark ? mixHex(wall, "#000000", 0.6) : mixHex(wall, "#ffffff", 0.72);
    else if (fill === "accent" && HEX.test(accent || "")) glassTint = dark ? mixHex(accent, "#000000", 0.55) : mixHex(accent, "#ffffff", 0.7);
    else if (style === "glass") glassTint = GLASS_AUTO[tone];
    else if (style === "clear") glassTint = CLEAR_AUTO[tone];
  }
  return { ...cfg, accent, theme, surfaceStyle: style, glassTint };
}
