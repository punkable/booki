/* Magnify on hover, tile sizing, and edge auto-scroll for an overflowing bar. */

import { widgetWidth } from "./layout-model.js";
import { reduceMotion } from "./motion.js";
import { S } from "./state.js";
import { isVertical, baseSize, findWidgetPin } from "./helpers.js";
import { dockEl } from "./dom.js";
import { reportHitRectsLive, reportHitRects, scheduleHitReport } from "./hit-regions.js";

// ──────────────────────── Magnify on hover ────────────────────────

export function setAllSizes(size) {
  dockEl.querySelectorAll(".tile").forEach((t) => {
    const isSep = t.classList.contains("separator");
    t.style.setProperty("--size", `${isSep ? Math.round(size * 0.5) : size}px`);
    if (t.dataset.widget) t.style.setProperty("--widget-width", `${widgetWidth(t.dataset.widget, size, S.cfg.spacing ?? 6, findWidgetPin(t.dataset.id)?.style || {})}px`);
    t.style.transform = "";
    t.style.zIndex = "";
    t.classList.remove("focus");
  });
}

export function resetMagnify() {
  // The wave springs back to rest from wherever it is; the loop clears the
  // inline styles and drops "live" mode once every tile has settled.
  magPointerActive = false;
  if (magCache && !reduceMotion() && dockEl.classList.contains("mag-live")) { startMagLoop(); return; }
  stopMagLoop();
  clearMagnify();
}

function clearMagnify() {
  dockEl.classList.remove("mag-live");
  dockEl.querySelectorAll(".tile").forEach((t) => {
    t.style.transform = "";
    t.style.zIndex = "";
    t.classList.remove("focus");
  });
  if (magCache) for (const item of magCache) item.cur = null;
  magFocus = null;
  // Resting hit-rects — don't leave the inflated mag union clickable.
  S.lastHitSig = "";
  scheduleHitReport();
}

// Cached tile geometry for magnify: measured ONCE per layout (transforms don't
// affect offsetLeft/Top, so the resting centers stay valid), then reused on
// every pointer move — no more read/write layout thrashing in the hot loop.
let magCache = null;
let magFocus = null;
export function invalidateMag() {
  stopMagLoop();
  magCache = null;
  S.magDockRect = null;
  magFocus = null;
}
function buildMagCache() {
  const vertical = isVertical();
  // Measure the bar's viewport rect ONCE here (it only moves on reframe/edge
  // change, both of which invalidate the cache) so the hot per-frame loop never
  // reads layout again — pure compositor writes = smooth at any refresh rate.
  S.magDockRect = dockEl.getBoundingClientRect();
  magCache = [...dockEl.querySelectorAll(".tile")].map((el) => ({
    el,
    center: vertical ? el.offsetTop + el.offsetHeight / 2 : el.offsetLeft + el.offsetWidth / 2,
    // Widgets are info CARDS, not launch icons — scaling a big media/clock card
    // covers its neighbours, so they (and separators) don't magnify.
    noMag: el.classList.contains("separator") || el.classList.contains("widget"),
  }));
}

// Booki magnify — a wave: tiles scale + lift toward the screen interior AND
// nudge along the main axis so neighbours make room instead of stacking.
// Geometry is cached; the loop only writes transforms.
//
// Motion is a critically damped follow driven by the real frame time: each
// frame closes the same fraction of the gap per millisecond, so 60, 144 and
// 240 Hz feel equally quick, the higher rates only smoother, and nothing
// overshoots. The pointer position is read fresh every frame.
const MAG_TAU = 0.045; // seconds to close ~63% of the gap
let magPointerActive = false;
let magRaf = 0;
let magLast = 0;
export function magnify(clientX, clientY) {
  if (S.cfg.magnification === false || (S.cfg.magnifyStyle || "spring") === "off") return;
  if (dockEl.classList.contains("dragging") || S.editMode) return;
  // In scroll (overflow) mode the bar clips its ends, so a scaled tile would be
  // cut off — skip magnify; the name still shows via tooltip on hover.
  if (document.body.classList.contains("dock-overflow")) return;
  if (!magCache) buildMagCache();
  magPointer.x = clientX; magPointer.y = clientY;
  magPointerActive = true;
  // Guarded: re-adding a class that is already there still queues a mutation
  // record, which would wake the hit-rect observer every frame.
  if (!dockEl.classList.contains("mag-live")) dockEl.classList.add("mag-live");
  // Reduced motion: no easing, the wave follows the pointer directly.
  if (reduceMotion()) { magStep(1); return; }
  startMagLoop();
}

function startMagLoop() {
  if (magRaf) return;
  magLast = performance.now();
  const frame = (now) => {
    magRaf = 0;
    if (!magCache) return;
    const dt = Math.min(0.1, Math.max(0, (now - magLast) / 1000));
    magLast = now;
    const settled = magStep(1 - Math.exp(-dt / MAG_TAU));
    if (settled && !magPointerActive) { clearMagnify(); return; }
    if (!settled || magPointerActive) magRaf = requestAnimationFrame(frame);
  };
  magRaf = requestAnimationFrame(frame);
}
function stopMagLoop() { if (magRaf) cancelAnimationFrame(magRaf); magRaf = 0; }

