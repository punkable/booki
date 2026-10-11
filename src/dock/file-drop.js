/* Files dragged in from Explorer: drop targets, the insertion gap and the hint. */

import { onFileDrop, dock as dockApi } from "../api.js";
import { kindForPath } from "../pins.js";
import { t } from "../i18n.js";
import { S } from "./state.js";
import { uid, isVertical, baseName, menuPinTitle } from "./helpers.js";
import { dockEl, dropOverlay } from "./dom.js";
import { reframe } from "./frame.js";
import { setHidden, scheduleHide } from "./autohide.js";
import { render } from "./render.js";
import { confirmTrash, confirmMove } from "./popovers.js";
import { persist } from "./config-sync.js";
import { addPaths, openWith } from "./pin-ops.js";

// ─────────────────── Desktop file drop ───────────────────

// Where would a dropped file land? Aiming at the CENTER of a tile that accepts
// drops (app = open-with, folder = move, group = pin inside, trash = delete)
// targets that tile; anywhere else is an INSERTION between tiles — the bar
// opens a visible gap there so pinning is deliberate and grouping can't happen
// by accident (the reported "se mete en un grupo sin querer").
function dropSpot(position) {
  if (!position) return { target: null, index: null };
  const dpr = window.devicePixelRatio || 1;
  const x = position.x / dpr;
  const y = position.y / dpr;
  const el = document.elementFromPoint(x, y);
  const tile = el ? el.closest(".tile[data-id]") : null;
  if (tile) {
    const item = S.cfg.pinned.find((p) => p.id === tile.dataset.id);
    const k = item && item.kind;
    if (k === "app" || k === "folder" || k === "group" || k === "trash") {
      const r = tile.getBoundingClientRect();
      // A group takes most of its tile, across the whole bar: filing a file
      // into a group is the common intent and should not need a bullseye.
      const m = k === "group" ? 0.16 : 0.24;
      const vertical = isVertical();
      const along = vertical ? (y - r.top) / r.height : (x - r.left) / r.width;
      const across = vertical ? (x - r.left) / r.width : (y - r.top) / r.height;
      const crossM = k === "group" ? 0 : 0.24;
      if (along > m && along < 1 - m && across > crossM && across < 1 - crossM) return { target: tile, index: null };
    }
  }
  const vertical = isVertical();
  const p = vertical ? y : x;
  const tiles = [...dockEl.querySelectorAll(".tile[data-id]")];
  let idx = tiles.length;
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
    if (p < mid) { idx = i; break; }
  }
  return { target: null, index: idx };
}

// The visible insertion gap: the tile at the insertion index slides aside.
let dropGap = null; // { el, cls }
function setDropGap(index) {
  const tiles = [...dockEl.querySelectorAll(".tile[data-id]")];
  let el = null, cls = "drop-gap-before";
  if (index != null && tiles.length) {
    if (index < tiles.length) { el = tiles[index]; }
    else { el = tiles[tiles.length - 1]; cls = "drop-gap-after"; }
  }
  if (dropGap && (dropGap.el !== el || dropGap.cls !== cls)) {
    dropGap.el.classList.remove(dropGap.cls);
    dropGap = null;
  }
  if (el && !dropGap) {
    el.classList.add(cls);
    dropGap = { el, cls };
  }
}

