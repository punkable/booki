/* One material for the dock, the notch and their flyouts.

   Three finishes, each visibly different:
   - glass: Windows' real blur behind a translucent fill. `materialStrength`
     (0–100) moves it from clear to frosted; `surfaceTint` colours the fill
     (black gives the taskbar-style dark glass older builds called "tinted").
   - mica:  Windows 11 Mica. An opaque surface lightly tinted by the wallpaper,
     no blur, so it stays calm over busy windows.
   - solid: opaque, theme coloured, no effects.

   Older configs ("acrylic", "tinted", a notch-only `notchStyle`) are read as
   their closest finish; the backend migrates them on load (config rev 9). */

export const SURFACE_STYLES = ["glass", "mica", "solid"];

/** Preset fill colours for glass. Labels live in i18n (`tint.<id>`). */
export const SURFACE_TINT_PRESETS = [
  ["black", "#000000"],
  ["graphite", "#1c1c1c"],
  ["slate", "#2d2d30"],
  ["night", "#0b1a2a"],
  ["white", "#f3f3f3"],
];

const LEGACY_SURFACES = { acrylic: "glass", tinted: "glass", liquid: "glass", island: "glass", windows: "solid" };

/** Active finish, accepting every value older builds wrote. */
export function resolveSurfaceStyle(cfg) {
  const raw = String(cfg?.surfaceStyle || cfg?.notchStyle || "").toLowerCase();
  if (SURFACE_STYLES.includes(raw)) return raw;
  return LEGACY_SURFACES[raw] || "glass";
}

/** System accessibility preferences apply without rewriting the saved finish. */
export function transparencyReduced(cfg) {
  return !!cfg?.reduceTransparency
    || (typeof document !== "undefined" && document.documentElement.hasAttribute("data-reduce-transparency"))
    || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-transparency: reduce)").matches);
}

/** The finish actually painted: reduced transparency always paints solid. */
export function effectiveSurface(cfg) {
  return transparencyReduced(cfg) ? "solid" : resolveSurfaceStyle(cfg);
}

/** Only glass asks Windows for a native blur. */
export function nativeBlurWanted(cfg) {
  return cfg?.nativeMaterial !== false && effectiveSurface(cfg) === "glass";
}

/** Fill opacity. Glass follows the intensity slider; mica and solid are opaque. */
export function surfaceAlpha(cfg) {
  if (effectiveSurface(cfg) !== "glass") return 1;
  const strength = Math.max(0, Math.min(100, Number(cfg?.materialStrength ?? 60))) / 100;
  return Math.round((0.3 + strength * 0.62) * 100) / 100;
}

/** Custom glass colour, or "" to use the theme surface. Legacy "tinted" with no
 * colour meant black. */
export function resolveGlassTint(cfg) {
  const custom = String(cfg?.surfaceTint || "").trim();
  if (effectiveSurface(cfg) !== "glass") return "";
  if (/^#[0-9a-fA-F]{6}$/.test(custom)) return custom.toLowerCase();
  if (String(cfg?.surfaceStyle).toLowerCase() === "tinted") return "#000000";
  return "";
}

/** CSS colour for previews. */
export function glassFillColor(cfg) {
  return resolveGlassTint(cfg) || "var(--surface-tint)";
}

/** Ink that stays readable when a custom glass colour overrides the theme. */
export function surfaceForeground(cfg) {
  const tint = resolveGlassTint(cfg);
  if (!tint || surfaceAlpha(cfg) < 0.6) return "";
  const linear = [1, 3, 5].map((start) => {
    const value = parseInt(tint.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? "#1b1b1b" : "#f2f2f2";
}

let wallpaperTint = "";
/** Mica's wallpaper colour (`#rrggbb`), refreshed by the dock and notch. */
export function setWallpaperTint(hex, roots = [document.documentElement]) {
  wallpaperTint = /^#[0-9a-fA-F]{6}$/.test(hex || "") ? hex.toLowerCase() : "";
  for (const el of roots) {
    if (!el?.style) continue;
    if (wallpaperTint) el.style.setProperty("--wall-tint", wallpaperTint);
    else el.style.removeProperty("--wall-tint");
  }
}

/** body.surface-<finish> plus the variables every surface reads. */
export function applySurfaceVars(cfg, roots = [document.documentElement, document.body]) {
  const surface = effectiveSurface(cfg);
  const alpha = surfaceAlpha(cfg);
  const tint = resolveGlassTint(cfg);
  const ink = surfaceForeground(cfg);
  for (const el of [].concat(roots)) {
    if (!el?.style) continue;
    el.style.setProperty("--glass-alpha", String(alpha));
    if (tint) el.style.setProperty("--glass-tint", tint);
    else el.style.removeProperty("--glass-tint");
    if (ink) el.style.setProperty("--surface-ink", ink);
    else el.style.removeProperty("--surface-ink");
  }
  const body = document.body;
  for (const s of SURFACE_STYLES) body.classList.remove(`surface-${s}`);
  body.classList.add(`surface-${surface}`);
  body.classList.toggle("reduce-transparency", transparencyReduced(cfg));
  // A custom fill can force the opposite ink of the theme; widget plates
  // follow the ink, not the theme (see widgets.css).
  if (ink) body.dataset.ink = ink === "#1b1b1b" ? "dark" : "light";
  else delete body.dataset.ink;
  return alpha;
}

/** Shared bar radius: the tile rounding plus the bar's 8px inset. */
export function dockRadius(cfg) {
  const radius = Number(cfg?.cornerRadius ?? 12);
  return Math.max(0, Number.isFinite(radius) ? radius : 12) + 8;
}

/* Finish presets only change the material, never layout or theme. */
export const FINISH_PRESETS = [
  { id: "glass", patch: { surfaceStyle: "glass", surfaceTint: "", materialStrength: 45 } },
  { id: "darkGlass", patch: { surfaceStyle: "glass", surfaceTint: "#000000", materialStrength: 70 } },
  { id: "mica", patch: { surfaceStyle: "mica", surfaceTint: "" } },
  { id: "solid", patch: { surfaceStyle: "solid", surfaceTint: "" } },
];

/** Which preset a config matches, for the picker's selected state. */
export function activeFinish(cfg) {
  const surface = resolveSurfaceStyle(cfg);
  if (surface !== "glass") return surface;
  return resolveGlassTint(cfg) === "#000000" ? "darkGlass" : "glass";
}
