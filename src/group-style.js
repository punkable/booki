/* How a group looks in the dock and in Settings: an optional colour that
   tints its tile and flyout, and an optional library glyph that turns the
   tile into a solid badge. Without either, a group shows a grid of its
   first four items, as before. */
import { ICON_LIBRARY } from "./icon-library.js";
import { contrastOn } from "./util-color.js";

/** The curated group palette: nine families, each soft, base and deep.
   Only these are offered, so every group stays in Booki's look. */
export const GROUP_PALETTE = [
  ["blue", ["#8fc2ff", "#0a84ff", "#0050b3"]],
  ["indigo", ["#aeb3ff", "#5e5ce6", "#3634a3"]],
  ["purple", ["#dcb0f5", "#bf5af2", "#8944ab"]],
  ["pink", ["#ffadc0", "#ff375f", "#c21e4b"]],
  ["red", ["#ffaba3", "#ff453a", "#b3261e"]],
  ["orange", ["#ffcd8a", "#ff9f0a", "#c25e00"]],
  ["yellow", ["#fff09a", "#ffd60a", "#b38f00"]],
  ["green", ["#a6ecb6", "#30d158", "#248a3d"]],
  ["teal", ["#a8e6ef", "#40c8e0", "#0b7f8f"]],
  ["sand", ["#eadbc8", "#c8a27c", "#8a6a4a"]],
  ["graphite", ["#d1d1d6", "#8e8e93", "#3a3a3c"]],
];
export const GROUP_COLORS = GROUP_PALETTE.flatMap(([name, shades]) => shades.map((hex, i) => [name, hex, i]));

export function groupAppearance(item) {
  const style = item?.style && typeof item.style === "object" ? item.style : {};
  const color = /^#[0-9a-fA-F]{6}$/.test(style.color || "") ? style.color.toLowerCase() : "";
  const glyph = ICON_LIBRARY.includes(style.glyph) ? style.glyph : "";
  return { color, glyph, ink: color ? contrastOn(color) : "" };
}
