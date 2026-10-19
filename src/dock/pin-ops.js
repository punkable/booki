/* Adding, renaming, re-iconing and removing pins. */

import { dock as dockApi, pickAppFile, pickFolder, pickImageFile, logMessage } from "../api.js";
import { setTileLabel } from "./tooltip.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { reduceMotion } from "./motion.js";
import { S } from "./state.js";
import { iconCache, uid, findPinnedById, widgetLabel, baseName } from "./helpers.js";
import { dockEl, esc, stackEl } from "./dom.js";
import { reframe } from "./frame.js";
import { scheduleHide } from "./autohide.js";
import { closeMenu } from "./menu-core.js";
import { render } from "./render.js";
import { showUndoToast } from "./undo-toast.js";
import { popButton, showConfirmPop, closeTrashPop, placePop } from "./popovers.js";
import { reloadConfig, persist } from "./config-sync.js";

export async function addWidget(type, { showError = true, style, after } = {}) {
  const pin = { id: uid(), name: widgetLabel(type), path: "", args: [], kind: "widget", widget: type, ...(style ? { style } : {}) };
  // Beside the card it came from (a device's own card), else at the end.
  const at = after ? S.cfg.pinned.findIndex((p) => p.id === after) : -1;
  if (at >= 0) S.cfg.pinned.splice(at + 1, 0, pin); else S.cfg.pinned.push(pin);
  if (!(await persist({}, { showError }))) return false;
  await render();
  reframe();
  return true;
}

export async function onAddApp() {
  const path = await pickAppFile();
  if (!path) return;
  await addPaths([path]);
}

export async function onAddFolder() {
  const path = await pickFolder();
  if (!path) return;
  await addPaths([path], "folder");
}

// The desktop Recycle Bin is a shell namespace item, not a normal folder — its
// path (or a shortcut to it) carries one of these signatures. Pinning it should
// give the Booki trash tile, not a broken folder pin.
function isRecycleBin(path) {
  const p = String(path).toLowerCase();
  return (
    p.includes("645ff040-5081-101b-9f08-00aa002f954e") || // Recycle Bin CLSID
    p.includes("recyclebinfolder") ||
    p.includes("$recycle.bin") ||
    /(^|[\\/])recycle bin\.lnk$/.test(p) ||
    /(^|[\\/])papelera( de reciclaje)?\.lnk$/.test(p)
  );
}

export async function addPaths(paths, forceKind, atIndex = null, { showError = true } = {}) {
  const items = [];
  for (const path of paths) {
    if (isRecycleBin(path)) {
      // Only one trash tile makes sense; if it's already there, skip silently.
      if (!S.cfg.pinned.some((p) => p.kind === "trash")) {
        items.push({ id: uid(), name: t("trash.name"), path: "", args: [], kind: "trash" });
      }
      continue;
    }
    let kind = forceKind || "app";
    if (!forceKind) {
      try {
        if (await dockApi.isDir(path)) kind = "folder";
      } catch (_) {}
    }
    items.push({ id: uid(), name: baseName(path), path, args: [], kind });
  }
  // Land exactly where the insertion gap showed during the drag (null = end).
  if (atIndex == null || atIndex >= S.cfg.pinned.length) S.cfg.pinned.push(...items);
  else S.cfg.pinned.splice(Math.max(0, atIndex), 0, ...items);
  if (!(await persist({}, { showError }))) return false;
  await render();
  reframe();
  return true;
}

