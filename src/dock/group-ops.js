/* Changing a group from its open flyout: take members out, reorder, add, ungroup. */

import { dock as dockApi, pickAppFile, pickFolder } from "../api.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { kindForPath, placePin, takeOutOfGroup } from "../pins.js";
import { S } from "./state.js";
import { uid, isVertical, widgetLabel, baseName } from "./helpers.js";
import { dockEl, closestSel, stackEl } from "./dom.js";
import { reframe } from "./frame.js";
import { render } from "./render.js";
import { persist } from "./config-sync.js";
import { openStack, closeStack } from "./stack.js";
import { mergeTargetAt } from "./edit-reorder.js";

// Dissolve a folder: spill its children back to the dock at its position.
export async function ungroup(group) {
  const gi = S.cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const rest = S.cfg.pinned[gi].children || [];
  S.cfg.pinned.splice(gi, 1, ...rest);
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
}

// Move one member back to the dock and reopen its preserved group.
export async function takeOutChild(group, childId) {
  const { pinned, reopenId } = takeOutOfGroup(S.cfg.pinned, group.id, childId);
  S.cfg.pinned = pinned;
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
  if (reopenId) {
    const tileEl = dockEl.querySelector(`.tile[data-id="${reopenId}"]`);
    const it = S.cfg.pinned.find((p) => p.id === reopenId);
    if (tileEl && it) openStack(tileEl, it);
  }
}

/** Reorder a child inside its group and reopen the flyout. */
async function reorderGroupChild(group, childId, beforeId) {
  const gi = S.cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const kids = [...(S.cfg.pinned[gi].children || [])];
  const from = kids.findIndex((c) => c.id === childId);
  if (from < 0) return;
  const [moved] = kids.splice(from, 1);
  let to = beforeId ? kids.findIndex((c) => c.id === beforeId) : kids.length;
  if (to < 0) to = kids.length;
  kids.splice(to, 0, moved);
  S.cfg.pinned[gi].children = kids;
  // Keep flyout open across persist so smart-hide can't tuck mid-reorder.
  S.pinnedReveal = true;
  try {
    if (!(await persist())) return;
    closeStack();
    await render();
    reframe();
    const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
    const it = S.cfg.pinned.find((p) => p.id === group.id);
    if (el && it) await openStack(el, it);
  } finally {
    S.pinnedReveal = false;
  }
}

/* Where a member dragged out of a group's panel would land on the bar: inside
   another group whose tile is under the pointer, or before the tile under it.
   Null when the pointer is nowhere near the bar (the member then goes back
   right after its own group, as before). */
function dockDropSlot(x, y, fromGroupId) {
  const bar = dockEl.getBoundingClientRect();
  const pad = 28;
  if (x < bar.left - pad || x > bar.right + pad || y < bar.top - pad || y > bar.bottom + pad) return null;
  const tiles = [...dockEl.querySelectorAll(".tile[data-id]")];
  const target = mergeTargetAt(tiles, x, y);
  if (target && target.dataset.id !== fromGroupId && S.cfg.pinned.find((p) => p.id === target.dataset.id)?.kind === "group") {
    return { groupId: target.dataset.id };
  }
  const vertical = isVertical();
  const pointer = vertical ? y : x;
  const ref = tiles.find((tile) => {
    const r = tile.getBoundingClientRect();
    return pointer < (vertical ? r.top + r.height / 2 : r.left + r.width / 2);
  });
  return { beforeId: ref ? ref.dataset.id : null };
}

let outTargetEl = null;
function markOutTarget(el) {
  if (outTargetEl === el) return;
  outTargetEl?.classList.remove("merge-target");
  outTargetEl = el;
  el?.classList.add("merge-target");
}

/** Move a member out of its group to a spot on the bar or into another group. */
async function moveChildTo(group, child, slot) {
  const next = placePin(S.cfg.pinned, child, slot.groupId ? { groupId: slot.groupId } : { beforeId: slot.beforeId || undefined });
  if (next === S.cfg.pinned) return;
  S.cfg.pinned = next;
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
}

/** The hover control that takes a child out of its group, back onto the dock. */
export function takeOutButton(group, child) {
  const out = document.createElement("button");
  out.type = "button";
  out.className = "stack-rm";
  out.innerHTML = icon("take-out");
  out.title = t("group.takeOut");
  out.setAttribute("aria-label", `${t("group.takeOut")}: ${child.name || widgetLabel(child.widget)}`);
  out.addEventListener("click", (ev) => { ev.stopPropagation(); takeOutChild(group, child.id); });
  return out;
}

