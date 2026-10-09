/** Match the native compositor's rounding of physical edges and corner radii.
 * Fractional layout noise that paints the same pixels should not cause IPC or
 * recreate native surfaces. Keep the original CSS geometry in the command. */
export function physicalMaterialShapes(shapes, dpr) {
  const px = value => { const v = value * dpr; return v < 0 ? -Math.round(-v) : Math.round(v); };
  return shapes.map(([x, y, w, h, ...radii]) => {
    const left = px(x), top = px(y);
    return [left, top, Math.max(1, px(x + w) - left), Math.max(1, px(y + h) - top), ...radii.map(r => Math.max(0, px(r)))];
  });
}

/** Shrink a shape until its plain rectangle fits inside the CSS rounded
 * outline. Windows 11 can ignore the window region on blur-behind windows,
 * and a polygon region is aliased anyway; either way the native blur would
 * show as a square box past the CSS corners. Each side moves in by the part
 * of its larger corner that a square would poke out of (r·(1−1/√2)), and the
 * corner radii shrink by the same amount, so the native piece is contained
 * whether or not the region is honoured. */
export function containedShape([x, y, w, h, tl = 0, tr = 0, br = 0, bl = 0]) {
  const k = 1 - Math.SQRT1_2;
  const left = Math.max(tl, bl) * k, right = Math.max(tr, br) * k;
  const top = Math.max(tl, tr) * k, bottom = Math.max(bl, br) * k;
  const width = w - left - right, height = h - top - bottom;
  if (width < 1 || height < 1) return null;
  const inset = Math.max(left, right, top, bottom);
  return [x + left, y + top, width, height, ...[tl, tr, br, bl].map((r) => Math.max(0, r - inset))];
}
