/* Small color helpers shared by the dock and settings, so any accent — even a
   custom one — derives a sensible deep shade and readable contrast color. */

export function hexToRgb(hex) {
  let h = String(hex || "").trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return { r: 223, g: 170, b: 117 }; // Booki tan fallback
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Darken a hex color by a 0–1 amount (toward black). */
export function darken(hex, amount = 0.18) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return rgbToHex({ r: r * f, g: g * f, b: b * f });
}

/** Relative luminance (sRGB, 0–1). */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** A readable text/icon color (dark or light) to sit on top of `hex`. */
export function contrastOn(hex) {
  return luminance(hex) > 0.45 ? "#241a10" : "#ffffff";
}

/** Set --accent, --accent-deep and --accent-contrast from a single accent. */
export function applyAccent(root, accent) {
  if (!accent) return;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-deep", darken(accent, 0.2));
  root.style.setProperty("--accent-contrast", contrastOn(accent));
}
