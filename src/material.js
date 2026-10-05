/* Native material: tells the backend which shapes of this window should sit
 * on Windows' real blur. CSS owns the tint and outline.
 *
 * The configured CSS fill remains in both paths; once the backend confirms
 * the blur, `body.native-material` disables the page-only CSS blur.
 * Reports are deduplicated, so callers can report from
 * every frame of an animation without flooding IPC.
 */
import { invoke, isTauri } from "./api.js";
import { resolveGlassTint, resolveSurfaceStyle, surfaceAlpha } from "./surface.js";

let lastSig = "";
let supported = null;
let generation = 0;
let retryAfter = 0;
let tint = "#161618b8";

/** `[x, y, w, h, radius]` in window CSS px for an element, or null if hidden. */
export function shapeOf(el, radius) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return null;
  const scale = Math.min(r.width / (el.offsetWidth || r.width), r.height / (el.offsetHeight || r.height));
  const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((value) => Math.round((radius ?? (parseFloat(value) || 0)) * scale));
  return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), ...radii];
}

/** Is the page currently dark (explicit theme or following the system)? */
export function isDark() {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) return theme === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Tint (`#RRGGBBAA`) for the current surface settings and theme. Same inputs
 * as the CSS fallback (surface.js). This also identifies appearance changes
 * in deduplicated reports; native blur does not add a second fill.
 */
export function materialTint(cfg, dark = isDark()) {
  const base = resolveGlassTint(cfg) || (dark ? "#161618" : "#f4f4f7");
  const alpha = Math.min(1, surfaceAlpha(cfg) * 0.8 + (resolveSurfaceStyle(cfg) === "solid" ? 1 : 0));
  return base + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

export function setMaterialTint(value) {
  if (value === tint) return;
  tint = value;
  generation++;
  retryAfter = 0;
  lastSig = "";
}

// Settings → Appearance can turn it off (config `nativeMaterial`).
let enabled = true;

/** Follow the setting; turning it off hides the material right away. */
export function setMaterialEnabled(on) {
  on = on !== false;
  if (on === enabled) return;
  enabled = on;
  retryAfter = 0;
  generation++;
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
  if (supported === false && Date.now() < retryAfter && shapes.some(Boolean)) return;
  const list = shapes.filter(Boolean);
  const sig = tint + JSON.stringify([devicePixelRatio, screenX, screenY, list]);
  if (sig === lastSig) return;
  lastSig = sig;
  const request = ++generation;
  invoke("set_material", { shapes: list, tint })
    .then((ok) => {
      if (request !== generation || !enabled) return;
      if (!ok) { lastSig = ""; retryAfter = Date.now() + 5000; }
      else retryAfter = 0;
      if (ok === supported) return;
      supported = !!ok;
      document.body.classList.toggle("native-material", supported);
    })
    .catch(() => {
      if (request !== generation) return;
      lastSig = ""; supported = false; retryAfter = Date.now() + 5000;
      document.body.classList.remove("native-material");
    });
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
