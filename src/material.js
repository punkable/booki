/* Native material: tells the backend which shapes of this window should sit
 * on Windows' real blur. CSS owns the tint and outline.
 *
 * The configured CSS fill remains in both paths; once the backend confirms
 * the blur, `body.native-material` disables the page-only CSS blur.
 * Reports are deduplicated, so callers can report from
 * every frame of an animation without flooding IPC.
 */
import { physicalMaterialShapes, containedShape } from "./material-geometry.js";
import { invoke, isTauri } from "./api.js";
import { applySurfaceVars, nativeBlurWanted, resolveGlassTint, surfaceAlpha } from "./surface.js";

let lastSig = "";
let generation = 0;
let retryAfter = 0;
let retryTimer = null;
let inFlight = false;
let desired = null;
let tint = "#2c2c2cb8";
let enabled = true;

/** Four CSS corner radii, in window CSS pixels, or null when native blur
 * cannot follow the surface faithfully. The CSS fill is always retained. */
export function shapeOf(el, radius) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.999) return null;
  // A native blur cannot fade, clip or filter with the WebView, so a surface
  // animating those waits until it settles. Size, radius, translation and
  // uniform scale are measured per frame below and followed instead: hiding
  // the blur for every hover or resize is what made a sheet blink in and out.
  const geometryKeys = ["rotate", "opacity", "filter"];
  if (el.getAnimations().some((animation) => animation.playState === "running" &&
    animation.effect?.getKeyframes().some((frame) => geometryKeys.some((key) => key in frame)))) return null;
  const matrix = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
  if (!matrix.is2D || Math.abs(matrix.b) > 0.001 || Math.abs(matrix.c) > 0.001 || Math.abs(matrix.a - matrix.d) > 0.001) return null;
  const scale = r.width / (parseFloat(cs.width) || r.width);
  const scaleY = r.height / (parseFloat(cs.height) || r.height);
  if (Math.abs(scale - scaleY) > 0.01) return null;
  const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((value) => {
    if (radius != null) return Math.max(0, radius) * scale;
    const parts = value.trim().split(/\s+/);
    const resolve = (part, extent) => part.endsWith("%") ? parseFloat(part) * extent / 100 : parseFloat(part) * scale;
    const x = resolve(parts[0], r.width);
    const y = resolve(parts[1] || parts[0], r.height);
    return Math.abs(x - y) < 0.01 ? Math.max(0, x) : NaN;
  });
  if (radii.some((value) => !Number.isFinite(value))) return null;
  // The notch-to-dock morph is a rounded inset clip. Follow it frame by frame
  // so the blur grows with the shape instead of vanishing until it settles.
  if (cs.clipPath && cs.clipPath !== "none") {
    const clip = /^inset\(([^)]*?)(?:\s+round\s+([^)]*))?\)$/.exec(cs.clipPath.trim());
    if (!clip) return null;
    const px = (part) => (part.endsWith("px") || part === "0" ? parseFloat(part) * scale : NaN);
    const sides = clip[1].trim().split(/\s+/).map(px);
    const [t, rr = t, b = t, l = rr] = sides;
    const corner = clip[2] ? px(clip[2].trim().split(/\s+/)[0]) : 0;
    if (![t, rr, b, l, corner].every(Number.isFinite)) return null;
    const [ct, cr, cb, cl] = [t, rr, b, l].map((v) => Math.max(0, v));
    if (ct || cr || cb || cl) {
      const w = r.width - cl - cr, h = r.height - ct - cb;
      if (w < 1 || h < 1) return null;
      const round = Math.min(Math.max(0, corner), w / 2, h / 2);
      return [r.left + cl, r.top + ct, w, h, round, round, round, round];
    }
  }
  // Preserve subpixels until the native side rounds physical edges at the
  // current DPI. Rounding CSS first can move corners by several pixels.
  return [r.left, r.top, r.width, r.height, ...radii];
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
  const base = resolveGlassTint(cfg) || (dark ? "#2c2c2c" : "#f4f4f7");
  const alpha = surfaceAlpha(cfg);
  return base + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

export function setMaterialTint(value) {
  if (value === tint) return;
  tint = value;
  generation++;
  retryAfter = 0;
  lastSig = "";
}

/** Follow the setting; queue the hide after any in-flight application so a
 * late native command cannot bring an obsolete surface back. */
export function setMaterialEnabled(on) {
  on = on !== false;
  if (on === enabled) return;
  enabled = on;
  retryAfter = 0;
  generation++;
  lastSig = "";
  document.body.classList.remove("native-material");
  reportMaterial([]);
}

function pumpMaterial() {
  if (inFlight || !desired || desired.sig === lastSig) return;
  clearTimeout(retryTimer);
  if (desired.list.length && Date.now() < retryAfter) {
    retryTimer = setTimeout(pumpMaterial, retryAfter - Date.now());
    return;
  }
  const { list, sig, revision, color } = desired;
  lastSig = sig;
  inFlight = true;
  invoke("set_material", { shapes: list, tint: color })
    .then((ok) => {
      if (revision !== generation) return;
      // An empty report while enabled is a surface in motion or away for a
      // moment: keep the CSS in native mode so its fallback blur does not
      // flash in and out between frames.
      if (!enabled || (!ok && list.length)) document.body.classList.remove("native-material");
      else if (list.length) document.body.classList.add("native-material");
      if (!ok && list.length) {
        lastSig = "";
        retryAfter = Date.now() + 5000;
      } else retryAfter = 0;
    })
    .catch(() => {
      if (revision !== generation) return;
      if (list.length) lastSig = "";
      retryAfter = Date.now() + 5000;
      document.body.classList.remove("native-material");
    })
    .finally(() => {
      inFlight = false;
      pumpMaterial();
    });
}

/** Coalesce reports to the latest geometry with at most one IPC in flight. */
export function reportMaterial(shapes) {
  if (!isTauri) return;
  const list = enabled && document.visibilityState !== "hidden" ? shapes.filter(Boolean).map(containedShape).filter(Boolean) : [];
  const sig = tint + JSON.stringify([devicePixelRatio, screenX, screenY, physicalMaterialShapes(list, devicePixelRatio)]);
  if (desired?.sig !== sig) desired = { list, sig, revision: ++generation, color: tint };
  else if (desired.revision !== generation) desired = { ...desired, revision: generation, color: tint };
  pumpMaterial();
}

document.addEventListener("visibilitychange", () => {
  lastSig = "";
  retryAfter = 0;
  reportMaterial(document.visibilityState === "hidden" ? [] : desired?.list || []);
});

/** Keep reporting every frame for `ms` (a CSS transition is moving a surface). */
const followers = new Map();
export function followFrames(report, ms = 460) {
  const end = performance.now() + ms;
  if (followers.has(report)) {
    followers.set(report, Math.max(followers.get(report), end));
    return;
  }
  followers.set(report, end);
  const step = () => {
    report();
    if (performance.now() < followers.get(report)) requestAnimationFrame(step);
    else followers.delete(report);
  };
  requestAnimationFrame(step);
}

/** Apply a config's style to this window: CSS variables and the native
 * blur under the translucent styles. One entry point for the dock, the notch
 * and theme changes. */
export function applyMaterial(cfg) {
  applySurfaceVars(cfg);
  setMaterialTint(materialTint(cfg));
  setMaterialEnabled(nativeBlurWanted(cfg));
}
