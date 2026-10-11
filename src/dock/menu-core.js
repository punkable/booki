/* Placing, opening and closing the dock's context menu. */

import { placeBesideBar, transformOrigin } from "./placement.js";
import { menuItems } from "./context-menu.js";
import { S } from "./state.js";
import { isVertical } from "./helpers.js";
import { dockEl, ctxMenu, esc } from "./dom.js";
import { reframe, applyFrame } from "./frame.js";

export function addMenuHead(title, subtitle) {
  const head = document.createElement("div");
  head.className = "menu-head";
  head.innerHTML = `<strong>${esc(title)}</strong><span>${esc(subtitle || "")}</span>`;
  ctxMenu.appendChild(head);
}

let menuReturnFocus = null;
let menuPrevReplace = null;
// The context menu lives beside the bar (like the folder flyout): the window is
// grown to fit it, so it can never be cut off by the dock window's bounds.
export function placeMenu(e, focus = true) {
  if (focus) menuReturnFocus = document.activeElement;
  const cx = e.clientX;
  const cy = e.clientY;
  // Measure invisibly, grow the window FIRST, then reveal in its final spot —
  // one paint, no flicker from the window resizing under an already-visible menu.
  ctxMenu.classList.add("measuring");
  ctxMenu.classList.remove("hidden");
  document.body.classList.add("menu-open");
  applyFrame();
  const put = () => {
    const { left, top } = placeBesideBar({
      bar: dockEl.getBoundingClientRect(),
      box: { width: ctxMenu.offsetWidth, height: ctxMenu.offsetHeight },
      edge: S.cfg.edge,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      along: isVertical() ? cy : cx,
    });
    ctxMenu.style.left = `${left}px`;
    ctxMenu.style.top = `${top}px`;
    // Scale the menu out from the point that opened it (the cursor/tile), not
    // its own center — keeps the spatial link between trigger and content.
    const o = transformOrigin(ctxMenu.getBoundingClientRect(), cx, cy);
    ctxMenu.style.transformOrigin = `${o.x}px ${o.y}px`;
  };
  put();
  // The window resizes asynchronously after applyFrame(); reposition again the
  // moment it actually settles (via the resize hook) AND on a short fallback, so
  // the menu can never end up clipped by a window that grew a beat too late.
  // Remember an open flyout's re-place hook so closing the menu gives it back.
  if (S.pendingReplace && !S.pendingReplace._menu) menuPrevReplace = S.pendingReplace;
  put._menu = true;
  S.pendingReplace = put;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      put();
      ctxMenu.classList.remove("measuring");
      if (focus && !ctxMenu.classList.contains("hidden")) menuItems(ctxMenu)[0]?.focus();
    });
  });
}
export function closeMenu() {
  ++S.menuGeneration;
  if (ctxMenu.classList.contains("hidden")) return;
  ctxMenu.classList.add("hidden");
  document.body.classList.remove("menu-open");
  if (S.pendingReplace?._menu) S.pendingReplace = S.stackOpen ? menuPrevReplace : null;
  menuPrevReplace = null;
  if (ctxMenu.contains(document.activeElement)) menuReturnFocus?.focus?.();
  reframe();
}