/** Move every tile `k` (0..1) of the way to its target; true once all rest there. */
function magStep(k) {
  const base = baseSize();
  // Reduced motion keeps only a small scale on the tile under the pointer:
  // that tells you what you are about to click; the ripple is decoration.
  const calm = reduceMotion();
  const maxScale = calm ? Math.min(1.12, Math.max(1, S.cfg.zoom || 1.25)) : Math.max(1, S.cfg.zoom || 1.25);
  const spread = calm ? base * 0.6 : base * 2.0;
  const vertical = isVertical();
  const mainAxis = vertical ? "Y" : "X";
  const liftAxis = vertical ? "X" : "Y";
  const liftSign = (vertical ? S.cfg.edge === "left" : S.cfg.edge === "top") ? 1 : -1;
  const dr = S.magDockRect;
  const pointer = vertical ? magPointer.y - dr.top : magPointer.x - dr.left;
  let best = null;
  let bestInf = 0;
  let settled = true;
  for (const item of magCache) {
    const delta = item.center - pointer;
    const influence = !magPointerActive || item.noMag ? 0 : Math.max(0, 1 - (Math.abs(delta) / spread) ** 2);
    const target = {
      scale: item.noMag ? 1 : 1 + (maxScale - 1) * influence,
      lift: calm ? 0 : influence * 5,
      push: item.noMag || calm ? 0 : Math.sign(delta || 1) * influence * base * 0.22,
    };
    const cur = item.cur || (item.cur = { scale: 1, lift: 0, push: 0 });
    for (const key of ["scale", "lift", "push"]) {
      cur[key] += (target[key] - cur[key]) * k;
      if (Math.abs(target[key] - cur[key]) > (key === "scale" ? 0.002 : 0.2)) settled = false;
      else cur[key] = target[key];
    }
    const shown = (cur.scale - 1) / Math.max(0.001, maxScale - 1);
    const liftTf = cur.lift >= 0.5 ? `translate${liftAxis}(${(liftSign * cur.lift).toFixed(1)}px) ` : "";
    const pushTf = Math.abs(cur.push) >= 0.05 ? `translate${mainAxis}(${cur.push.toFixed(1)}px) ` : "";
    item.el.style.zIndex = shown > 0.02 ? String(Math.round(10 + shown * 90)) : "";
    item.el.style.transform = cur.scale === 1 && !liftTf && !pushTf ? "" : `${pushTf}${liftTf}scale(${cur.scale.toFixed(3)})`;
    if (!item.noMag && influence > bestInf) { bestInf = influence; best = item.el; }
  }
  const focus = best && bestInf > 0.45 ? best : null;
  if (focus !== magFocus) {
    if (magFocus) magFocus.classList.remove("focus");
    if (focus) focus.classList.add("focus");
    magFocus = focus;
  }
  // Hit-rects must track the wave — style mutations are ignored while mag-live,
  // so schedule from this frame instead of waiting for the MutationObserver.
  scheduleMagHitRects();
  return settled;
}

let magHitTimer = 0;
function scheduleMagHitRects() {
  if (magHitTimer) return;
  magHitTimer = requestAnimationFrame(() => {
    magHitTimer = 0;
    if (!dockEl.classList.contains("mag-live")) {
      reportHitRects();
      return;
    }
    reportHitRectsLive();
  });
}

export let magPointer = { x: 0, y: 0 };

// Overflow mode: hovering near an end of the bar auto-scrolls it that way, so you
// can reach the side items by just moving the cursor there (macOS-Genie style).
let edgeScrollRaf = 0;
let edgeScrollVel = 0;
export function edgeAutoScroll() {
  const vertical = isVertical();
  const r = dockEl.getBoundingClientRect();
  const pos = vertical ? magPointer.y : magPointer.x;
  const lo = vertical ? r.top : r.left;
  const hi = vertical ? r.bottom : r.right;
  const zone = Math.min(90, (hi - lo) * 0.18);
  if (pos < lo + zone) edgeScrollVel = -Math.ceil((lo + zone - pos) / 6);
  else if (pos > hi - zone) edgeScrollVel = Math.ceil((pos - (hi - zone)) / 6);
  else edgeScrollVel = 0;
  if (edgeScrollVel && !edgeScrollRaf) {
    // Speed is per 60 Hz frame, scaled by the real frame time, so a 144 Hz
    // monitor scrolls at the same pace as a 60 Hz one, only smoother.
    let last = performance.now();
    const tick = (now) => {
      if (!edgeScrollVel || !document.body.classList.contains("dock-overflow")) { edgeScrollRaf = 0; return; }
      const step = edgeScrollVel * Math.min(4, (now - last) / (1000 / 60));
      last = now;
      if (isVertical()) dockEl.scrollTop += step;
      else dockEl.scrollLeft += step;
      edgeScrollRaf = requestAnimationFrame(tick);
    };
    edgeScrollRaf = requestAnimationFrame(tick);
  }
}
export function stopEdgeScroll() { edgeScrollVel = 0; }
