/* Fluent Emoji (Microsoft, MIT) — bundled 3D emoji images that give the app a
   premium, personable look instead of flat OS glyphs. Served locally from
   /emoji/*.png (assets/emoji), so no network and no CSP exceptions. */

const NAMES = [
  "clock", "brain", "ice", "floppy", "antenna", "stopwatch", "battery", "memo",
  "notes", "folder", "beaver", "shield", "picture", "sparkles", "wastebasket",
  "pointer", "card", "puzzle", "star", "mouse", "speaker", "speaker-mute",
  "clipboard",
];

const NAME_SET = new Set(NAMES);

/** <img> tag markup for a bundled Fluent emoji (falls back to nothing). */
export function emo(name, size = 20) {
  if (!NAME_SET.has(name)) return "";
  // onerror hides a missing asset so the UI never shows a broken-image glyph.
  return `<img class="emo" src="/emoji/${name}.png" alt="" width="${size}" height="${size}" draggable="false" onerror="this.remove()" />`;
}

/** URL of a bundled emoji image (for React <img src>). */
export function emoSrc(name) {
  return NAME_SET.has(name) ? `/emoji/${name}.png` : "";
}

export function hasEmoji(name) {
  return NAME_SET.has(name);
}
