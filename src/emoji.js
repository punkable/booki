/* Fluent Emoji (Microsoft, MIT) — bundled 3D emoji images that give the app a
   premium, personable look instead of flat OS glyphs. Served locally from
   /emoji/*.png (assets/emoji), so no network and no CSP exceptions. */

const NAMES = [
  "clock", "brain", "ice", "floppy", "antenna", "stopwatch", "battery", "memo",
  "notes", "folder", "beaver", "shield", "picture", "sparkles", "wastebasket",
  "pointer", "card", "puzzle", "star", "mouse",
];

/** <img> tag markup for a bundled Fluent emoji (falls back to nothing). */
export function emo(name, size = 20) {
  if (!NAMES.includes(name)) return "";
  return `<img class="emo" src="/emoji/${name}.png" alt="" width="${size}" height="${size}" draggable="false" />`;
}

/** URL of a bundled emoji image (for React <img src>). */
export function emoSrc(name) {
  return NAMES.includes(name) ? `/emoji/${name}.png` : "";
}
