/* Where a floating box goes relative to the bar.
 *
 * The dock puts five different things next to itself — the context menu, the
 * trash/coach popovers, the note editor, the update pill, the group flyout —
 * and every one of them had grown its own copy of the same arithmetic: sit on
 * the outward side of whatever edge the dock is anchored to, line up with a
 * point along the bar, and stay inside the window.
 *
 * They drifted, as copies do. The context menu was the only one that clamped
 * both axes, which is why a long menu near a corner used to be sliced while
 * the same situation was fine for a popover. The update pill clamps its
 * outward side but not the same way. Keeping one implementation is the point:
 * a placement fix now applies to all of them, and the rule is testable without
 * a browser.
 */

export const isVerticalEdge = (edge) => edge === "left" || edge === "right";

const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));

/**
 * Position a box beside the bar.
 *
 * @param {object}  o
 * @param {object}  o.bar      Anchor rect {left, top, width, height} — the dock,
 *                             or a single tile when the box belongs to one.
 * @param {object}  o.box      {width, height} of the thing being placed.
 * @param {string}  o.edge     Which screen edge the dock is anchored to.
 * @param {object}  o.viewport {width, height} of the window.
 * @param {number} [o.along]   Point along the bar's long axis to centre on
 *                             (a cursor position, say). Defaults to the bar's
 *                             own centre.
 * @param {number} [o.gap]     Space between bar and box.
 * @param {number} [o.pad]     Minimum space between box and window edge.
 * @returns {{left: number, top: number}}
 */
export function placeBesideBar({ bar, box, edge, viewport, along = null, gap = 10, pad = 8 }) {
  const maxLeft = viewport.width - box.width - pad;
  const maxTop = viewport.height - box.height - pad;

  if (isVerticalEdge(edge)) {
    const centre = along ?? bar.top + bar.height / 2;
    return {
      left: clamp(
        edge === "left" ? bar.left + bar.width + gap : bar.left - box.width - gap,
        pad,
        maxLeft
      ),
      top: clamp(centre - box.height / 2, pad, maxTop),
    };
  }

  const centre = along ?? bar.left + bar.width / 2;
  return {
    left: clamp(centre - box.width / 2, pad, maxLeft),
    top: clamp(
      edge === "top" ? bar.top + bar.height + gap : bar.top - box.height - gap,
      pad,
      maxTop
    ),
  };
}

/* Where a box should appear to grow from. Scaling a menu out of the point that
   opened it — the cursor, the tile — keeps the link between trigger and
   content; scaling it out of its own centre reads as a box that arrived from
   nowhere. Clamped to the box so an origin outside it can't shear the animation. */
export function transformOrigin(box, anchorX, anchorY) {
  return {
    x: clamp(anchorX - box.left, 0, box.width),
    y: clamp(anchorY - box.top, 0, box.height),
  };
}
