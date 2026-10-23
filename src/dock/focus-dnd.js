/* Focus ⇄ Windows "Do not disturb".

   While a focus timer runs, Booki turns Do not disturb on (only if it was
   off) and turns it back off when the block ends, is paused or reset. Rust
   remembers that Booki owns the DND, so it is also undone at exit and at the
   next start. The other direction is a low-frequency read of the Windows
   state, so a DND the user turns on by hand shows on the Focus card. */
import { invoke } from "../api.js";

const MAX_DELAY = 2 ** 31 - 1;
let lastPinned = [];
let engaged = false; // Booki switched DND on for the running block
let started = false; // the startup restore has run
let windowsDnd = null; // last read of the Windows state (null = unknown)
let queue = Promise.resolve();
let endTimer = null;
let lastRead = 0;
const listeners = new Set();

function focusPins(items = [], out = []) {
  for (const item of items || []) {
    if (item.kind === "widget" && item.widget === "focus") out.push(item);
    if (item.children) focusPins(item.children, out);
  }
  return out;
}

/** Pure: what the running focus blocks want right now. */
export function focusSession(pinned, now = Date.now()) {
  const running = focusPins(pinned).filter((item) => Number(item.style?.endsAt) > now);
  return {
    running: running.length > 0,
    dnd: running.some((item) => item.style?.dnd === true),
    tuck: running.some((item) => !!item.style?.tuckDuringFocus),
    endsAt: running.reduce((min, item) => Math.min(min, Number(item.style.endsAt)), Infinity),
  };
}

export const isFocusing = () => focusSession(lastPinned).running;
export const focusTuckWanted = () => focusSession(lastPinned).tuck;
export const dndActive = () => windowsDnd === true || engaged;
/** Repaint hooks (the Focus card, held notices, the tuck policy). */
export function onFocusDndChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() { for (const fn of listeners) { try { fn(); } catch (_) { /* a listener never breaks the sync */ } } }

async function apply() {
  const want = focusSession(lastPinned);
  if (!started) {
    started = true;
    // A DND Booki left behind (crash, restart) with no block running now.
    if (!want.dnd) { try { await invoke("dnd_restore"); } catch (_) { /* no backend */ } }
  }
  if (want.dnd && !engaged) {
    let current = null;
    try { current = await invoke("dnd_state"); } catch (_) { current = null; }
    if (current === false) {
      try { engaged = !!(await invoke("set_dnd", { on: true })); } catch (_) { engaged = false; }
      if (engaged) windowsDnd = true;
    } else if (typeof current === "boolean") windowsDnd = current;
  } else if (!want.dnd && engaged) {
    engaged = false;
    try { await invoke("set_dnd", { on: false }); windowsDnd = false; } catch (_) { /* Rust retries at exit */ }
  }
  changed();
}

/** Re-sync with the pinned focus timers; resolves once Windows is in step. */
export function syncFocusDnd(pinned = lastPinned) {
  lastPinned = pinned || [];
  clearTimeout(endTimer);
  const { endsAt } = focusSession(lastPinned);
  if (Number.isFinite(endsAt)) {
    const delay = endsAt - Date.now();
    if (delay > 0 && delay <= MAX_DELAY) endTimer = setTimeout(() => syncFocusDnd(), delay + 5);
  }
  queue = queue.then(apply, apply);
  return queue;
}

/** Low-frequency read of the Windows state (the user's own toggle). */
export async function pollDnd(minInterval = 10000) {
  const now = Date.now();
  if (now - lastRead < minInterval) return windowsDnd;
  lastRead = now;
  let value = null;
  try { value = await invoke("dnd_state"); } catch (_) { value = null; }
  // A temporary read failure does not mean the user's quiet mode ended.
  if (typeof value !== "boolean") return windowsDnd;
  const next = value;
  if (next !== windowsDnd) { windowsDnd = next; changed(); }
  return windowsDnd;
}