// While files are dragged over the dock, a small label says what letting go
// will do — open with, move to, add to, trash, or pin — so a drop is never a
// guess.
const dropHintEl = document.createElement("div");
dropHintEl.className = "drop-hint";
dropHintEl.setAttribute("role", "status");
document.body.appendChild(dropHintEl);
function dropHintText(spot) {
  const item = spot.target && S.cfg.pinned.find((p) => p.id === spot.target.dataset.id);
  const name = item ? menuPinTitle(item) : "";
  if (item?.kind === "app") return t("drop.openWith").replace("{name}", () => name);
  if (item?.kind === "folder") return t("drop.moveTo").replace("{name}", () => name);
  if (item?.kind === "group") return t("drop.addTo").replace("{name}", () => name);
  if (item?.kind === "trash") return t("drop.trash");
  return t("drop.pin");
}
function showDropHint(spot) {
  if (!spot) {
    placeHint(null);
    return;
  }
  // Anchor on the target tile, or on the tile the gap opens beside.
  const tiles = [...dockEl.querySelectorAll(".tile[data-id]")];
  placeHint(dropHintText(spot), spot.target || tiles[Math.min(spot.index ?? tiles.length, tiles.length - 1)] || dockEl);
}
/** Show `text` in the hint pill beside the bar, lined up with `anchor`; null hides it. */
export function placeHint(text, anchor) {
  if (!text) {
    dropHintEl.classList.remove("show");
    return;
  }
  if (dropHintEl.textContent !== text) dropHintEl.textContent = text;
  const a = anchor.getBoundingClientRect();
  const bar = dockEl.getBoundingClientRect();
  const w = dropHintEl.offsetWidth;
  const h = dropHintEl.offsetHeight;
  const gap = 10;
  let left;
  let top;
  if (isVertical()) {
    top = a.top + a.height / 2 - h / 2;
    left = S.cfg.edge === "left" ? bar.right + gap : bar.left - w - gap;
  } else {
    left = a.left + a.width / 2 - w / 2;
    top = S.cfg.edge === "top" ? bar.bottom + gap : bar.top - h - gap;
  }
  dropHintEl.style.left = `${Math.max(6, Math.min(left, window.innerWidth - w - 6))}px`;
  dropHintEl.style.top = `${Math.max(6, Math.min(top, window.innerHeight - h - 6))}px`;
  dropHintEl.classList.add("show");
}

let dropTargetEl = null;
function setDropTarget(el) {
  // Only highlight tiles that actually accept a dropped file: apps (open with),
  // folders/groups (move/pin in) and the trash. Widgets/separators don't react.
  if (el) {
    const item = S.cfg.pinned.find((p) => p.id === el.dataset.id);
    const kind = item && item.kind;
    if (kind !== "app" && kind !== "folder" && kind !== "group" && kind !== "trash") {
      el = null;
    }
  }
  if (dropTargetEl === el) return;
  if (dropTargetEl) dropTargetEl.classList.remove("drop-target");
  dropTargetEl = el;
  if (el) el.classList.add("drop-target");
}

export function setupFileDrop() {
  onFileDrop({
    onEnter: () => {
      // A file drag is aimed at the dock: force it open and PIN it open for the
      // whole drag (smart-hide would otherwise tuck it away mid-drag, since
      // dragging from Explorer counts as "working in another app").
      S.draggingFile = true;
      S.pinnedReveal = true;
      clearTimeout(S.hideTimer);
      setHidden(false);
      dropOverlay.classList.add("active");
    },
    onOver: (position) => {
      const spot = dropSpot(position);
      setDropTarget(spot.target);
      setDropGap(spot.target ? null : spot.index);
      showDropHint(spot);
    },
    onLeave: () => {
      S.draggingFile = false;
      S.pinnedReveal = false;
      dropOverlay.classList.remove("active");
      setDropTarget(null);
      setDropGap(null);
      showDropHint(null);
      scheduleHide();
    },
    onDrop: async (paths, position) => {
      S.draggingFile = false;
      S.pinnedReveal = false;
      dropOverlay.classList.remove("active");
      const spot = dropSpot(position);
      const target = spot.target;
      setDropTarget(null);
      setDropGap(null);
      showDropHint(null);
      if (!paths || !paths.length) return;
      // Dropped onto an app icon → open the files with that app.
      const item = target && S.cfg.pinned.find((p) => p.id === target.dataset.id);
      if (item && item.kind === "app") {
        await openWith(item, paths);
        return;
      }
      // Dropped onto the trash pin → confirm, then send to the Recycle Bin.
      if (item && item.kind === "trash") {
        confirmTrash(paths);
        return;
      }
      // Dropped onto a real folder pin → confirm, then MOVE the files there.
      if (item && item.kind === "folder") {
        confirmMove(paths, item);
        return;
      }
      // Dropped onto a dock folder (group) → pin the files inside it.
      if (item && item.kind === "group") {
        for (const pth of paths) {
          item.children = item.children || [];
          item.children.push({
            id: uid(),
            name: baseName(pth).replace(/\.lnk$/i, ""),
            path: pth,
            args: [],
            kind: await kindForPath(pth, (p) => dockApi.isDir(p)),
          });
        }
        if (!(await persist())) return;
        await render();
        reframe();
        return;
      }
      // Otherwise pin them exactly where the gap showed.
      await addPaths(paths, null, spot.index);
    },
  });
}
