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
  // Drop "live" mode first so restoring the transform transition lets the tiles
  // ease smoothly back to rest instead of snapping.
  dockEl.classList.remove("mag-live");
  dockEl.querySelectorAll(".tile").forEach((t) => {
    t.style.transform = "";
    t.style.zIndex = "";
    t.classList.remove("focus");
  });
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

// Booki magnify — Apple/Cool Dock style wave: tiles scale + lift toward the
// screen interior AND nudge along the main axis so neighbours make room
// instead of stacking. Geometry is cached; this loop only writes transforms.
export function magnify(clientX, clientY) {
  if (S.cfg.magnification === false || (S.cfg.magnifyStyle || "spring") === "off") return;
  if (dockEl.classList.contains("dragging") || S.editMode) return;
  // In scroll (overflow) mode the bar clips its ends, so a scaled tile would be
  // cut off — skip magnify; the name still shows via tooltip on hover.
  if (document.body.classList.contains("dock-overflow")) return;
  if (!magCache) buildMagCache();
  // Follow the pointer 1:1 this frame (no CSS transition lag) — the settle when
  // you leave still eases. This is what makes it feel crisp at high refresh.
  // Guarded: re-adding a class that is already there still queues a mutation
  // record, and this runs every frame — that single write was waking the
  // observer below once per frame, which scheduled a full hit-rect report that
  // raced the one magnify schedules itself.
  if (!dockEl.classList.contains("mag-live")) dockEl.classList.add("mag-live");
  const base = baseSize();
  // Reduced motion reaches magnify here, not through CSS: the wave is written
  // as an inline transform every frame, which the global override cannot touch,
  // so the setting used to do nothing at all to the dock's largest animation.
  // What goes is the decoration — neighbours rippling outward, tiles lifting
  // off the bar. What stays is a small scale on the tile under the pointer,
  // because that is not ornament: it is how you know what you are about to
  // click, and removing it would make the dock harder to use, not calmer.
  const calm = reduceMotion();
  const maxScale = calm ? Math.min(1.12, Math.max(1, S.cfg.zoom || 1.25)) : Math.max(1, S.cfg.zoom || 1.25);
  const spread = calm ? base * 0.6 : base * 2.0;
  const vertical = isVertical();
  const mainAxis = vertical ? "Y" : "X";
  const liftAxis = vertical ? "X" : "Y";
  const liftSign = (vertical ? S.cfg.edge === "left" : S.cfg.edge === "top") ? 1 : -1;
  const dr = S.magDockRect;
  const pointer = vertical ? clientY - dr.top : clientX - dr.left;
  let best = null;
  let bestInf = 0;
  for (const item of magCache) {
    const delta = item.center - pointer;
    const influence = item.noMag ? 0 : Math.max(0, 1 - (Math.abs(delta) / spread) ** 2);
    const scale = item.noMag ? 1 : 1 + (maxScale - 1) * influence;
    // Lift toward the screen interior (translate BEFORE scale so it stays a
    // constant px amount). Neighbours also push along the bar — the wave.
    // Rail-origin scale does most of the "lift"; keep translate modest.
    const lift = calm ? 0 : Math.round(influence * 5);
    const liftTf = lift ? `translate${liftAxis}(${liftSign * lift}px) ` : "";
    const push = item.noMag || calm ? 0 : Math.sign(delta || 1) * influence * base * 0.22;
    const pushTf = push ? `translate${mainAxis}(${push.toFixed(1)}px) ` : "";
    item.el.style.zIndex = influence > 0.02 ? String(Math.round(10 + influence * 90)) : "";
    item.el.style.transform = `${pushTf}${liftTf}scale(${scale.toFixed(3)})`;
    if (!item.noMag && influence > bestInf) {
      bestInf = influence;
      best = item.el;
    }
  }
  const focus = best && bestInf > 0.45 ? best : null;
  if (focus !== magFocus) {
    if (magFocus) magFocus.classList.remove("focus");
    if (focus) focus.classList.add("focus");
    magFocus = focus;
  }
  // Hit-rects must track the wave — style mutations are ignored while mag-live,
  // so schedule from this rAF instead of waiting for the MutationObserver.
  scheduleMagHitRects();
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
    const tick = () => {
      if (!edgeScrollVel || !document.body.classList.contains("dock-overflow")) { edgeScrollRaf = 0; return; }
      if (isVertical()) dockEl.scrollTop += edgeScrollVel;
      else dockEl.scrollLeft += edgeScrollVel;
      edgeScrollRaf = requestAnimationFrame(tick);
    };
    edgeScrollRaf = requestAnimationFrame(tick);
  }
}
export function stopEdgeScroll() { edgeScrollVel = 0; }
