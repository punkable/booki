/* Changing a group from its open flyout: take members out, reorder, add, ungroup. */

import { dock as dockApi, pickAppFile, pickFolder } from "../api.js";
import { kindForPath, placePin, takeOutOfGroup } from "../pins.js";
import { S } from "./state.js";
import { uid, isVertical, baseName, widgetLabel } from "./helpers.js";
import { dockEl, closestSel, stackEl } from "./dom.js";
import { reframe } from "./frame.js";
import { render } from "./render.js";
import { persist } from "./config-sync.js";
import { openStack, closeStack } from "./stack.js";
import { t } from "../i18n.js";
import { scheduleHitReport } from "./hit-regions.js";
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
    const scroll = stackEl.querySelector(".stack-grid")?.scrollTop || 0;
    closeStack();
    await render();
    reframe();
    const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
    const it = S.cfg.pinned.find((p) => p.id === group.id);
    if (el && it) {
      await openStack(el, it);
      const grid = stackEl.querySelector(".stack-grid");
      if (grid) grid.scrollTop = scroll;
    }
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
function clearOutSlot() {
  dockEl.querySelectorAll(".group-drop-before, .group-drop-after").forEach((tile) => tile.classList.remove("group-drop-before", "group-drop-after"));
}
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

// Let a flyout child be dragged to reorder inside the panel, or dragged out to
// return it to the dock. Pointer-based (no native drag → no stray files).
export function wireStackDragOut(cell, group, child) {
  let st = null;
  // An image's native HTML drag would cancel our pointer capture and erase
  // the custom preview. This gesture moves a Booki shortcut, never a file.
  cell.draggable = false;
  cell.addEventListener("dragstart", (event) => event.preventDefault());
  const onEscape = (event) => { if (event.key === "Escape" && st) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
  const detach = () => { window.removeEventListener("keydown", onEscape, true); window.removeEventListener("blur", cancel); };
  const clearDropHint = () => {
    stackEl.querySelectorAll(".stack-item.drop-before, .stack-item.drop-after")
      .forEach((n) => n.classList.remove("drop-before", "drop-after"));
  };
  cell.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || closestSel(e.target, ".stack-rm, .stack-acts, .stack-act")) return;
    cell._suppressClick = false;
    st = { x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId };
    window.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", cancel);
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
      st.clone = document.createElement("div");
      st.clone.className = "stack-drag-clone group-drag-preview";
      st.clone.setAttribute("aria-hidden", "true");
      st.clone.inert = true;
      const art = document.createElement("span"); art.className = "group-drag-art";
      const original = cell.querySelector("img:not(.emo), .stack-glyph:not(.skel), .w-ring-ico, .w-ico");
      if (original) { const copy = original.cloneNode(true); copy.removeAttribute("id"); copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id")); art.append(copy); }
      else art.textContent = (child.name || child.widget || "?").slice(0, 1).toUpperCase();
      const copy = document.createElement("span"); copy.className = "group-drag-copy";
      const name = document.createElement("strong"); name.textContent = child.name || (child.widget ? widgetLabel(child.widget) : baseName(child.path));
      st.hint = document.createElement("small"); copy.append(name, st.hint);
      st.clone.append(art, copy);
      document.body.appendChild(st.clone);
      scheduleHitReport();
      cell.classList.add("dragging");
    }
    st.pointerY = e.clientY;
    if (!st.scrollFrame) {
      const scroll = () => {
        if (!st?.moved) return;
        const grid = stackEl.querySelector(".stack-grid");
        if (grid && !st.out) {
          const r = grid.getBoundingClientRect();
          const speed = st.pointerY < r.top + 32 ? -6 : st.pointerY > r.bottom - 32 ? 6 : 0;
          if (speed) grid.scrollTop += speed;
        }
        st.scrollFrame = requestAnimationFrame(scroll);
      };
      st.scrollFrame = requestAnimationFrame(scroll);
    }
    st.clone.style.left = `${Math.max(6, Math.min(innerWidth - st.clone.offsetWidth - 6, e.clientX + 14))}px`;
    st.clone.style.top = `${Math.max(6, Math.min(innerHeight - st.clone.offsetHeight - 6, e.clientY + 14))}px`;
    const sr = stackEl.getBoundingClientRect();
    const out =
      e.clientX < sr.left - 8 || e.clientX > sr.right + 8 ||
      e.clientY < sr.top - 8 || e.clientY > sr.bottom + 8;
    if (out !== st.out) {
      st.out = out;
      st.clone.dataset.outside = String(out);
      if (out) { clearDropHint(); if (st.home) { st.reparentAt = performance.now(); glide(() => goHome(st)); try { cell.setPointerCapture(st.pointerId); } catch (_) {} st.home = null; } }
    }
    if (out) {
      st.beforeId = undefined;
      // Over the bar: land where the pointer is, or inside the group under it.
      st.slot = dockDropSlot(e.clientX, e.clientY, group.id);
      const into = st.slot?.groupId ? dockEl.querySelector(`.tile[data-id="${st.slot.groupId}"]`) : null;
      markOutTarget(into); clearOutSlot();
      if (st.slot && !st.slot.groupId) {
        const tiles = [...dockEl.querySelectorAll(".tile[data-id]")];
        const before = tiles.find((tile) => tile.dataset.id === st.slot.beforeId);
        (before || tiles.at(-1))?.classList.add(before ? "group-drop-before" : "group-drop-after");
      }
      const destination = st.slot?.groupId ? S.cfg.pinned.find((pin) => pin.id === st.slot.groupId)?.name : t("tab.dock");
      st.hint.textContent = t("drop.addTo").replace("{name}", () => destination || t("tab.dock"));
      scheduleHitReport();
      return;
    }
    st.slot = null;
    markOutTarget(null); clearOutSlot();
    st.hint.textContent = group.name || t("group.new");
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
    if (!target || performance.now() < (st.settleUntil || 0)) return;
    const r = target.getBoundingClientRect();
    const before = stackEl.querySelector(".stack-grid")?.dataset.view === "list" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
    // The others step aside: the dragged cell itself is the gap, moved in the
    // grid and the rest glide to their new places (FLIP).
    const place = before ? target : target.nextSibling;
    if (place !== cell && cell.nextSibling !== place) {
      if (!st.home) st.home = { parent: cell.parentNode, next: cell.nextSibling };
      st.reparentAt = performance.now();
      glide(() => target.parentNode.insertBefore(cell, place));
      try { cell.setPointerCapture(st.pointerId); } catch (_) {}
      st.settleUntil = performance.now() + 180;
    }
    const next = cell.nextElementSibling?.closest?.("[data-child-id]");
    st.beforeId = next ? next.dataset.childId : null;
  });
  // Animate every sibling from where it was to where the change put it.
  const glide = (change) => {
    const sibs = [...stackEl.querySelectorAll(".stack-item[data-child-id]")].filter((n) => n !== cell);
    const first = new Map(sibs.map((n) => [n, n.getBoundingClientRect()]));
    change();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const n of sibs) {
      const a = first.get(n), b = n.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  };
  const goHome = (s) => { if (s?.home) s.home.parent.insertBefore(cell, s.home.next); };
  const finish = async () => {
    if (!st) return;
    const s = st;
    detach(); clearOutSlot();
    cancelAnimationFrame(s.scrollFrame);
    st = null;
    try { cell.releasePointerCapture(s.pointerId); } catch (_) {}
    cell.classList.remove("dragging");
    clearDropHint();
    // Where the gap ended up is the drop position.
    if (s.home && !s.out) s.beforeId = cell.nextElementSibling?.closest?.("[data-child-id]")?.dataset.childId ?? null;
    if (!s.moved) return;
    cell._suppressClick = true;
    setTimeout(() => { cell._suppressClick = false; }, 0);
    markOutTarget(null);
    if (s.out) {
      s.clone?.remove();
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
  const cancel = () => {
    if (!st) return;
    detach(); clearOutSlot();
    markOutTarget(null);
    const cancelled = st;
    cancelAnimationFrame(cancelled.scrollFrame);
    st = null;
    try { cell.releasePointerCapture(cancelled.pointerId); } catch (_) {}
    cell.classList.remove("dragging");
    cancelled.clone?.remove();
    goHome(cancelled);
    clearDropHint();
    cell._suppressClick = true;
    scheduleHitReport();
  };
  cell.addEventListener("pointercancel", cancel);
  // Moving the cell to open the gap drops pointer capture; take it back.
  cell.addEventListener("lostpointercapture", () => {
    if (st && performance.now() - (st.reparentAt || 0) < 250) { try { cell.setPointerCapture(st.pointerId); return; } catch (_) {} }
    cancel();
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
