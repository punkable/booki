/* Hit regions and blur material of the stage window: which parts of the edge-wide
   window take clicks, reported to the backend as the DOM changes. */

import { dock as dockApi } from "../api.js";
import { rectFromElement, pointInRect, hitSignature } from "./geometry.js";
import { reportMaterial, shapeOf } from "../material.js";
import { S } from "./state.js";
import { baseSize } from "./helpers.js";
import { dockEl, stackEl } from "./dom.js";

/** Hit-test using transformed tile bounds while magnify is live. */
export function reportHitRectsLive() {
  reportDockMaterial();
  if (!dockApi.setHitRects) return;
  try {
    // Derive the region from the bar's RESTING rect plus the most the wave can
    // ever add, instead of measuring every tile.
    //
    // This used to walk all the tiles and getBoundingClientRect() each one,
    // from inside the magnify rAF — a forced layout right after writing their
    // transforms, then an IPC call, every frame. On a 144Hz screen with a full
    // bar that is ~2200 rect reads and 144 backend calls a second for as long
    // as the cursor rests on the dock.
    //
    // The bound is exact: magnify scales a tile by at most `zoom` about the
    // rail, lifts it 5px perpendicular and pushes neighbours base*0.22 along
    // the bar. A pad covering all three is a superset of the real union — and,
    // unlike the union, it does not change as the wave travels, so the
    // signature check below collapses the whole gesture into one call.
    const dr = S.magDockRect || dockEl.getBoundingClientRect();
    const base = baseSize();
    const grow = Math.max(0, (Math.max(1, S.cfg.zoom || 1.25) - 1) * base);
    const pad = Math.ceil(grow + base * 0.22 + 6);
    const rect = [
      Math.floor(dr.left - pad),
      Math.floor(dr.top - pad),
      Math.ceil(dr.width + pad * 2),
      Math.ceil(dr.height + pad * 2),
    ];
    const sig = `mag:${rect.map(Math.round).join(",")}`;
    if (sig === S.lastHitSig) return;
    S.lastHitSig = sig;
    dockApi.setHitRects([rect], false).catch(() => {});
  } catch (_) {
    /* best-effort */
  }
}

// ───────────────── Hit regions of the stage window ─────────────────
// The window spans the whole edge, but only the painted bar/tiles and open
// panels are interactive; everywhere else the backend flips it click-through.
// Report those regions whenever the DOM changes.
const DOCK_HIT_PAD = 0;
const TILE_HIT_PAD = 2;
const PANEL_HIT_PAD = 4;
// Open panels that must stay clickable. Tooltips are not listed: they never
// take input, and counting them blocked clicks on whatever sat under them.
const HIT_PANELS =
  ".productivity-panel, .edit-toolbar, .trash-pop, .coach, .note-editor, .undo-toast:not(.hidden), #ctx-menu:not(.hidden), .update-pill:not(.hidden)";

export function pointInLiveHitArea(x, y) {
  if (S.edgeMove || S.dragging || S.draggingFile) return true;
  const rects = [
    rectFromElement(dockEl, DOCK_HIT_PAD),
    ...[...dockEl.querySelectorAll(".tile")].map((el) => rectFromElement(el, TILE_HIT_PAD)),
    S.stackOpen ? rectFromElement(stackEl, PANEL_HIT_PAD) : null,
    ...[...document.querySelectorAll(
      HIT_PANELS
    )].map((el) => rectFromElement(el, PANEL_HIT_PAD)),
  ];
  return rects.some((rect) => pointInRect(x, y, rect));
}
// Real blur behind the bar and whatever panel is open over the desktop.
export const MATERIAL_PANELS = "#ctx-menu:not(.hidden), .trash-pop, .coach, .update-pill:not(.hidden)";
export function reportDockMaterial() {
  const body = document.body.classList;
  if (S.hiddenState || body.contains("tucked") || body.contains("edge-swap") || body.contains("booting")) {
    reportMaterial([]);
    return;
  }
  reportMaterial([
    shapeOf(dockEl),
    S.stackOpen ? shapeOf(stackEl) : null,
    ...[...document.querySelectorAll(MATERIAL_PANELS)].map((el) => shapeOf(el)),
  ]);
}

export function reportHitRects() {
  reportDockMaterial();
  if (!dockApi.setHitRects) return;
  // Anything of ours in flight (tile drag, edge-move, edit wobble, an OS file
  // drag over the dock) → the whole stage stays interactive; never yank the
  // window out from under a gesture.
  // During reveal (and a short grace after it) the whole stage must stay
  // interactive so the cursor watcher doesn't flip the window click-through
  // before the frontend has reported fresh hit rects.
  const all = !!(
    S.edgeMove || S.dragging || S.draggingFile || document.body.classList.contains("edit") ||
    document.body.classList.contains("revealing") ||
    document.querySelector(".drag-clone, .stack-drag-clone")
  );
  // While the wave is live the region is the fixed magnify envelope. Measuring
  // transformed tiles here instead produced a different signature than the
  // envelope, so any unrelated mutation made the two ping-pong IPC calls.
  if (!all && !S.stackOpen && dockEl.classList.contains("mag-live") && !document.querySelector(HIT_PANELS)) {
    reportHitRectsLive();
    return;
  }
  const rects = [];
  const add = (el, inflate = 0) => {
    const rect = rectFromElement(el, inflate);
    if (rect) rects.push(rect);
  };
  // Keep the shadow room visual. The clickable region follows the bar,
  // transformed tiles and live panels, so apps behind Booki receive near-edge
  // clicks immediately.
  add(dockEl, DOCK_HIT_PAD);
  for (const tile of dockEl.querySelectorAll(".tile")) add(tile, TILE_HIT_PAD);
  // Inflate toward the dock so the pointer doesn't fall through the gap.
  if (S.stackOpen) add(stackEl, Math.max(PANEL_HIT_PAD, 8));
  for (const el of document.querySelectorAll(
    HIT_PANELS
  ))
    add(el, PANEL_HIT_PAD);
  const sig = hitSignature(rects, all);
  if (sig === S.lastHitSig) return;
  S.lastHitSig = sig;
  dockApi.setHitRects(rects, all).catch(() => {});
}
let hitRafId = 0;
export function scheduleHitReport() {
  if (hitRafId) return;
  hitRafId = requestAnimationFrame(() => {
    hitRafId = 0;
    reportHitRects();
  });
}
