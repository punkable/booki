/* Shared Windows-style surface materials for dock + notch.
   One finish drives both windows so the collapsed notch and expanded dock
   read as the same object changing shape.

   Glass fill color (`surfaceTint` → `--glass-tint`) applies to mica, acrylic,
   and tinted in both light and dark themes. Empty tint falls back to the
   theme's `--surface-tint` (except tinted, which defaults to black).

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

/** Resolve glass tint hex.
 * Custom `surfaceTint` always wins (mica / acrylic / tinted, any UI theme).
 * Empty → black for tinted; otherwise leave unset so CSS uses theme --surface-tint. */
export function resolveGlassTint(cfg) {
  const custom = String(cfg?.surfaceTint || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(custom)) return custom.toLowerCase();
  if (resolveSurfaceStyle(cfg) === "tinted") return "#000000";
  return "";
}

/** CSS color for previews: custom/tinted hex, else theme surface token. */
export function glassFillColor(cfg) {
  return resolveGlassTint(cfg) || "var(--surface-tint)";
}

/** Keep text readable when a sufficiently opaque custom fill overrides theme. */
export function surfaceForeground(cfg) {
  const tint = resolveGlassTint(cfg);
  if (!tint || (!transparencyReduced(cfg) && surfaceAlpha(cfg) < 0.6)) return "";
  const linear = [1, 3, 5].map((start) => {
    const value = parseInt(tint.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? "#1b1b1b" : "#f2f2f2";
}

const SURFACE_CLASSES = SURFACE_STYLES.map((s) => `surface-${s}`);
const LEGACY_NOTCH_CLASSES = [
  "style-island",
  "style-liquid",
  "style-mica",
  "style-acrylic",
  "style-windows",
];

/** System accessibility preferences apply without rewriting the saved finish. */
export function transparencyReduced(cfg) {
  return !!cfg?.reduceTransparency || (typeof document !== "undefined" && document.documentElement.hasAttribute("data-reduce-transparency")) || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-transparency: reduce)").matches);
}

/** Apply body.surface-* on dock or notch documents. */
export function applySurfaceClass(cfg, body = document.body) {
  const surface = transparencyReduced(cfg) ? "solid" : resolveSurfaceStyle(cfg);
  body.classList.toggle("reduce-transparency", transparencyReduced(cfg));
  for (const c of SURFACE_CLASSES) body.classList.remove(c);
  for (const c of LEGACY_NOTCH_CLASSES) body.classList.remove(c);
  body.classList.add(`surface-${surface}`);
  return surface;
}

/** Set --material / --glass-alpha / --glass-tint on html + body. */
export function applySurfaceVars(cfg, roots = [document.documentElement, document.body]) {
  const alpha = transparencyReduced(cfg) ? 1 : surfaceAlpha(cfg);
  const tint = resolveGlassTint(cfg);
  const foreground = surfaceForeground(cfg);
  for (const el of [].concat(roots)) {
    if (!el?.style) continue;
    el.style.setProperty("--material", String(alpha));
    el.style.setProperty("--glass-alpha", String(alpha));
    if (tint) el.style.setProperty("--glass-tint", tint);
    else el.style.removeProperty("--glass-tint");
    if (foreground) el.style.setProperty("--surface-ink", foreground);
    else el.style.removeProperty("--surface-ink");
  }
  applySurfaceClass(cfg);
  return alpha;
}

/** Shared bar radius. Keep legacy tile rounding and the bar's 8px inset. */
export function dockRadius(cfg) {
  const radius = Number(cfg?.cornerRadius ?? 12);
  return Math.max(0, Number.isFinite(radius) ? radius : 12) + 8;
}

/* Material presets only change the material, never layout or theme. */
export const FINISH_PRESETS = [
  { id: 'air', patch: { surfaceStyle: 'acrylic', surfaceTint: '', materialStrength: 38 } },
  { id: 'mica', patch: { surfaceStyle: 'mica', surfaceTint: '', materialStrength: 65 } },
  { id: 'tinted', patch: { surfaceStyle: 'tinted', surfaceTint: '', materialStrength: 45 } },
  { id: 'solid', patch: { surfaceStyle: 'solid', surfaceTint: '', materialStrength: 100 } },
];