// Let a flyout child be dragged to reorder inside the panel, or dragged out to
// return it to the dock. Pointer-based (no native drag → no stray files).
export function wireStackDragOut(cell, group, child) {
  let st = null;
  const clearDropHint = () => {
    stackEl.querySelectorAll(".stack-item.drop-before, .stack-item.drop-after")
      .forEach((n) => n.classList.remove("drop-before", "drop-after"));
  };
  cell.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || closestSel(e.target, ".stack-rm, .stack-acts, .stack-act")) return;
    st = { x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId };
    try {
      cell.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  cell.addEventListener("pointermove", (e) => {
    if (!st) return;
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 8) return;
    if (!st.moved) {
      st.moved = true;
      try { cell.setPointerCapture(st.pointerId); } catch (_) {}
      const r = cell.getBoundingClientRect();
      st.clone = cell.cloneNode(true);
      st.clone.className = "stack-item stack-drag-clone";
      st.clone.style.width = `${r.width}px`;
      st.clone.style.height = `${r.height}px`;
      st.gx = e.clientX - r.left;
      st.gy = e.clientY - r.top;
      document.body.appendChild(st.clone);
      cell.classList.add("dragging");
    }
    st.clone.style.left = `${e.clientX - st.gx}px`;
    st.clone.style.top = `${e.clientY - st.gy}px`;
    const sr = stackEl.getBoundingClientRect();
    const out =
      e.clientX < sr.left - 8 || e.clientX > sr.right + 8 ||
      e.clientY < sr.top - 8 || e.clientY > sr.bottom + 8;
    if (out !== st.out) {
      st.out = out;
      st.clone.classList.toggle("will-unpin", out);
      if (out) clearDropHint();
    }
    if (out) {
      st.beforeId = undefined;
      // Over the bar: land where the pointer is, or inside the group under it.
      st.slot = dockDropSlot(e.clientX, e.clientY, group.id);
      const into = st.slot?.groupId ? dockEl.querySelector(`.tile[data-id="${st.slot.groupId}"]`) : null;
      markOutTarget(into);
      st.clone.classList.toggle("will-unpin", !st.slot);
      return;
    }
    st.slot = null;
    markOutTarget(null);
    clearDropHint();
    // undefined = no target under the pointer (no reorder); null = append.
    st.beforeId = undefined;
    const sibs = [...stackEl.querySelectorAll(".stack-item[data-child-id]")].filter((n) => n !== cell);
    let target = null;
    for (const s of sibs) {
      const r = s.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        target = s;
        break;
      }
    }
    if (!target) return;
    const r = target.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    target.classList.add(before ? "drop-before" : "drop-after");
    const tid = target.dataset.childId;
    if (before) st.beforeId = tid;
    else {
      const kids = group.children || [];
      const idx = kids.findIndex((c) => c.id === tid);
      st.beforeId = idx >= 0 && idx + 1 < kids.length ? kids[idx + 1].id : null;
    }
  });
  const finish = async () => {
    if (!st) return;
    const s = st;
    st = null;
    try { cell.releasePointerCapture(s.pointerId); } catch (_) {}
    cell.classList.remove("dragging");
    clearDropHint();
    if (!s.moved) return;
    cell._suppressClick = true;
    setTimeout(() => { cell._suppressClick = false; }, 0);
    markOutTarget(null);
    if (s.out) {
      if (s.clone) {
        const c = s.clone;
        c.classList.add("poof");
        setTimeout(() => c.remove(), 280);
      }
      if (s.slot) await moveChildTo(group, child, s.slot);
      else await takeOutChild(group, child.id);
    } else if (s.beforeId !== undefined && s.beforeId !== child.id) {
      if (s.clone) s.clone.remove();
      const kids = group.children || [];
      const from = kids.findIndex((c) => c.id === child.id);
      const to = s.beforeId ? kids.findIndex((c) => c.id === s.beforeId) : kids.length;
      if (from >= 0 && to !== from && to !== from + 1) {
        await reorderGroupChild(group, child.id, s.beforeId);
      }
    } else if (s.clone) {
      s.clone.remove();
    }
  };
  cell.addEventListener("pointerup", finish);
  cell.addEventListener("pointercancel", () => {
    if (!st) return;
    markOutTarget(null);
    const cancelled = st;
    st = null;
    try { cell.releasePointerCapture(cancelled.pointerId); } catch (_) {}
    cell.classList.remove("dragging");
    cancelled.clone?.remove();
    clearDropHint();
    cell._suppressClick = true;
    setTimeout(() => { cell._suppressClick = false; }, 0);
  });
}

// Add an app or folder into a group from its open flyout, then reopen it so
// you can keep adding several in a row.
export async function addToFolderFromDock(group, preferKind = "app") {
  const path = preferKind === "folder" ? await pickFolder() : await pickAppFile();
  if (!path) return;
  const gi = S.cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const kind =
    preferKind === "folder"
      ? "folder"
      : await kindForPath(path, (p) => dockApi.isDir(p));
  S.cfg.pinned[gi].children = [
    ...(S.cfg.pinned[gi].children || []),
    { id: uid(), name: baseName(path), path, args: [], kind },
  ];
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
  const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
  const it = S.cfg.pinned.find((p) => p.id === group.id);
  if (el && it) openStack(el, it);
}
