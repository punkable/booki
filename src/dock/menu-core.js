/* Placing, opening and closing the dock's context menu. */

import { placeBesideBar, transformOrigin } from "./placement.js";
import { menuItems, menuActions } from "./context-menu.js";
import { t } from "../i18n.js";
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

/** Each secondary view replaces the same bounded surface instead of widening it. */
export function resetMenu() {
  ++S.menuGeneration;
  ctxMenu._nextReturnFocus = ctxMenu.contains(document.activeElement) ? menuReturnFocus : document.activeElement;
  ctxMenu.replaceChildren();
  ctxMenu.scrollTop = 0;
  ctxMenu.classList.remove("group-customizer");
  ctxMenu.setAttribute("role", "menu");
  ctxMenu.removeAttribute("aria-label");
  ctxMenu._back = null;
  ctxMenu._onEscape = null;
}
export function addMenuSection(container, glyph, label, open, role = "menu") {
  const button = menuActions(container, () => {}).add(glyph, label, open);
  button.setAttribute("aria-haspopup", role);
  const arrow = document.createElement("span"); arrow.className = "menu-next"; arrow.textContent = "›"; arrow.setAttribute("aria-hidden", "true"); button.append(arrow);
  return button;
}
export function openMenuSection(e, title, back, build) {
  resetMenu();
  ctxMenu._back = back;
  menuActions(ctxMenu, () => {}).add("chevron-left", t("refine.back"), back);
  addMenuHead(title);
  build(menuActions(ctxMenu, closeMenu));
  placeMenu(e);
}

let menuReturnFocus = null;
let menuPrevReplace = null;
// The context menu lives beside the bar (like the folder flyout): the window is
// grown to fit it, so it can never be cut off by the dock window's bounds.
export function placeMenu(e, focus = true) {
  if (focus) { menuReturnFocus = ctxMenu._nextReturnFocus || document.activeElement; ctxMenu._nextReturnFocus = null; }
  const cx = e.clientX;
  const cy = e.clientY;
  // Measure invisibly, grow the window FIRST, then reveal in its final spot —
  // one paint, no flicker from the window resizing under an already-visible menu.
  if (focus || ctxMenu.classList.contains("hidden")) ctxMenu.classList.add("measuring");
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
      inside: dockEl.getBoundingClientRect(),
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
  const generation = S.menuGeneration;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (generation !== S.menuGeneration) return;
      put();
      ctxMenu.classList.remove("measuring");
      if (focus && !ctxMenu.classList.contains("hidden")) (ctxMenu.querySelector("[data-menu-focus]") || menuItems(ctxMenu)[0])?.focus();
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
