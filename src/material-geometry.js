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
