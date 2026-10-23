/* Dock hints never resize the native stage or rely on WebView's title popup.
 * Content comes from the current pin and cached app state, not hover-time IPC. */
export function setTileLabel(tile, label) {
  // Widgets relabel on every tick; skip unchanged writes so the dock's
  // MutationObserver is not woken for nothing.
  if (tile.hasAttribute('title')) tile.removeAttribute('title');
  const next = label || '';
  if (tile.getAttribute('aria-label') !== next) tile.setAttribute('aria-label', next);
}

export function createDockTooltip(root, { edge, describe, blocked, dismiss = (action) => action(), preserve = () => false }) {
  const tip = document.createElement('div');
  tip.id = 'booki-dock-tooltip'; tip.className = 'dock-tip';
  tip.setAttribute('role', 'tooltip'); tip.setAttribute('aria-hidden', 'true');
  const name = document.createElement('strong');
  const detail = document.createElement('span'); detail.className = 'dock-tip-detail';
  const mark = document.createElement('span'); mark.className = 'dock-tip-mark'; mark.setAttribute('aria-hidden', 'true');
  const content = document.createElement('span'); content.className = 'dock-tip-content';
  content.append(name, detail); tip.append(mark, content); document.body.append(tip);
  let anchor = null, timer = 0;
  let warmUntil = 0;
  function hide() {
    clearTimeout(timer); timer = 0;
    if (tip.classList.contains('show')) warmUntil = performance.now() + 500;
    if (anchor) {
      delete anchor.dataset.hintOpen;
      const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    anchor = null; tip.classList.remove('show'); tip.setAttribute('aria-hidden', 'true');
  }
  function position() {
    if (!anchor?.isConnected || blocked()) { hide(); return; }
    const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 10;
    let x = r.left + (r.width - w) / 2, y = r.top - h - gap;
    if (edge() === 'top') y = r.bottom + gap;
    if (edge() === 'left') { x = r.right + gap; y = r.top + (r.height - h) / 2; }
    if (edge() === 'right') { x = r.left - w - gap; y = r.top + (r.height - h) / 2; }
    // Long names and edge-most pins always stay inside the fixed stage.
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function show() {
    if (!anchor?.isConnected || blocked()) { hide(); return; }
    const info = describe(anchor);
    if (!info?.name) { hide(); return; }
    name.textContent = info.name; detail.textContent = info.detail || ''; detail.hidden = !info.detail;
    mark.replaceChildren();
    const source = anchor.querySelector('img');
    const fallback = anchor.querySelector(':scope > .glyph.fallback');
    if (source?.src) {
      const img = document.createElement('img'); img.src = source.src; img.alt = ''; mark.append(img);
    } else if (fallback) {
      mark.append(fallback.cloneNode(true));
    } else {
      const svg = [...anchor.querySelectorAll('svg')].find(element => !element.closest('.rm, .w-controls, .w-media-controls'));
      if (svg) mark.append(svg.cloneNode(true)); else mark.textContent = info.name.slice(0, 1);
    }
    position(); if (!anchor) return;
    const ids = new Set((anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)); ids.add(tip.id);
    anchor.setAttribute('aria-describedby', [...ids].join(' '));
    anchor.dataset.hintOpen = 'true';
    tip.setAttribute('aria-hidden', 'false'); tip.classList.add('show');
  }
  function enter(event) {
    const tile = event.target.closest?.('.tile[data-id]');
    if (!tile || !root.contains(tile) || tile.classList.contains('separator') || blocked() || tile === anchor) return;
    hide(); anchor = tile;
    // Like the taskbar: the first hint waits for a deliberate hover; while
    // one was just open, sliding to the next tile shows its hint at once.
    const warm = performance.now() < warmUntil;
    timer = setTimeout(show, event.type === 'focusin' ? 0 : warm ? 40 : 400);
  }
  function leave(event) {
    if (preserve()) return;
    const previous = anchor;
    if (anchor && (!event.relatedTarget || !anchor.contains(event.relatedTarget))) dismiss(() => { if (anchor === previous && !anchor?.matches(":hover")) hide(); });
  }
  // A click opens the tile's panel or flyout; the hint makes way at once.
  root.addEventListener('pointerdown', hide);
  root.addEventListener('pointerover', enter); root.addEventListener('pointerout', leave);
  root.addEventListener('focusin', enter); root.addEventListener('focusout', leave);
  root.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('contextmenu', hide, true);
  window.addEventListener('blur', () => dismiss(() => { if (!document.hasFocus()) hide(); })); window.addEventListener('resize', hide);
  document.addEventListener('visibilitychange', hide);
  // A Settings rerender can replace a hovered tile without pointerout.
  const observer = new MutationObserver(() => { if (anchor && (!anchor.isConnected || blocked())) hide(); });
  observer.observe(root, { childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { hide };
}
