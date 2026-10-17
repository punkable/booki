/* How a group looks in the dock and in Settings: an optional colour that
   tints its tile and flyout, and an optional library glyph that turns the
   tile into a solid badge. Without either, a group shows a grid of its
   first four items, as before. */
import { ICON_LIBRARY } from "./icon-library.js";
import { contrastOn } from "./util-color.js";

/** The curated group palette: Windows 11's own accent colours, eleven
   families, each soft, base and deep. Only these are offered, so every
   group stays in Booki's look. */
export const GROUP_PALETTE = [
  ["blue", ["#a6d1f5", "#0078d4", "#005a9e"]],
  ["indigo", ["#c6c0f5", "#6b69d6", "#4f4ba8"]],
  ["purple", ["#d9c6ef", "#8764b8", "#5c3f8a"]],
  ["pink", ["#f7b8dd", "#e3008c", "#9b0062"]],
  ["red", ["#f4b4b6", "#e74856", "#a4262c"]],
  ["orange", ["#fbc8a4", "#f7630c", "#b04b09"]],
  ["yellow", ["#ffe7a3", "#ffb900", "#b38200"]],
  ["green", ["#b5e8b0", "#13a10e", "#0b6a0b"]],
  ["teal", ["#a6e9ed", "#00b7c3", "#038387"]],
  ["sand", ["#eadbc8", "#c8a27c", "#8a6a4a"]],
  ["graphite", ["#d2d0ce", "#7a7574", "#484644"]],
];

// The palette before 0.86 used Apple's system colours. A group saved with one
// of those shows the matching Windows shade instead, so it keeps its family
// and the picker still marks it.
const LEGACY_COLORS = {
  "#8fc2ff": "#a6d1f5", "#0a84ff": "#0078d4", "#0050b3": "#005a9e",
  "#aeb3ff": "#c6c0f5", "#5e5ce6": "#6b69d6", "#3634a3": "#4f4ba8",
  "#dcb0f5": "#d9c6ef", "#bf5af2": "#8764b8", "#8944ab": "#5c3f8a",
  "#ffadc0": "#f7b8dd", "#ff375f": "#e3008c", "#c21e4b": "#9b0062",
  "#ffaba3": "#f4b4b6", "#ff453a": "#e74856", "#b3261e": "#a4262c",
  "#ffcd8a": "#fbc8a4", "#ff9f0a": "#f7630c", "#c25e00": "#b04b09",
  "#fff09a": "#ffe7a3", "#ffd60a": "#ffb900", "#b38f00": "#b38200",
  "#a6ecb6": "#b5e8b0", "#30d158": "#13a10e", "#248a3d": "#0b6a0b",
  "#a8e6ef": "#a6e9ed", "#40c8e0": "#00b7c3", "#0b7f8f": "#038387",
  "#d1d1d6": "#d2d0ce", "#8e8e93": "#7a7574", "#3a3a3c": "#484644",
};
export const GROUP_COLORS = GROUP_PALETTE.flatMap(([name, shades]) => shades.map((hex, i) => [name, hex, i]));

export function groupAppearance(item) {
  const style = item?.style && typeof item.style === "object" ? item.style : {};
  const saved = /^#[0-9a-fA-F]{6}$/.test(style.color || "") ? style.color.toLowerCase() : "";
  const color = LEGACY_COLORS[saved] || saved;
  const glyph = ICON_LIBRARY.includes(style.glyph) ? style.glyph : "";
  return { color, glyph, ink: color ? contrastOn(color) : "" };
}
