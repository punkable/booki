/* Which open windows belong to a pin.
 *
 * Matching by the owning executable is exact. The title is only a fallback for
 * .lnk and shell pins whose target is not an .exe, and it is easy to get wrong:
 * a folder pin named "Docs" used to light up for any browser tab that said
 * "docs", and a click then focused that tab. So folders never match by title,
 * and other pins need a whole-word match on a name of at least 4 characters.
 */

const TITLE_MIN = 4;

/** @param {string} s */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `name` appears in `title` as a whole word (case-insensitive).
 * @param {string} title @param {string} name */
export function titleHasWord(title, name) {
  const n = (name || "").trim();
  if (n.length < TITLE_MIN || !title) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, "iu");
  return re.test(title);
}

/** The open windows that belong to a pin (a group collects its children's).
 * @param {any} pin
 * @param {Array<{hwnd: number, title: string, exe?: string}>} wins */
export function windowsFor(pin, wins) {
  if (!pin || pin.kind === "separator" || pin.kind === "trash" || pin.kind === "widget") return [];
  if (pin.kind === "group") {
    const seen = new Set();
    const out = [];
    for (const child of pin.children || []) {
      for (const w of windowsFor(child, wins)) {
        if (seen.has(w.hwnd)) continue;
        seen.add(w.hwnd);
        out.push(w);
      }
    }
    return out;
  }
  const path = (pin.path || "").toLowerCase();
  const exeBase = path.endsWith(".exe") ? path.split(/[\\/]/).pop() : "";
  let matches = exeBase
    ? wins.filter((w) => ((w.exe || "").toLowerCase().split(/[\\/]/).pop() || "") === exeBase)
    : [];
  if (!matches.length && pin.kind !== "folder" && pin.name) {
    matches = wins.filter((w) => titleHasWord(w.title || "", pin.name));
  }
  return matches;
}
