/* How a group looks in the dock and in Settings: an optional colour that
   tints its tile and flyout, and an optional library glyph that turns the
   tile into a solid badge. Without either, a group shows a grid of its
   first four items, as before. */
import { ICON_LIBRARY } from "./icon-library.js";
import { contrastOn } from "./util-color.js";

/** Preset group colours (the iOS system palette). Labels live in i18n. */
export const GROUP_COLORS = [
  ["blue", "#0a84ff"], ["purple", "#bf5af2"], ["pink", "#ff375f"], ["red", "#ff453a"],
  ["orange", "#ff9f0a"], ["yellow", "#ffd60a"], ["green", "#30d158"], ["teal", "#40c8e0"], ["graphite", "#8e8e93"],
];

export function groupAppearance(item) {
  const style = item?.style && typeof item.style === "object" ? item.style : {};
  const color = /^#[0-9a-fA-F]{6}$/.test(style.color || "") ? style.color.toLowerCase() : "";
  const glyph = ICON_LIBRARY.includes(style.glyph) ? style.glyph : "";
  return { color, glyph, ink: color ? contrastOn(color) : "" };
}
