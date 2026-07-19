/* Shared Windows-style surface materials for dock + notch.
   One finish drives both windows so the collapsed notch and expanded dock
   read as the same object changing shape. */

export const SURFACE_STYLES = ["mica", "acrylic", "tinted", "solid"];

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