// ─── Pin rename / folder management ───
let renameTimer = null;
function pinNameFallback(item) {
  if (!item) return "App";
  if (item.kind === "group") return t("group.new");
  if (item.kind === "trash") return t("trash.name");
  if (item.kind === "widget") return item.name || item.widget || "Widget";
  if (item.kind === "folder") return item.name || baseName(item.path) || t("m.addFolder");
  return item.name || baseName(item.path) || "App";
}
function renamePinnedItem(item, name, { commit = false } = {}) {
  // Pins inside a group are renamed from the flyout, so look beyond the top level.
  const live = findPinnedById(item.id);
  if (!live) return;
  const fallback = pinNameFallback(item);
  const next = String(name || "").trim() || fallback;
  live.name = commit ? next : name;
  item.name = live.name;
  const tile = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
  if (tile) {
    setTileLabel(tile, commit ? next : (name || fallback));
    const lab = tile.querySelector(".label");
    if (lab) lab.textContent = commit ? next : (name || fallback);
  }
  const stackInput = stackEl?.querySelector?.(".stack-rename");
  if (stackInput && S.stackItemId === item.id && document.activeElement !== stackInput) {
    stackInput.value = commit ? next : (name || "");
  }
  clearTimeout(renameTimer);
  if (commit) {
    live.name = next;
    item.name = next;
    persist();
  } else {
    renameTimer = setTimeout(() => {
      const pin = findPinnedById(item.id);
      if (pin) {
        pin.name = String(pin.name || "").trim() || fallback;
        persist();
      }
    }, 400);
  }
}
export function renameGroup(group, name, opts) {
  renamePinnedItem(group, name, opts);
}
/** Inline rename popover from the dock context menu (apps, folders, groups…). */
export function promptRename(item) {
  if (!item || item.kind === "separator") return;
  S.pinnedReveal = true;
  closeMenu();
  closeTrashPop();
  const pop = document.createElement("div");
  pop.className = "trash-pop rename-pop";
  pop.innerHTML = `${icon("pencil")}<span class="tp-col"><span class="tp-text">${esc(t("apps.rename"))}</span></span>`;
  const input = document.createElement("input");
  input.className = "rename-pop-input";
  input.type = "text";
  input.value = item.name || "";
  input.maxLength = 80;
  input.setAttribute("aria-label", t("apps.rename"));
  const finish = (commit) => {
    if (commit) renamePinnedItem(item, input.value, { commit: true });
    closeTrashPop();
    S.pinnedReveal = false;
    scheduleHide();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  const ok = document.createElement("button");
  ok.className = "tp-btn";
  ok.textContent = t("apps.rename");
  ok.addEventListener("click", () => finish(true));
  const cancel = document.createElement("button");
  cancel.className = "tp-btn";
  cancel.textContent = t("trash.cancel");
  cancel.addEventListener("click", () => finish(false));
  pop.appendChild(input);
  pop.appendChild(ok);
  pop.appendChild(cancel);
  S.trashPop = pop;
  placePop(pop);
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

export function confirmShortcutOut(item) {
  closeTrashPop();
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  const hint = document.createElement("span");
  hint.className = "tp-text";
  hint.textContent = t("shortcut.unpinHint");
  pop.appendChild(hint);
  const button = (key, action) => {
    const b = document.createElement("button");
    b.className = "tp-btn";
    b.textContent = t(key);
    b.addEventListener("click", async () => { closeTrashPop(); await action(); });
    pop.appendChild(b);
  };
  button("shortcut.desktop", async () => {
    if (await relocateShortcut(item, true)) await removeItem(item.id);
  });
  button("m.remove", () => removeItem(item.id));
  button("trash.cancel", () => {});
  S.trashPop = pop;
  placePop(pop);
}

export async function relocateShortcut(item, toDesktop) {
  try {
    await dockApi.relocateShortcut(item.id, toDesktop);
    await reloadConfig();
    return true;
  } catch (err) {
    logMessage("error", `shortcut transfer: ${err}`);
    const pop = document.createElement("div");
    pop.className = "trash-pop";
    pop.textContent = t("shortcut.error");
    closeTrashPop();
    S.trashPop = pop;
    placePop(pop);
    return false;
  }
}

/** Two-step confirm before deleting a whole group (children would go with it). */
export function confirmRemoveGroup(item) {
  S.pinnedReveal = true;
  const n = (item.children || []).length;
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  const name = esc(item.name || t("group.new"));
  pop.innerHTML =
    `${icon("trash")}<span class="tp-col"><span class="tp-text">${t("group.removeAsk").replace("{name}", () => name).replace("{n}", String(n))}</span>` +
    `<span class="tp-sub">${t("group.removeSub")}</span></span>`;
  popButton(pop, "danger", t("apps.remove"), async () => {
    closeTrashPop();
    await removeItem(item.id);
    S.pinnedReveal = false;
    scheduleHide();
  });
  popButton(pop, "", t("trash.cancel"), () => {
    closeTrashPop();
    S.pinnedReveal = false;
    scheduleHide();
  });
  showConfirmPop(pop);
}

export async function changeIcon(item) {
  const path = await pickImageFile();
  if (!path) return;
  const uri = (await dockApi.imageDataUri(path)) || path;
  // The picker can stay open while a reload replaces cfg; edit the live pin.
  const live = findPinnedById(item.id);
  if (!live) return;
  live.icon = uri;
  iconCache.delete(item.path);
  if (!(await persist())) return;
  await render();
}
export async function clearIcon(item) {
  const live = findPinnedById(item.id);
  if (!live) return;
  live.icon = null;
  iconCache.delete(item.path);
  if (!(await persist())) return;
  await render();
}
export async function addSeparatorAfter(id) {
  const i = S.cfg.pinned.findIndex((a) => a.id === id);
  const at = i < 0 ? S.cfg.pinned.length : i + 1;
  S.cfg.pinned.splice(at, 0, { id: uid(), name: "", path: "", args: [], kind: "separator" });
  if (!(await persist())) return;
  await render();
  reframe();
}
export async function removeItem(id) {
  const index = S.cfg.pinned.findIndex((a) => a.id === id);
  const removed = index >= 0 ? S.cfg.pinned[index] : null;
  if (!removed) return;
  // Play a quick fade+scale-out on the tile before the re-render swaps it away.
  const el = dockEl.querySelector(`.tile[data-id="${id}"]`);
  if (el && !reduceMotion()) {
    el.classList.add("tile-out");
    await new Promise((r) => setTimeout(r, 170));
  }
  S.cfg.pinned = S.cfg.pinned.filter((a) => a.id !== id);
  if (!(await persist())) return;
  await render();
  reframe();
  showUndoToast(removed, index);
}

// Open files with an app and remember them as recents (a small jump list).
export async function openWith(item, paths) {
  for (const p of paths) dockApi.launch(item.path, [p]);
  const i = S.cfg.pinned.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const cur = S.cfg.pinned[i].recents || [];
    S.cfg.pinned[i].recents = [...paths, ...cur.filter((r) => !paths.includes(r))].slice(0, 8);
    await persist();
  }
}
