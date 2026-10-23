/* One inward-facing lane for notices. Measure completed content, include the
   magnified tiles, and follow dock motion without an idle polling loop. */
import { S } from './state.js';
import { dockEl, undoToast, liveDockRect } from './dom.js';
import { placeBesideBar, isVerticalEdge } from './placement.js';
import { followFrames } from '../material.js';

let wired = false, queued = false;
const visibleNotices = () => [undoToast, document.getElementById('update-pill')].filter((el) => el && !el.classList.contains('hidden'));
const write = (el, key, value) => { if (el.style[key] !== value) el.style[key] = value; };
function schedule() {
  if (queued || !visibleNotices().length) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; placeDockNotices(); });
}
function wire() {
  if (wired) return;
  wired = true;
  const observer = new ResizeObserver(schedule);
  [dockEl, undoToast, document.getElementById('update-pill')].filter(Boolean).forEach((el) => observer.observe(el));
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  [undoToast, document.getElementById('update-pill')].filter(Boolean).forEach((el) => mutations.observe(el, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true }));
  window.addEventListener('resize', schedule);
  dockEl.addEventListener('pointermove', schedule);
  dockEl.addEventListener('pointerleave', () => { if (visibleNotices().length) followFrames(placeDockNotices, 700); });
  for (const type of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend']) {
    dockEl.addEventListener(type, () => { if (visibleNotices().length) followFrames(placeDockNotices, 700); });
  }
}
export function placeDockNotices() {
  if (!S.cfg || !dockEl) return;
  wire();
  const notices = visibleNotices();
  if (!notices.length) return;
  let anchor = liveDockRect();
  const edge = S.cfg.edge || 'bottom', vertical = isVerticalEdge(edge), gap = 12, pad = 8;
  for (const notice of notices) {
    const room = Math.max(0, (edge === 'left' ? innerWidth - anchor.left - anchor.width : edge === 'right' ? anchor.left : edge === 'top' ? innerHeight - anchor.top - anchor.height : anchor.top) - gap - pad);
    write(notice, 'maxWidth', `${Math.max(0, Math.min(vertical ? room : innerWidth - pad * 2, 520))}px`);
    write(notice, 'maxHeight', `${Math.max(0, Math.min(vertical ? innerHeight - pad * 2 : room, 360))}px`);
    const box = { width: notice.offsetWidth, height: notice.offsetHeight };
    const position = placeBesideBar({ bar: anchor, box, edge, viewport: { width: innerWidth, height: innerHeight }, gap, pad });
    write(notice, 'left', `${position.left}px`); write(notice, 'top', `${position.top}px`);
    // Later notices share the same lane and cannot cover an earlier one.
    anchor = { ...position, ...box };
  }
}
