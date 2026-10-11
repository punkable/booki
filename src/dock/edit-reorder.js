/* Edit mode, dragging tiles to reorder, group or unpin them. */

import { isTauri } from "../api.js";
import { t } from "../i18n.js";
import { placeBesideBar } from "./placement.js";
import { canMergeKind, mergePins } from "../pins.js";
import { S } from "./state.js";
import { isVertical, baseSize, menuPinTitle } from "./helpers.js";
import { dockEl } from "./dom.js";
import { scheduleHitReport } from "./hit-regions.js";
import { setAllSizes } from "./magnify.js";
import { reframe, applyFrame } from "./frame.js";
import { render } from "./render.js";
import { persist } from "./config-sync.js";
import { confirmShortcutOut, removeItem } from "./pin-ops.js";
import { launchModifiers, launch } from "./launch.js";
import { placeHint } from "./file-drop.js";

// ─────────── Edit mode (iOS-style long-press) + reorder ───────────

export function enterEdit() {
  if (S.editMode) return;
  S.editMode = true;
  document.body.classList.add("edit");
  const toolbar = document.createElement("div"); toolbar.className = "edit-toolbar";
  const label = document.createElement("span"); label.textContent = t("overhaul.editing");
  const done = document.createElement("button"); done.type = "button"; done.textContent = t("w.done"); done.addEventListener("click", exitEdit);
  toolbar.append(label, done); document.body.appendChild(toolbar);
  S.pinnedReveal = true; applyFrame();
  requestAnimationFrame(() => {
    const pos = placeBesideBar({ bar: dockEl.getBoundingClientRect(), box: { width: toolbar.offsetWidth, height: toolbar.offsetHeight }, edge: S.cfg.edge, viewport: { width: innerWidth, height: innerHeight } });
    toolbar.style.left = `${pos.left}px`; toolbar.style.top = `${pos.top}px`; scheduleHitReport();
  });
  setAllSizes(baseSize());
}
export function exitEdit() {
  if (!S.editMode) return;
  S.editMode = false;
  document.body.classList.remove("edit");
  document.querySelector(".edit-toolbar")?.remove();
  S.pinnedReveal = false; reframe();
}

