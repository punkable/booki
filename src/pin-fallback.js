/* What a pin shows when Windows gives no icon (a broken shortcut, a site
   without a favicon, an icon still extracting failed). Each pin gets a stable
   colour from the group palette, picked from its name, so a row of fallbacks
   reads as distinct items instead of identical tan squares. Websites show a
   globe; everything else shows its initial. Used by the dock and Settings. */
import { GROUP_PALETTE } from "./group-style.js";
import { contrastOn } from "./util-color.js";

// Yellow and graphite are left out: yellow can't carry white text and
// graphite reads as a disabled item.
const FAMILIES = GROUP_PALETTE.filter(([name]) => name !== "yellow" && name !== "graphite");

function hashName(text) {
  let h = 0;
  for (const ch of String(text)) h = (Math.imul(h, 31) + ch.codePointAt(0)) | 0;
  return Math.abs(h);
}

export function isWebPath(path) {
  return /^https?:\/\//i.test(String(path || ""));
}

/** { color, deep, ink, glyph, letter } for a pin without an icon. `glyph` is
 *  an icons.js name (or "" when the initial letter is shown). */
export function pinFallback(item) {
  const name = String(item?.name || "").trim();
  const [, shades] = FAMILIES[hashName(name.toLowerCase() || item?.path || "?") % FAMILIES.length];
  const color = shades[1];
  const deep = shades[2];
  const web = isWebPath(item?.path);
  const glyph = item?.kind === "folder" ? "folder" : web ? "globe" : "";
  const letter = glyph ? "" : (name.charAt(0) || "?").toLocaleUpperCase();
  return { color, deep, ink: contrastOn(deep), glyph, letter };
}
