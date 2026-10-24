/* The native window frame around the bar, and fitting the bar to the screen. */

import { dock as dockApi, isTauri } from "../api.js";
import { chooseFitSize } from "./layout-model.js";
import { availW, availH } from "./geometry.js";
import { S } from "./state.js";
import { isVertical, baseSize } from "./helpers.js";
import { dockEl } from "./dom.js";
import { setAllSizes, invalidateMag } from "./magnify.js";

// Smallest a shrunk icon may get before we stop shrinking and start scrolling —
// below this they're too tiny to recognise.
const MIN_TILE = 30;

// Keep the dock within the screen no matter how many items are pinned. First
// shrink icons to fit (macOS-style). If even at the minimum size they'd still
// run past the screen, cap the bar to the screen and switch to SCROLL mode
// (wheel + hover the ends) so you can reach the side items — the bar never grows
// past the screen and never "breaks".
export function fitDock() {
  setAllSizes(baseSize());
  const vertical = isVertical();
  const span = vertical ? availH(isTauri) : availW(isTauri);
  // A slot-aligned bar (start/end) sits behind a 12% offset — that space isn't
  // usable, or a full bar would overflow past the far screen edge.
  const slotPad = S.cfg && S.cfg.notchPosition && S.cfg.notchPosition !== "center" ? span * 0.12 : 0;
  const usable = span - SHADOW_PAD * 2 - 24 - slotPad;
  let overflow = false;
  if (usable > 0) {
    const natural = vertical ? dockEl.scrollHeight : dockEl.scrollWidth;
    if (natural > usable) {
      const eff = chooseFitSize(baseSize(), natural, usable, S.cfg.overflowMode);
      if (eff >= MIN_TILE) {
        setAllSizes(eff);
        overflow = (vertical ? dockEl.scrollHeight : dockEl.scrollWidth) > usable;
      } else {
        setAllSizes(MIN_TILE); // floor reached → the rest lives behind a scroll
        const natural2 = vertical ? dockEl.scrollHeight : dockEl.scrollWidth;
        overflow = natural2 > usable;
      }
    }
  }
  document.body.classList.toggle("dock-overflow", overflow);
  // Cap the visible bar so the window can never exceed the screen.
  dockEl.style.maxWidth = overflow && !vertical ? `${usable}px` : "";
  dockEl.style.maxHeight = overflow && vertical ? `${usable}px` : "";
  invalidateMag(); // tile sizes/positions just changed → re-measure lazily
}

let reframeTimer = null;
export function reframe() {
  // Coalesce rapid calls (render + settings changes) into one resize.
  clearTimeout(reframeTimer);
  reframeTimer = setTimeout(
    () => requestAnimationFrame(() => requestAnimationFrame(applyFrame)),
    50
  );
}

// Tight visual breathing room around the bar. Booki now leans on Mica-style
// tint instead of large drop shadows, so the native transparent stage can stay
// smaller and clicks just outside the painted dock reach the app underneath.
export const SHADOW_PAD = 18;

// Fixed headroom past the bar for everything that opens around it — group
// flyouts, context menu, popovers, tooltips, the update pill, magnify and the
// soft shadow. Reserving it permanently is THE anti-flicker design: opening a
// group/menu is pure DOM inside a window that never resizes (every native
// resize repaints a frame where the WebView's layout lags the new rect — that
// lag was the visible jump/blink). Empty stage regions don't steal clicks: a
// cursor watcher (backend) flips the window click-through outside the hit
// rects the frontend reports (reportHitRects).
const PANEL_ROOM = 420;

function edgePadCss() {
  return Math.min(SHADOW_PAD, Math.max(0, Math.min(96, S.cfg.edgeGap ?? 12)));
}
function computeFrame() {
  const dpr = window.devicePixelRatio || 1;
  // The STAGE: full length along the anchored edge; bar depth + panel headroom
  // across it. It only changes when the bar's depth changes (icon size, labels,
  // compact) or the screen does — never when something opens or closes.
  // Use offsetWidth/Height (layout size) — NOT getBoundingClientRect — so a dock
  // that's currently scaled by the minimize animation doesn't size the window too
  // small (which left the bar looking cut off after revealing, esp. at the top).
  const edgePad = edgePadCss();
  let wCss, hCss;
  if (isVertical()) {
    wCss = dockEl.offsetWidth + edgePad + PANEL_ROOM;
    hCss = availH(isTauri);
  } else {
    wCss = availW(isTauri);
    hCss = dockEl.offsetHeight + edgePad + PANEL_ROOM;
  }
  wCss = Math.min(wCss, availW(isTauri));
  hCss = Math.min(hCss, availH(isTauri));
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

/** Bar-only size for smart-hide occlusion (no PANEL_ROOM flyout headroom). */
function computeHomeFrame() {
  const dpr = window.devicePixelRatio || 1;
  const edgePad = edgePadCss();
  let wCss, hCss;
  if (isVertical()) {
    wCss = dockEl.offsetWidth + edgePad;
    hCss = availH(isTauri);
  } else {
    wCss = availW(isTauri);
    hCss = dockEl.offsetHeight + edgePad;
  }
  wCss = Math.min(wCss, availW(isTauri));
  hCss = Math.min(hCss, availH(isTauri));
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

let lastFrameEdge = null;
export function applyFrame() {
  if (!S.cfg) return; // still booting: nothing to frame yet
  const full = computeFrame();
  const home = computeHomeFrame();
  // Skip the native resize when the change is small: the transparent SHADOW_PAD
  // absorbs minor bar-size jitter, so live widgets whose text
  // width wiggles (net rates, media title, rolling numbers) don't make the whole
  // window grow/shrink every second — that constant resize was a real flicker.
  // Only resize once a change is big enough to threaten the shadow's headroom.
  const key = `${S.cfg.edge}:${S.cfg.monitor ?? -1}`;
  const dpr = window.devicePixelRatio || 1;
  const slack = Math.round(8 * dpr); // px; small enough to keep the tighter stage accurate
  if (
    S.lastFull && lastFrameEdge === key &&
    Math.abs(full.w - S.lastFull.w) <= slack && Math.abs(full.h - S.lastFull.h) <= slack
  ) {
    return;
  }
  S.lastFull = full;
  lastFrameEdge = key;
  // Stage stays large for flyouts; home rect is bar-sized for smart-hide.
  dockApi.setDockFrame(S.cfg.edge, full.w, full.h, false, home.w, home.h);
}

// Reposition when the screen metrics change — resolution, DPI/scale, taskbar
// size, or plugging/unplugging a monitor. The dock's pixel size may be identical
// (so applyFrame's no-op guard would skip it), yet its anchored spot moved, which
// otherwise left it half-off-screen until the next settings change.
let lastScreenSig = "";
function screenSig() {
  const s = window.screen || {};
  return [s.width, s.height, s.availWidth, s.availHeight, s.availLeft ?? 0, s.availTop ?? 0, window.devicePixelRatio || 1].join("x");
}
/** Reframe for a new display even when its metrics match the old one. */
export function forceReframe() {
  lastScreenSig = "";
  checkScreenChange();
}
export function checkScreenChange() {
  if (!S.cfg) return; // a resize before boot finished → nothing to reframe yet
  const sig = screenSig();
  if (sig === lastScreenSig) return;
  lastScreenSig = sig;
  S.lastFull = null; // force setDockFrame even if the pixel size is unchanged
  if (typeof invalidateMag === "function") invalidateMag();
  fitDock();
  applyFrame();
}
lastScreenSig = screenSig();