export function onPointerDown(e, el, item) {
  if (e.button !== 0) return;
  S.press = { el, item, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
  // Long-press on an app/folder enters edit mode (iOS-style).
  if (item.kind !== "separator" && !S.editMode) {
    S.press.longTimer = setTimeout(enterEdit, 550);
  }
  window.addEventListener("pointermove", onPressMove);
  window.addEventListener("pointerup", onPressUp, { once: true });
}

let mergeEl = null; // tile currently armed as a folder (merge) target
let mergeArm = 0; // timestamp hovering the current target's center began
let dragClone = null; // floating copy of the tile that follows the pointer
let willUnpin = false; // pointer pulled far from the bar → release = unpin

let mergeArmTimer = null;
const MERGE_ARM_MS = 160;

function clearMerge() {
  clearTimeout(mergeArmTimer);
  if (mergeEl) mergeEl.classList.remove("merge-target");
  mergeEl = null;
  mergeArm = 0;
}

/* Which tile, if any, the pointer is asking to group with.
 *
 * The target is the tile's middle band along the bar, across the bar's whole
 * thickness, so the pointer does not have to sit on a small bullseye. Groups
 * take a wider band than apps because adding to one is the common intent.
 * The armed tile keeps a wider band still, so the small wobble of a hand
 * holding still does not drop it and reorder the bar under the pointer. */
export function mergeTargetAt(sibs, x, y) {
  const vertical = isVertical();
  for (const s of sibs) {
    if (s.classList.contains("separator") || s.classList.contains("trash")) continue;
    const r = s.getBoundingClientRect();
    const along = vertical ? (y - r.top) / (r.height || 1) : (x - r.left) / (r.width || 1);
    const across = vertical ? x : y;
    const lo = vertical ? r.left : r.top;
    const hi = vertical ? r.right : r.bottom;
    if (along < 0 || along > 1 || across < lo - 18 || across > hi + 18) continue;
    const isGroup = s.classList.contains("group") || S.cfg.pinned.find((p) => p.id === s.dataset.id)?.kind === "group";
    const margin = s === mergeEl ? 0.1 : isGroup ? 0.18 : 0.26;
    return along >= margin && along <= 1 - margin ? s : null;
  }
  return null;
}

function killClone() {
  if (dragClone) dragClone.remove();
  dragClone = null;
  willUnpin = false;
  placeHint(null);
}

// Distance from the pointer to the bar, measured AWAY from the anchored edge.
function pullDistance(e) {
  const r = dockEl.getBoundingClientRect();
  if (S.cfg.edge === "top") return e.clientY - r.bottom;
  if (S.cfg.edge === "left") return e.clientX - r.right;
  if (S.cfg.edge === "right") return r.left - e.clientX;
  return r.top - e.clientY;
}

// Coalesce pointer moves to one per animation frame: the drag does layout reads
// (rects) + FLIP reordering, so running it per raw event would thrash at 144Hz.
let pressMoveRaf = 0;
let pressMoveEv = null;
function onPressMove(e) {
  pressMoveEv = e;
  if (pressMoveRaf) return;
  pressMoveRaf = requestAnimationFrame(() => {
    pressMoveRaf = 0;
    if (S.press && pressMoveEv) processMove(pressMoveEv);
  });
}
function processMove(e) {
  if (!S.press) return;
  const dx = e.clientX - S.press.startX;
  const dy = e.clientY - S.press.startY;
  if (!S.press.moved && Math.hypot(dx, dy) < 6) return;
  S.press.moved = true;
  clearTimeout(S.press.longTimer);
  // Direct drag — no edit mode needed (intuitive). A plain click still launches.
  if (S.press.item.kind === "separator") return;
  if (!S.dragging) {
    S.dragging = true;
    dockEl.classList.add("dragging");
    S.press.el.classList.add("dragging");
    // Capture the pointer so moves keep firing even once the cursor leaves the
    // dock's small window — otherwise the "pull far out to unpin" gesture could
    // never reach its threshold with a mouse (mice get no implicit capture).
    try { S.press.el.setPointerCapture(S.press.pointerId); } catch (_) {}
    // A floating copy follows the pointer; the real tile stays as a ghost slot,
    // so you SEE what you're moving instead of it teleporting between slots.
    const r = S.press.el.getBoundingClientRect();
    dragClone = S.press.el.cloneNode(true);
    dragClone.className = "tile drag-clone";
    dragClone.style.width = `${r.width}px`;
    dragClone.style.height = `${r.height}px`;
    S.press.grabX = e.clientX - r.left;
    S.press.grabY = e.clientY - r.top;
    document.body.appendChild(dragClone);
  }
  if (dragClone) {
    dragClone.style.left = `${e.clientX - S.press.grabX}px`;
    dragClone.style.top = `${e.clientY - S.press.grabY}px`;
  }

  // Pulled clearly out of the bar's window → dropping here
  // unpins (macOS-style). Reachable now that the pointer is captured.
  const pulling = pullDistance(e) > 64;
  if (pulling !== willUnpin) {
    willUnpin = pulling;
    if (dragClone) dragClone.classList.toggle("will-unpin", willUnpin);
    S.press.el.classList.toggle("unpin-slot", willUnpin);
  }
  if (willUnpin) {
    clearMerge();
    placeHint(/\.lnk$/i.test(S.press.item.path || "") ? t("shortcut.unpinHint") : t("m.remove"), S.press.el);
    return; // no reordering/merging while aiming outside the bar
  }

  const sibs = [...dockEl.querySelectorAll(".tile[data-id]")].filter((s) => s !== S.press.el);

  // Hovering the middle of another tile → group (merge) intent. Apps and
  // widgets can both be grouped (widgets go live only inside the group).
  // Separators, the trash tile and groups-into-groups never form a group.
  const centerTarget = canMergeKind(S.press.item.kind) ? mergeTargetAt(sibs, e.clientX, e.clientY) : null;

  if (centerTarget) {
    if (mergeEl !== centerTarget) {
      clearMerge();
      mergeEl = centerTarget;
      mergeArm = Date.now();
    }
    // Dropping into an existing group is safe to arm at once; making a new
    // group waits a beat so a quick pass while reordering never does it.
    const into = S.cfg.pinned.find((p) => p.id === centerTarget.dataset.id);
    if (into?.kind === "group" || Date.now() - mergeArm > MERGE_ARM_MS) {
      centerTarget.classList.add("merge-target");
      placeHint(
        into?.kind === "group" ? t("drop.addTo").replace("{name}", () => menuPinTitle(into)) : t("drag.makeGroup"),
        centerTarget
      );
    } else {
      // Re-check once the hold time has passed even if the pointer rests.
      clearTimeout(mergeArmTimer);
      mergeArmTimer = setTimeout(() => { if (S.press && pressMoveEv && mergeEl === centerTarget) processMove(pressMoveEv); }, MERGE_ARM_MS + 20);
    }
    return; // aiming at the middle → hold for a merge, don't reorder
  }

  clearMerge();
  placeHint(null);
  // Reorder: place the dragged tile before the sibling under the pointer.
  const vertical = isVertical();
  const pointer = vertical ? e.clientY : e.clientX;
  let ref = null;
  for (const s of sibs) {
    const r = s.getBoundingClientRect();
    const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
    if (pointer < mid) {
      ref = s;
      break;
    }
  }
  // Skip if it's already in place (avoids resetting the FLIP transition).
  if (S.press.el.nextElementSibling === ref) return;
  flipReorder(() => dockEl.insertBefore(S.press.el, ref));
}

// FLIP: animate the OTHER tiles sliding to their new slots when the dragged tile
// is reinserted, so reordering reads as a smooth shuffle (not an instant jump).
function flipReorder(mutate) {
  const tiles = [...dockEl.querySelectorAll(".tile")];
  const first = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
  mutate();
  for (const t of tiles) {
    if (t === S.press?.el) continue; // the dragged tile follows the pointer itself
    const a = first.get(t);
    const b = t.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (!dx && !dy) continue;
    t.style.transition = "none";
    t.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      t.style.transition = "transform 0.2s var(--ease)";
      t.style.transform = "";
    });
  }
}

