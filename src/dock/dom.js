/* The dock page's fixed elements, plus the small DOM helpers every part uses. */

import { installDockKeyboard } from "./keyboard-nav.js";
import { S } from "./state.js";
import { isVertical } from "./helpers.js";

export const dockEl = document.getElementById("dock");
// One Tab stop for the whole bar; arrows move between tiles (see dock/keyboard-nav.js).
// Arrows stand down while a tile is pressed, dragged or the bar is being moved.
export const dockKeys = installDockKeyboard(dockEl, {
  isVertical: () => isVertical(),
  isBusy: () => S.dragging || !!S.press || !!S.edgeMove,
});
export const ctxMenu = document.getElementById("ctx-menu");
export const dropOverlay = document.getElementById("drop-overlay");
export const undoToast = document.getElementById("undo-toast");

// Safe .closest() — pointer/keyboard targets can be non-Element (document/window),
// which would throw "closest is not a function".
export const closestSel = (target, sel) => (target && target.closest ? target.closest(sel) : null);

// Escape user-controlled text (file/app names) before it goes into innerHTML —
// a file literally named "<img onerror=…>.txt" must render as text, not run.
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const stackEl = document.getElementById("stack");
