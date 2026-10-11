/* Taskbar-style keyboard movement across the dock.
 *
 * The bar is one Tab stop, like the Windows taskbar: Tab lands on the tile
 * you used last, the arrow keys along the bar move between tiles, and Home and
 * End jump to the ends. Separators are skipped because there is nothing to do
 * on them. Enter, Space and the context-menu keys are handled in dock.js.
 */

const TEXT_ENTRY = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** The tiles the arrow keys can land on, in bar order.
 * @param {Element} root @returns {HTMLElement[]} */
export function rovingTiles(root) {
  return /** @type {HTMLElement[]} */ ([...root.children]).filter(
    (el) => el.classList.contains("tile") && !el.classList.contains("separator") && !el.classList.contains("drag-clone") && !el.hidden
  );
}

/** Where a key moves focus, or -1 when the key is not a bar movement key.
 * @param {string} key @param {number} index @param {number} count @param {boolean} vertical */
export function rovingTarget(key, index, count, vertical) {
  if (count < 1) return -1;
  const back = vertical ? "ArrowUp" : "ArrowLeft";
  const forward = vertical ? "ArrowDown" : "ArrowRight";
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === back) return Math.max(0, index - 1);
  if (key === forward) return Math.min(count - 1, index + 1);
  return -1;
}

const tileKey = (/** @type {HTMLElement} */ el) => el.dataset.id || (el.classList.contains("hint") ? "hint" : "");

/**
 * Wire the roving tab stop onto the dock container.
 * @param {HTMLElement} root
 * @param {{ isVertical: () => boolean, isBusy: () => boolean }} opts
 */
export function installDockKeyboard(root, { isVertical, isBusy }) {
  let currentKey = "";

  function owner(/** @type {EventTarget | null} */ target) {
    if (!(target instanceof Element)) return null;
    const tile = target.closest(".tile");
    return tile && tile.parentElement === root ? /** @type {HTMLElement} */ (tile) : null;
  }

  function activate(/** @type {HTMLElement} */ tile, tiles = rovingTiles(root)) {
    for (const el of tiles) el.tabIndex = el === tile ? 0 : -1;
    currentKey = tileKey(tile);
  }

  /** Re-apply the single tab stop after the bar was rebuilt or re-oriented. */
  function sync() {
    root.setAttribute("aria-orientation", isVertical() ? "vertical" : "horizontal");
    const tiles = rovingTiles(root);
    if (!tiles.length) return;
    const focused = owner(document.activeElement);
    const keep = (focused && tiles.includes(focused) && focused)
      || (currentKey && tiles.find((el) => tileKey(el) === currentKey))
      || tiles[0];
    activate(keep, tiles);
  }

  root.addEventListener("focusin", (e) => {
    const tile = owner(e.target);
    if (tile && !tile.classList.contains("separator")) activate(tile);
  });

  root.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target instanceof Element && e.target.closest(TEXT_ENTRY)) return;
    if (isBusy()) return;
    const tile = owner(e.target);
    if (!tile) return;
    const tiles = rovingTiles(root);
    const index = tiles.indexOf(tile);
    if (index < 0) return;
    const next = rovingTarget(e.key, index, tiles.length, isVertical());
    if (next < 0) return;
    e.preventDefault(); // arrows would otherwise scroll an overflowing bar
    const target = tiles[next];
    activate(target, tiles);
    // focus() also scrolls an overflowing bar to the tile.
    if (target !== document.activeElement) target.focus();
  });

  return { sync };
}