async function onPressUp(e) {
  window.removeEventListener("pointermove", onPressMove);
  cancelAnimationFrame(pressMoveRaf);
  pressMoveRaf = 0;
  const p = S.press;
  S.press = null;
  placeHint(null);
  if (!p) return;
  clearTimeout(p.longTimer);
  try { p.el.releasePointerCapture(p.pointerId); } catch (_) {}
  if (S.dragging) {
    S.dragging = false;
    dockEl.classList.remove("dragging");
    p.el.classList.remove("dragging");
    p.el.classList.remove("unpin-slot");
    const armed = mergeEl && mergeEl.classList.contains("merge-target") ? mergeEl.dataset.id : null;
    clearMerge();
    // Released far from the bar → unpin with a little poof.
    if (willUnpin) {
      if (dragClone) {
        const c = dragClone;
        dragClone = null;
        c.classList.add("poof");
        setTimeout(() => c.remove(), 280);
      }
      willUnpin = false;
      if (isTauri && /\.lnk$/i.test(p.item.path || "")) confirmShortcutOut(p.item);
      else await removeItem(p.item.id);
      return;
    }
    // Settle the floating copy into the tile's final slot, then drop it.
    if (dragClone) {
      const c = dragClone;
      dragClone = null;
      const r = p.el.getBoundingClientRect();
      c.style.transition = "left 0.16s var(--ease), top 0.16s var(--ease), opacity 0.16s ease";
      c.style.left = `${r.left}px`;
      c.style.top = `${r.top}px`;
      c.style.opacity = "0";
      setTimeout(() => c.remove(), 180);
    }
    if (armed && armed !== p.item.id) {
      await createGroup(p.item.id, armed);
    } else {
      const idToIndex = new Map([...dockEl.querySelectorAll(".tile[data-id]")].map((t, i) => [t.dataset.id, i]));
      S.cfg.pinned.sort((a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0));
      if (!(await persist())) return;
      await render();
      reframe();
    }
    return;
  }
  if (!p.moved && !S.editMode && p.item.kind !== "separator") {
    launch(p.el, p.item, launchModifiers(e));
  }
}

// Cancel an in-progress drag (Escape / lost pointer / pointercancel): drop all
// state and restore the original order — no reorder, no folder created.
export async function cancelDrag() {
  if (!S.press && !S.dragging) return;
  window.removeEventListener("pointermove", onPressMove);
  window.removeEventListener("pointerup", onPressUp);
  cancelAnimationFrame(pressMoveRaf);
  pressMoveRaf = 0;
  // A cancelled long-press must not switch on edit mode a moment later.
  clearTimeout(S.press?.longTimer);
  if (S.press) { try { S.press.el.releasePointerCapture(S.press.pointerId); } catch (_) {} }
  const wasDragging = S.dragging;
  S.press = null;
  S.dragging = false;
  clearMerge();
  killClone();
  dockEl.classList.remove("dragging");
  dockEl.querySelectorAll(".tile.dragging, .tile.unpin-slot").forEach((t) =>
    t.classList.remove("dragging", "unpin-slot"));
  if (wasDragging) {
    await render(); // rebuild from the unchanged cfg → original order
    reframe();
  }
}

// Merge a dragged pin onto a target → create a group (or add to one).
async function createGroup(draggedId, targetId) {
  const next = mergePins(S.cfg.pinned, draggedId, targetId, t("group.new"));
  if (next === S.cfg.pinned) return;
  S.cfg.pinned = next;
  exitEdit();
  if (!(await persist())) return;
  await render();
  reframe();
}
