/* One material for the dock, the notch and their flyouts.

   Three styles, each visibly different:
   - taskbar: the Windows 11 taskbar. Its colour comes from Windows
     (look-model.js) and it stays nearly opaque, like the bar itself.
   - glass:   a light frost. Windows blurs what is behind and the fill stays
     thin, so the wallpaper shows through. `materialStrength` (0–100) only
     moves it within that thin range.
   - solid:   opaque, no effects.
   A saved "clear" finish is glass: it was the same gray as glass, only thinner.

   Older configs ("acrylic", "tinted", "mica", a notch-only `notchStyle`) are
   read as their closest style; the backend migrates them on load (config
   rev 11). */

export const SURFACE_STYLES = ["taskbar", "glass", "solid"];

/** Preset fill colours. Labels live in i18n (`tint.<id>`). */
export const SURFACE_TINT_PRESETS = [
  ["black", "#000000"],
  ["graphite", "#1c1c1c"],
  ["slate", "#2d2d30"],
  ["night", "#0b1a2a"],
  ["white", "#f3f3f3"],
  // Deep Mocha Mousse and Cloud Dancer, from the suggested palette.
  ["mocha", "#2b211c"],
  ["cloud", "#f0eee9"],
];

const LEGACY_SURFACES = { acrylic: "glass", tinted: "glass", liquid: "glass", island: "glass", clear: "glass", windows: "solid", mica: "solid" };
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Active style, accepting every value older builds wrote. */
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

/** The style actually painted: reduced transparency always paints solid. */
export function effectiveSurface(cfg) {
  return transparencyReduced(cfg) ? "solid" : resolveSurfaceStyle(cfg);
}

/** Every style but solid sits on Windows' blur. */
export function translucent(cfg) {
  return effectiveSurface(cfg) !== "solid";
}

/** Only the translucent styles ask Windows for a native blur. */
export function nativeBlurWanted(cfg) {
  return cfg?.nativeMaterial !== false && translucent(cfg);
}

/** Fill opacity over the blur. Glass follows the opacity slider, the
 * taskbar style matches the taskbar, clear lets the blur show; solid is
 * opaque. */
export function surfaceAlpha(cfg) {
  const style = effectiveSurface(cfg);
  if (style === "solid") return 1;
  if (style === "taskbar") return 0.82;
  // Glass is Windows 11 acrylic: a tint dense enough that text stays legible
  // over any wallpaper (the system flyouts sit around 0.6-0.8), and at the
  // default strength still thinner than the taskbar style.
  const strength = Math.max(0, Math.min(100, Number(cfg?.materialStrength ?? 60))) / 100;
  return Math.round((0.42 + strength * 0.4) * 100) / 100;
}

/** Menus and flyouts carry text, so they never get thinner than this. */
export function panelAlpha(cfg) {
  return Math.round(Math.min(1, Math.max(0.78, surfaceAlpha(cfg) + 0.18)) * 100) / 100;
}

/** Fill colour (`#rrggbb`), or "" for the theme surface. A painted look
 * (look-model.js) carries it in `glassTint`; a raw config only knows a
 * colour picked by hand. */
export function resolveGlassTint(cfg) {
  if (cfg && "glassTint" in cfg) return HEX.test(cfg.glassTint || "") ? cfg.glassTint.toLowerCase() : "";
  const picked = String(cfg?.surfaceColor || cfg?.surfaceTint || "").trim();
  return HEX.test(picked) ? picked.toLowerCase() : "";
}

/** CSS colour for previews. */
export function glassFillColor(cfg) {
  return resolveGlassTint(cfg) || "var(--surface-tint)";
}

/** Ink that stays readable when the fill colour overrides the theme. */
export function surfaceForeground(cfg) {
  if (surfaceAlpha(cfg) < 0.6) return "";
  return panelForeground(cfg);
}

/** Flyouts have a denser tint than the bar, including thin glass. */
export function panelForeground(cfg) {
  const tint = resolveGlassTint(cfg);
  if (!tint) return "";
  const linear = [1, 3, 5].map((start) => {
    const value = parseInt(tint.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? "#1b1b1b" : "#f2f2f2";
}

/** body.surface-glass (translucent) or body.surface-solid, body.look-<style>,
 * and the variables every surface reads. */
export function applySurfaceVars(cfg, roots = [document.documentElement, document.body]) {
  const style = effectiveSurface(cfg);
  const alpha = surfaceAlpha(cfg);
  const tint = resolveGlassTint(cfg);
  const ink = surfaceForeground(cfg);
  for (const el of [].concat(roots)) {
    if (!el?.style) continue;
    el.style.setProperty("--glass-alpha", String(alpha));
    el.style.setProperty("--panel-alpha", String(panelAlpha(cfg)));
    if (tint) el.style.setProperty("--glass-tint", tint);
    else el.style.removeProperty("--glass-tint");
    if (ink) el.style.setProperty("--surface-ink", ink);
    else el.style.removeProperty("--surface-ink");
    const panelInk = panelForeground(cfg);
    if (panelInk) {
      el.style.setProperty("--panel-ink", panelInk);
      el.style.setProperty("--panel-color-scheme", panelInk === "#1b1b1b" ? "light" : "dark");
    } else {
      el.style.removeProperty("--panel-ink");
      el.style.removeProperty("--panel-color-scheme");
    }
  }
  const body = document.body;
  body.classList.toggle("surface-glass", style !== "solid");
  body.classList.toggle("surface-solid", style === "solid");
  for (const s of SURFACE_STYLES) body.classList.toggle(`look-${s}`, s === style);
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

/* One patch per style; a style never changes layout or theme. */
export const FINISH_PRESETS = SURFACE_STYLES.map((id) => ({ id, patch: { surfaceStyle: id } }));

/** Which style a config uses, for the picker's selected state. */
export function activeFinish(cfg) {
  return resolveSurfaceStyle(cfg);
}
