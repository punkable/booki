/* Window geometry shared by the dock and the notch.
 *
 * Both windows are transparent "stages" that span far more than they paint, and
 * both have to tell Rust which rectangles are actually clickable so everything
 * else falls through to the app behind. They had grown their own byte-identical
 * copies of these helpers, which is exactly the kind of duplication that lets a
 * fix land in one window and not the other.
 */

/* Usable screen size in CSS px.
 *
 * Under Tauri the window is positioned by the backend and may be smaller than
 * the screen, so the screen's own dimensions are the truth. In a plain browser
 * (the test harness, the demo) there is no backend placing anything, and
 * screen.availWidth reports the whole desktop while the page only gets the
 * viewport — clamping keeps the layout inside what is actually visible. */
export function availW(hasBackend) {
  const screenW = window.screen.availWidth || window.screen.width || window.innerWidth || 1280;
  return hasBackend ? screenW : Math.min(screenW, window.innerWidth || screenW);
}

export function availH(hasBackend) {
  const screenH = window.screen.availHeight || window.screen.height || window.innerHeight || 720;
  return hasBackend ? screenH : Math.min(screenH, window.innerHeight || screenH);
}

/** Window-relative [x, y, w, h] for an element, or null if it isn't painted. */
export function rectFromElement(el, inflate = 0) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return [r.left - inflate, r.top - inflate, r.width + inflate * 2, r.height + inflate * 2];
}

export function pointInRect(x, y, rect) {
  return !!rect && x >= rect[0] && x < rect[0] + rect[2] && y >= rect[1] && y < rect[1] + rect[3];
}

/* A stable key for a set of hit rects, so an unchanged layout costs no IPC.
 * Rounded to whole pixels: a fractional drift of a tenth of a px is not a
 * change anyone can click on, and both windows re-measure every frame while
 * something animates. */
export function hitSignature(rects, all) {
  return all ? "all" : rects.map((r) => r.map(Math.round).join(",")).join(";");
}
