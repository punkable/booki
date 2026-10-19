/* The toast beside the bar: undo a removal, or report a failure. */

import { t } from "../i18n.js";
import { placeBesideBar } from "./placement.js";
import { S } from "./state.js";
import { baseName } from "./helpers.js";
import { dockEl, undoToast, esc } from "./dom.js";
import { reframe } from "./frame.js";
import { render } from "./render.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireUndoToast(fns) { Object.assign(deps, fns); }

let undoRemoval = null;
let undoRemovalTimer = null;

export function hideUndoToast() {
  clearTimeout(undoRemovalTimer);
  undoRemovalTimer = null;
  undoRemoval = null;
  undoToast?.classList.add("hidden");
  if (undoToast) undoToast.innerHTML = "";
}

export function placeUndoToast() {
  if (!S.cfg || !undoToast || undoToast.classList.contains("hidden")) return;
  const { left, top } = placeBesideBar({
    bar: dockEl.getBoundingClientRect(),
    box: { width: undoToast.offsetWidth, height: undoToast.offsetHeight },
    edge: S.cfg.edge, viewport: { width: innerWidth, height: innerHeight }, gap: 12,
  });
  undoToast.style.left = `${left}px`; undoToast.style.top = `${top}px`;
}

export function showUndoToast(item, index) {
  if (!undoToast) return;
  clearTimeout(undoRemovalTimer);
  // Remember the neighbour too: a reorder in between must not shift the spot.
  undoRemoval = { item: structuredClone(item), index, afterId: S.cfg?.pinned[index - 1]?.id ?? null };
  undoToast.innerHTML = `<span>${esc(item.name || baseName(item.path || "Booki"))}</span><button type="button">${esc(t("act.undo"))}</button>`;
  undoToast.classList.remove("hidden");
  placeUndoToast();
  undoToast.querySelector("button")?.addEventListener("click", undoLastRemoval, { once: true });
  undoRemovalTimer = setTimeout(hideUndoToast, 5000);
}

/** A short failure notice in the same toast the save error uses. */
export function showErrorToast(message) {
  if (!undoToast) return;
  hideUndoToast();
  undoToast.innerHTML = `<span>${esc(message)}</span>`;
  undoToast.classList.remove("hidden");
  placeUndoToast();
  undoRemovalTimer = setTimeout(hideUndoToast, 5000);
}

async function undoLastRemoval() {
  if (!undoRemoval || !S.cfg) return;
  const { item, index, afterId } = undoRemoval;
  hideUndoToast();
  if (S.cfg.pinned.some((entry) => entry.id === item.id)) return;
  const after = afterId ? S.cfg.pinned.findIndex((entry) => entry.id === afterId) : -1;
  const at = afterId === null ? 0 : after >= 0 ? after + 1 : Math.min(index, S.cfg.pinned.length);
  S.cfg.pinned.splice(at, 0, item);
  if (!(await deps.persist())) return;
  await render();
  reframe();
}

/** A short notice beside the bar (download finished, battery low). */
export function showNoticeToast(title, detail = "") {
  if (!undoToast) return;
  hideUndoToast();
  undoToast.innerHTML = `<span class="notice-copy"><strong>${esc(title)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</span>`;
  undoToast.classList.remove("hidden");
  placeUndoToast();
  undoRemovalTimer = setTimeout(hideUndoToast, 4000);
}
