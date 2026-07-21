/* Shared Windows-style surface materials for dock + notch.
   One finish drives both windows so the collapsed notch and expanded dock
   read as the same object changing shape.

   "tinted" is taskbar / Windhawk-style frosted glass: blur 18, user tint color,
   solidity from materialStrength (higher = more opaque, less see-through). */

export const SURFACE_STYLES = ["mica", "acrylic", "tinted", "solid"];

/** Preset glass fill colors (Appearance → Background). */
export const SURFACE_TINT_PRESETS = [
  ["Negro", "#000000"],
  ["Carbón", "#1c1c1c"],
  ["Gris", "#2d2d30"],
  ["Azul noche", "#0b1a2a"],
  ["Blanco", "#f3f3f3"],
];

/** Map legacy notchStyle values onto the unified surface. */
export function surfaceFromLegacyNotch(notchStyle) {
  switch (String(notchStyle || "").toLowerCase()) {
    case "mica":
      return "mica";
    case "acrylic":
    case "island":
      return "acrylic";
    case "liquid":
      return "tinted";
    case "windows":
      return "solid";
    default:
      return "acrylic";
  }
}

/** Resolve the active surface style from config (new or legacy keys). */
export function resolveSurfaceStyle(cfg) {
  const raw = cfg && cfg.surfaceStyle;
  if (raw && SURFACE_STYLES.includes(raw)) return raw;
  return surfaceFromLegacyNotch(cfg && cfg.notchStyle);
}

/** Closest legacy notchStyle for older readers / backups. */
export function legacyNotchFromSurface(surface) {
  switch (surface) {
    case "mica":
      return "mica";
    case "tinted":
      return "liquid";
    case "solid":
      return "windows";
    case "acrylic":
    default:
      return "acrylic";
  }
}

/**
 * Solidity 0–100 → fill alpha for the active surface.
 * Tinted starts much more opaque (taskbar-like); acrylic stays airier.
 */
export function surfaceAlpha(cfg) {
  const mat = Math.max(0, Math.min(1, (cfg?.materialStrength ?? 80) / 100));
  const surface = resolveSurfaceStyle(cfg);
  if (surface === "tinted") {
    // 0% → 0.62, 80% → ~0.90, 100% → 0.96
    return 0.62 + mat * 0.34;
  }
  if (surface === "mica") {
    return 0.72 + mat * 0.22;
  }
  if (surface === "solid") {
    return 1;
  }
  // acrylic — keep a readable band
  return Math.max(0.28, Math.min(0.92, 0.32 + mat * 0.58));
}

/** Resolve glass tint hex (empty config → black for tinted, theme tint otherwise). */
export function resolveGlassTint(cfg) {
  const custom = String(cfg?.surfaceTint || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(custom)) return custom.toLowerCase();
  if (resolveSurfaceStyle(cfg) === "tinted") return "#000000";
  return "";
}

const SURFACE_CLASSES = SURFACE_STYLES.map((s) => `surface-${s}`);
const LEGACY_NOTCH_CLASSES = [
  "style-island",
  "style-liquid",
  "style-mica",
  "style-acrylic",
  "style-windows",
];

/** Apply body.surface-* on dock or notch documents. */
export function applySurfaceClass(cfg, body = document.body) {
  const surface = resolveSurfaceStyle(cfg);
  for (const c of SURFACE_CLASSES) body.classList.remove(c);
  for (const c of LEGACY_NOTCH_CLASSES) body.classList.remove(c);
  body.classList.add(`surface-${surface}`);
  return surface;
}

/** Set --material / --glass-alpha / --glass-tint on html + body. */
export function applySurfaceVars(cfg, roots = [document.documentElement, document.body]) {
  const alpha = surfaceAlpha(cfg);
  const tint = resolveGlassTint(cfg);
  for (const el of [].concat(roots)) {
    if (!el?.style) continue;
    el.style.setProperty("--material", String(alpha));
    el.style.setProperty("--glass-alpha", String(alpha));
    if (tint) el.style.setProperty("--glass-tint", tint);
    else el.style.removeProperty("--glass-tint");
  }
  applySurfaceClass(cfg);
  return alpha;
}
