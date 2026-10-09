/* Dock hints never resize the native stage or rely on WebView's title popup.
 * Content comes from the current pin and cached app state, not hover-time IPC. */
export function setTileLabel(tile, label) {
  tile.removeAttribute('title');
  tile.setAttribute('aria-label', label || '');
}

export function createDockTooltip(root, { edge, describe, blocked }) {
  const tip = document.createElement('div');
  tip.id = 'booki-dock-tooltip'; tip.className = 'dock-tip';
  tip.setAttribute('role', 'tooltip'); tip.setAttribute('aria-hidden', 'true');
  const name = document.createElement('strong');
  const detail = document.createElement('span'); detail.className = 'dock-tip-detail';
  const mark = document.createElement('span'); mark.className = 'dock-tip-mark'; mark.setAttribute('aria-hidden', 'true');
  const content = document.createElement('span'); content.className = 'dock-tip-content';
  content.append(name, detail); tip.append(mark, content); document.body.append(tip);
  let anchor = null, timer = 0;
  function hide() {
    clearTimeout(timer); timer = 0;
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
    if (source?.src) {
      const img = document.createElement('img'); img.src = source.src; img.alt = ''; mark.append(img);
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
    timer = setTimeout(show, event.type === 'focusin' ? 0 : 340);
  }
  function leave(event) {
    if (anchor && (!event.relatedTarget || !anchor.contains(event.relatedTarget))) hide();
  }
  root.addEventListener('pointerover', enter); root.addEventListener('pointerout', leave);
  root.addEventListener('focusin', enter); root.addEventListener('focusout', leave);
  root.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('contextmenu', hide, true);
  window.addEventListener('blur', hide); window.addEventListener('resize', hide);
  document.addEventListener('visibilitychange', hide);
  // A Settings rerender can replace a hovered tile without pointerout.
  const observer = new MutationObserver(() => { if (anchor && (!anchor.isConnected || blocked())) hide(); });
  observer.observe(root, { childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { hide };
}
