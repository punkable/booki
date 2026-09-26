/* Native material: tells the backend which shapes of this window should sit
 * on Windows' real blurred acrylic, and with what tint.
 *
 * The CSS surfaces keep a translucent fallback fill; once the backend confirms
 * it drew the material, `body.native-material` switches them to a thin film
 * over the real blur. Reports are deduplicated, so callers can report from
 * every frame of an animation without flooding IPC.
 */
import { invoke, isTauri } from "./api.js";
import { resolveGlassTint, resolveSurfaceStyle, surfaceAlpha } from "./surface.js";

let lastSig = "";
let supported = null;
let tint = "#161618b8";

/** `[x, y, w, h, radius]` in window CSS px for an element, or null if hidden. */
export function shapeOf(el, radius) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return null;
  const rad = radius ?? (parseFloat(cs.borderTopLeftRadius) || 0);
  return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), Math.round(rad)];
}

/** Is the page currently dark (explicit theme or following the system)? */
export function isDark() {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) return theme === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Tint (`#RRGGBBAA`) for the current surface settings and theme. Same inputs
 * as the CSS fallback (surface.js), but lighter: the real blur behind it does
 * part of the work a flat fill had to do alone.
 */
export function materialTint(cfg, dark = isDark()) {
  const base = resolveGlassTint(cfg) || (dark ? "#161618" : "#f4f4f7");
  const alpha = Math.min(1, surfaceAlpha(cfg) * 0.8 + (resolveSurfaceStyle(cfg) === "solid" ? 1 : 0));
  return base + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

export function setMaterialTint(value) {
  if (value === tint) return;
  tint = value;
  lastSig = "";
}

// Settings → Appearance can turn it off (config `nativeMaterial`).
let enabled = true;

/** Follow the setting; turning it off hides the material right away. */
export function setMaterialEnabled(on) {
  on = on !== false;
  if (on === enabled) return;
  enabled = on;
  lastSig = "";
  if (!on) {
    if (isTauri) invoke("set_material", { shapes: [], tint }).catch(() => {});
    supported = false;
    document.body.classList.remove("native-material");
  }
}

/** Report the shapes (empty = hide). */
export function reportMaterial(shapes) {
  if (!isTauri || !enabled) return;
  const list = shapes.filter(Boolean);
  const sig = tint + JSON.stringify(list);
  if (sig === lastSig) return;
  lastSig = sig;
  invoke("set_material", { shapes: list, tint })
    .then((ok) => {
      if (ok === supported) return;
      supported = !!ok;
      document.body.classList.toggle("native-material", supported);
    })
    .catch(() => {});
}

/** Keep reporting every frame for `ms` (a CSS transition is moving a surface). */
export function followFrames(report, ms = 460) {
  const end = performance.now() + ms;
  const step = () => {
    report();
    if (performance.now() < end) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
