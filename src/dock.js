/* Booki Dock — tile rendering, magnify-on-hover (overflowing the bar),
   pointer reordering, desktop file-drop, auto-hide and live settings. */

import {
  config as configApi,
  dock as dockApi,
  pickAppFile,
  pickFolder,
  pickImageFile,
  onFileDrop,
  onConfigChanged,
  onOcclusion,
  logMessage,
  isTauri,
} from "./api.js";
import { icon } from "./icons.js";
import { isLibIcon, resolveLibIcon } from "./icon-library.js";
import { applyTheme, applyEdge } from "./theme.js";
import { checkForUpdate } from "./update.js";
import { t, setLang } from "./i18n.js";

// Surface any runtime error to the app log (diagnostics on the user's machine).
window.addEventListener("error", (e) => logMessage("error", `dock: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `dock: unhandled ${e.reason}`)
);

const dockEl = document.getElementById("dock");
const ctxMenu = document.getElementById("ctx-menu");
const dropOverlay = document.getElementById("drop-overlay");

let cfg = null;
const iconCache = new Map();
const uid = () => Math.random().toString(36).slice(2, 9);
const isVertical = () => cfg.edge === "left" || cfg.edge === "right";
const baseSize = () => cfg.iconSize || 48;

// ───────────────────────────── Boot ─────────────────────────────

async function boot() {
  try {
    cfg = await configApi.get();
    applyAll();
    await render();
    reframe();
    setupAutoHide();
    setupFileDrop();
    startRunningPoll();
    onConfigChanged(reloadConfig);
    onOcclusion(onOcclusionSignal);
    checkUpdates();
    logMessage("info", `dock booted ok (pinned=${cfg.pinned.length})`);
  } catch (err) {
    logMessage("error", `boot failed: ${err}`);
  }
}

async function reloadConfig() {
  cfg = await configApi.get();
  applyAll();
  await render();
  reframe();
  setupAutoHide();
}

function applyAll() {
  setLang(cfg.language);
  applyTheme(cfg);
  applyEdge(cfg);
  const root = document.documentElement;
  // The bar's frosted material is CSS-only now (no native vibrancy on the dock
  // window — that caused the gray box). Map material strength 0–100 → a sensible
  // alpha range so the bar always reads as a solid-ish frosted panel.
  // CSS-only glass (no native vibrancy on the transparent dock window). Map the
  // material strength to a visible translucency range so the bar reads as a
  // tinted glass panel.
  const mat = (cfg.materialStrength ?? 70) / 100;
  root.style.setProperty("--material", String(Math.max(0.3, Math.min(0.92, 0.3 + mat * 0.6))));
  if (cfg.accent) {
    root.style.setProperty("--accent", cfg.accent);
  }
  dockEl.style.setProperty("--gap", `${cfg.spacing ?? 6}px`);
  document.body.classList.toggle("show-labels", cfg.showLabels !== false);
  document.body.classList.toggle("autohide", hideMode() !== "off");
  // Magnify animation style → easing curve used for the size/lift transitions.
  const style = cfg.magnifyStyle || "spring";
  const ease = style === "smooth" ? "cubic-bezier(0.16,1,0.3,1)" : "cubic-bezier(0.34,1.5,0.5,1)";
  root.style.setProperty("--mag-ease", ease);
}

async function persist() {
  await configApi.save(cfg);
}

// ──────────────────────────── Render ────────────────────────────

async function render() {
  dockEl.innerHTML = "";
  for (const item of cfg.pinned) {
    let tile;
    if (item.kind === "separator") tile = separatorTile(item);
    else if (item.kind === "group") tile = await groupTile(item);
    else tile = await appTile(item);
    dockEl.appendChild(tile);
  }

  // Friendly empty state — the bar stays clean (no +/gear chrome); users add
  // via drag-from-desktop or right-click.
  if (!cfg.pinned.some((p) => p.kind !== "separator")) {
    const hint = document.createElement("button");
    hint.className = "tile hint";
    hint.style.setProperty("--size", `${baseSize()}px`);
    hint.innerHTML =
      `<span class="label">${t("dock.empty")}</span>` +
      `<img src="/brand/svg/isotype.svg" alt="Booki" />`;
    hint.addEventListener("click", onAddApp);
    hint.addEventListener("contextmenu", (e) => openBackgroundMenu(e));
    dockEl.appendChild(hint);
  }

  setAllSizes(baseSize());
}

async function appTile(item) {
  const el = document.createElement("button");
  el.className = "tile";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  // Native OS tooltip — shows the name OUTSIDE the (bar-sized Mica) window with
  // no clipping, the Windows-native way.
  el.title = item.name;

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.name;
  el.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "badge";
  el.appendChild(badge);

  const src = await resolveIcon(item);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = item.name;
    el.appendChild(img);
  } else {
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = (item.name || "?").trim().charAt(0).toUpperCase();
    el.appendChild(glyph);
  }

  // Remove badge — only visible in edit mode.
  const rm = document.createElement("button");
  rm.className = "rm";
  rm.textContent = "×";
  rm.title = "Quitar";
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => {
    e.stopPropagation();
    removeItem(item.id);
  });
  el.appendChild(rm);

  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item));
  return el;
}

// A "folder"/group tile — shows up to four child icons in a mini grid (iOS-style)
// and opens a flyout with its contents on click.
async function groupTile(item) {
  const el = document.createElement("button");
  el.className = "tile group";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  el.title = item.name || "";

  const grid = document.createElement("span");
  grid.className = "group-grid";
  const kids = (item.children || []).slice(0, 4);
  for (const child of kids) {
    const mini = document.createElement("span");
    mini.className = "group-mini";
    const src = await resolveIcon(child);
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      mini.appendChild(img);
    } else {
      mini.textContent = (child.name || "?").trim().charAt(0).toUpperCase();
    }
    grid.appendChild(mini);
  }
  el.appendChild(grid);

  const badge = document.createElement("span");
  badge.className = "badge";
  el.appendChild(badge);

  const rm = document.createElement("button");
  rm.className = "rm";
  rm.textContent = "×";
  rm.title = "Quitar";
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => {
    e.stopPropagation();
    removeItem(item.id);
  });
  el.appendChild(rm);

  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item));
  return el;
}

function separatorTile(item) {
  const el = document.createElement("div");
  el.className = "tile separator";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${Math.round(baseSize() * 0.5)}px`);
  el.innerHTML = `<span class="sep-line"></span>`;
  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item));
  return el;
}

async function resolveIcon(item) {
  if (isLibIcon(item.icon)) return resolveLibIcon(item.icon); // built-in library glyph
  if (item.icon) return item.icon; // custom override (data URI or path-as-uri)
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  const uri = await dockApi.appIcon(item.path);
  iconCache.set(item.path, uri);
  return uri;
}

// ─────────────────────────── Launch ───────────────────────────

function launch(el, item) {
  // Folder pins and groups open a "stack"/folder flyout instead of launching.
  if (item.kind === "folder" || item.kind === "group") {
    toggleStack(el, item);
    return;
  }
  // Launcher + switcher: if the app already has a window, focus it;
  // otherwise launch a new instance.
  const hwnd = el.dataset.hwnd;
  if (el.dataset.running === "true" && hwnd) {
    dockApi.focusWindow(Number(hwnd));
    return;
  }
  el.classList.remove("launching");
  void el.offsetWidth;
  el.classList.add("launching");
  dockApi.launch(item.path, item.args || []);
}

async function onAddApp() {
  const path = await pickAppFile();
  if (!path) return;
  await addPaths([path]);
}

async function onAddFolder() {
  const path = await pickFolder();
  if (!path) return;
  await addPaths([path], "folder");
}

async function addPaths(paths, forceKind) {
  for (const path of paths) {
    let kind = forceKind || "app";
    if (!forceKind) {
      try {
        if (await dockApi.isDir(path)) kind = "folder";
      } catch (_) {}
    }
    cfg.pinned.push({ id: uid(), name: baseName(path), path, args: [], kind });
  }
  await persist();
  await render();
  reframe();
}

function baseName(path) {
  const file = String(path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  return file.replace(/\.(exe|lnk|bat|cmd)$/i, "");
}

// ──────────────────────── Magnify on hover ────────────────────────

function setAllSizes(size) {
  dockEl.querySelectorAll(".tile").forEach((t) => {
    const isSep = t.classList.contains("separator");
    t.style.setProperty("--size", `${isSep ? Math.round(size * 0.5) : size}px`);
    t.style.transform = "";
    t.classList.remove("focus");
  });
}

function resetMagnify() {
  dockEl.querySelectorAll(".tile").forEach((t) => {
    t.style.transform = "";
    t.classList.remove("focus");
  });
}

// Booki magnify — tasteful, CONTAINED scaling. Tiles keep their layout slot and
// scale visually (CSS transform), growing into the bar's edge-side padding so
// nothing overflows the window (no clipping, no resize per frame). The hovered
// tile gets a subtle glow.
function magnify(clientX, clientY) {
  if (cfg.magnification === false || (cfg.magnifyStyle || "spring") === "off") return;
  if (dockEl.classList.contains("dragging") || editMode) return;
  const base = baseSize();
  const maxScale = Math.max(1, cfg.zoom || 1.25);
  const spread = base * 1.5;
  const vertical = isVertical();
  const dr = dockEl.getBoundingClientRect();
  const pointer = vertical ? clientY - dr.top : clientX - dr.left;
  let best = null;
  let bestInf = 0;
  dockEl.querySelectorAll(".tile").forEach((t) => {
    const sep = t.classList.contains("separator");
    const center = vertical
      ? t.offsetTop + t.offsetHeight / 2
      : t.offsetLeft + t.offsetWidth / 2;
    const dist = Math.abs(pointer - center);
    const influence = Math.max(0, 1 - (dist / spread) ** 2);
    const scale = sep ? 1 : 1 + (maxScale - 1) * influence;
    t.style.transform = `scale(${scale.toFixed(3)})`;
    if (!sep && influence > bestInf) {
      bestInf = influence;
      best = t;
    }
  });
  dockEl.querySelectorAll(".tile.focus").forEach((t) => t !== best && t.classList.remove("focus"));
  if (best && bestInf > 0.45) best.classList.add("focus");
}

let magnifyRaf = 0;
dockEl.addEventListener("pointermove", (e) => {
  if (magnifyRaf) return;
  const { clientX, clientY } = e;
  magnifyRaf = requestAnimationFrame(() => {
    magnifyRaf = 0;
    magnify(clientX, clientY);
  });
});
dockEl.addEventListener("pointerleave", resetMagnify);

// ─────────── Edit mode (iOS-style long-press) + reorder ───────────

let editMode = false;
let dragging = false;
let press = null; // { el, item, startX, startY, longTimer, moved }

function enterEdit() {
  if (editMode) return;
  editMode = true;
  document.body.classList.add("edit");
  setAllSizes(baseSize());
}
function exitEdit() {
  if (!editMode) return;
  editMode = false;
  document.body.classList.remove("edit");
}

function onPointerDown(e, el, item) {
  if (e.button !== 0) return;
  press = { el, item, startX: e.clientX, startY: e.clientY, moved: false };
  // Long-press on an app/folder enters edit mode (iOS-style).
  if (item.kind !== "separator" && !editMode) {
    press.longTimer = setTimeout(enterEdit, 550);
  }
  window.addEventListener("pointermove", onPressMove);
  window.addEventListener("pointerup", onPressUp, { once: true });
}

let mergeEl = null; // tile currently armed as a folder (merge) target
let mergeArm = 0; // timestamp hovering the current target's center began

function clearMerge() {
  if (mergeEl) mergeEl.classList.remove("merge-target");
  mergeEl = null;
  mergeArm = 0;
}

function onPressMove(e) {
  if (!press) return;
  const dx = e.clientX - press.startX;
  const dy = e.clientY - press.startY;
  if (!press.moved && Math.hypot(dx, dy) < 6) return;
  press.moved = true;
  clearTimeout(press.longTimer);
  // Direct drag — no edit mode needed (intuitive). A plain click still launches.
  if (press.item.kind === "separator") return;
  if (!dragging) {
    dragging = true;
    dockEl.classList.add("dragging");
    press.el.classList.add("dragging");
  }

  const sibs = [...dockEl.querySelectorAll(".tile[data-id]")].filter((s) => s !== press.el);

  // Hovering the CENTER of another tile → folder (merge) intent. Groups can't be
  // nested, so a group being dragged only reorders.
  const canMerge = press.item.kind !== "group";
  let centerTarget = null;
  if (canMerge) {
    for (const s of sibs) {
      if (s.classList.contains("separator")) continue;
      const r = s.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (Math.hypot(e.clientX - cx, e.clientY - cy) < Math.min(r.width, r.height) * 0.34) {
          centerTarget = s;
        }
        break;
      }
    }
  }

  if (centerTarget) {
    if (mergeEl !== centerTarget) {
      clearMerge();
      mergeEl = centerTarget;
      mergeArm = Date.now();
    }
    if (Date.now() - mergeArm > 260) centerTarget.classList.add("merge-target");
    return; // aiming at a merge → don't reorder
  }

  clearMerge();
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
  dockEl.insertBefore(press.el, ref);
}

async function onPressUp() {
  window.removeEventListener("pointermove", onPressMove);
  const p = press;
  press = null;
  if (!p) return;
  clearTimeout(p.longTimer);
  if (dragging) {
    dragging = false;
    dockEl.classList.remove("dragging");
    p.el.classList.remove("dragging");
    const armed = mergeEl && mergeEl.classList.contains("merge-target") ? mergeEl.dataset.id : null;
    clearMerge();
    if (armed && armed !== p.item.id) {
      await createGroup(p.item.id, armed);
    } else {
      const ids = [...dockEl.querySelectorAll(".tile[data-id]")].map((t) => t.dataset.id);
      cfg.pinned.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      await persist();
      await render();
      reframe();
    }
    return;
  }
  if (!p.moved && !editMode && p.item.kind !== "separator") {
    launch(p.el, p.item);
  }
}

// Cancel an in-progress drag (Escape / lost pointer / pointercancel): drop all
// state and restore the original order — no reorder, no folder created.
async function cancelDrag() {
  if (!press && !dragging) return;
  window.removeEventListener("pointermove", onPressMove);
  const wasDragging = dragging;
  press = null;
  dragging = false;
  clearMerge();
  dockEl.classList.remove("dragging");
  dockEl.querySelectorAll(".tile.dragging").forEach((t) => t.classList.remove("dragging"));
  if (wasDragging) {
    await render(); // rebuild from the unchanged cfg → original order
    reframe();
  }
}
window.addEventListener("pointercancel", cancelDrag);

// Merge a dragged pin onto a target → create a folder/group (or add to one).
async function createGroup(draggedId, targetId) {
  const di = cfg.pinned.findIndex((a) => a.id === draggedId);
  const ti = cfg.pinned.findIndex((a) => a.id === targetId);
  if (di < 0 || ti < 0 || di === ti) return;
  const dragged = cfg.pinned[di];
  const target = cfg.pinned[ti];
  if (target.kind === "group") {
    target.children = target.children || [];
    target.children.push(dragged);
  } else {
    cfg.pinned[ti] = {
      id: uid(),
      name: t("group.new"),
      path: "",
      args: [],
      kind: "group",
      icon: null,
      children: [target, dragged],
    };
  }
  cfg.pinned.splice(di, 1);
  exitEdit();
  await persist();
  await render();
  reframe();
}

// ─── Folder management: rename, ungroup, pull a child out ───
let renameTimer = null;
function renameGroup(group, name) {
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  cfg.pinned[gi].name = name;
  clearTimeout(renameTimer);
  renameTimer = setTimeout(persist, 250);
}

// Dissolve a folder: spill its children back to the dock at its position.
async function ungroup(group) {
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const rest = cfg.pinned[gi].children || [];
  cfg.pinned.splice(gi, 1, ...rest);
  await persist();
  closeStack();
  await render();
  reframe();
}

// Take one item out of a folder → back to the dock (auto-dissolves a folder that
// would be left with a single item). Re-opens the folder if it survives.
async function takeOutChild(group, childId) {
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const grp = cfg.pinned[gi];
  const ci = (grp.children || []).findIndex((c) => c.id === childId);
  if (ci < 0) return;
  const [child] = grp.children.splice(ci, 1);
  cfg.pinned.splice(gi + 1, 0, child);
  let reopenId = grp.id;
  if ((grp.children || []).length < 2) {
    const rest = grp.children || [];
    cfg.pinned.splice(gi, 1, ...rest); // replace the folder with its leftover
    reopenId = null;
  }
  await persist();
  closeStack();
  await render();
  reframe();
  if (reopenId) {
    const tileEl = dockEl.querySelector(`.tile[data-id="${reopenId}"]`);
    const it = cfg.pinned.find((p) => p.id === reopenId);
    if (tileEl && it) toggleStack(tileEl, it);
  }
}

// Exit edit mode by clicking empty space or pressing Escape.
window.addEventListener("pointerdown", (e) => {
  if (editMode && !e.target.closest(".tile")) exitEdit();
});

// ───────────────────────── Context menu ─────────────────────────

function openMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const add = (iconName, text, fn) => {
    const b = document.createElement("button");
    b.innerHTML = `${icon(iconName)}<span>${text}</span>`;
    b.addEventListener("click", async () => {
      closeMenu();
      await fn();
    });
    ctxMenu.appendChild(b);
  };
  const sep = () => {
    const s = document.createElement("div");
    s.className = "sep";
    ctxMenu.appendChild(s);
  };

  if (item.kind !== "separator") {
    add("app", t("m.open"), () => {
      if (item.kind === "folder" || item.kind === "group") {
        const tileEl = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
        if (tileEl) toggleStack(tileEl, item);
      } else {
        dockApi.launch(item.path, item.args || []);
      }
    });
    add("palette", t("m.changeIcon"), () => changeIcon(item));
    if (item.icon) add("x", t("m.removeIcon"), () => clearIcon(item));
    if (item.kind === "group") add("grid", t("group.ungroup"), () => ungroup(item));
    sep();
  }
  add("plus", t("m.addApp"), onAddApp);
  add("app", t("m.addFolder"), onAddFolder);
  add("grid", t("m.addSep"), () => addSeparatorAfter(item.id));
  add("trash", t("m.remove"), () => removeItem(item.id));
  sep();
  add("settings", t("m.settings"), () => dockApi.openSettings());

  placeMenu(e);
}

// Right-click on empty dock area / hint → add + settings.
function openBackgroundMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const add = (iconName, text, fn) => {
    const b = document.createElement("button");
    b.innerHTML = `${icon(iconName)}<span>${text}</span>`;
    b.addEventListener("click", async () => {
      closeMenu();
      await fn();
    });
    ctxMenu.appendChild(b);
  };
  add("plus", t("m.addApp"), onAddApp);
  add("app", t("m.addFolder"), onAddFolder);
  const s = document.createElement("div");
  s.className = "sep";
  ctxMenu.appendChild(s);
  add("settings", t("m.settings"), () => dockApi.openSettings());
  placeMenu(e);
}

function placeMenu(e) {
  // Reveal first so we can measure, then clamp within the window.
  ctxMenu.style.left = "0px";
  ctxMenu.style.top = "0px";
  ctxMenu.classList.remove("hidden");
  const pad = 8;
  const mw = ctxMenu.offsetWidth;
  const mh = ctxMenu.offsetHeight;
  const x = Math.min(e.clientX, window.innerWidth - mw - pad);
  const y = Math.min(e.clientY, window.innerHeight - mh - pad);
  ctxMenu.style.left = `${Math.max(pad, x)}px`;
  ctxMenu.style.top = `${Math.max(pad, y)}px`;
}
function closeMenu() {
  ctxMenu.classList.add("hidden");
}
// Right-click on the bar's empty space (tiles stopPropagation their own menu).
dockEl.addEventListener("contextmenu", openBackgroundMenu);
window.addEventListener("click", closeMenu);
window.addEventListener("blur", closeMenu);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    exitEdit();
    closeStack();
    cancelDrag();
  }
});

async function changeIcon(item) {
  const path = await pickImageFile();
  if (!path) return;
  const uri = (await dockApi.imageDataUri(path)) || path;
  item.icon = uri;
  iconCache.delete(item.path);
  await persist();
  await render();
}
async function clearIcon(item) {
  item.icon = null;
  iconCache.delete(item.path);
  await persist();
  await render();
}
async function addSeparatorAfter(id) {
  const i = cfg.pinned.findIndex((a) => a.id === id);
  const at = i < 0 ? cfg.pinned.length : i + 1;
  cfg.pinned.splice(at, 0, { id: uid(), name: "", path: "", args: [], kind: "separator" });
  await persist();
  await render();
  reframe();
}
async function removeItem(id) {
  cfg.pinned = cfg.pinned.filter((a) => a.id !== id);
  await persist();
  await render();
  reframe();
}

// ─────────────────── Window frame (magnify headroom) ───────────────────

let reframeTimer = null;
function reframe() {
  // Coalesce rapid calls (render + settings changes) into one resize.
  clearTimeout(reframeTimer);
  reframeTimer = setTimeout(
    () => requestAnimationFrame(() => requestAnimationFrame(applyFrame)),
    50
  );
}

let lastFull = null;
function computeFrame() {
  const dpr = window.devicePixelRatio || 1;
  // The window IS the bar (native Mica surface). The magnify scales from each
  // tile's center into the bar's own padding, so nothing overflows the window —
  // the name uses a native OS tooltip instead of an in-page one.
  const r = dockEl.getBoundingClientRect();
  let wCss = r.width + 2;
  let hCss = r.height + 2;
  // Make room for an open folder-stack flyout.
  if (stackOpen && stackEl) {
    const sr = stackEl.getBoundingClientRect();
    hCss += sr.height + 16;
    wCss = Math.max(wCss, sr.width + 32);
  }
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

function applyFrame() {
  const full = computeFrame();
  lastFull = full;
  const dpr = window.devicePixelRatio || 1;
  if (hiddenState) {
    // Shrink to a slim notch strip; pass hidden=true so the backend does NOT
    // record this as the occlusion "home" rect (otherwise smart-hide flaps).
    const strip = Math.ceil(14 * dpr);
    if (isVertical()) dockApi.setDockFrame(cfg.edge, strip, full.h, true);
    else dockApi.setDockFrame(cfg.edge, full.w, strip, true);
  } else {
    dockApi.setDockFrame(cfg.edge, full.w, full.h, false);
  }
}

// ───────────────────────── Auto-hide ─────────────────────────
// Modes: "off" (always visible) · "smart" (hide when a window covers the dock,
// driven by the backend occlusion watcher) · "edge" (hide, reveal on hover).

let hiddenState = false;
let hideTimer = null;
let occluded = false; // last occlusion signal from the backend (smart mode)
let manualReveal = false; // user hovered/clicked the notch → keep shown for now

function hideMode() {
  return cfg.autoHideMode || (cfg.autoHide ? "edge" : "off");
}

function setHidden(v) {
  if (v === hiddenState) return;
  hiddenState = v;
  if (v) {
    document.body.classList.add("hidden");
    setTimeout(() => hiddenState && applyFrame(), 340); // shrink after the slide
  } else {
    applyFrame(); // grow the window back first…
    // …then slide in, but only AFTER the window has actually grown, so the bar
    // never animates inside a still-collapsed window (which looked "cut").
    setTimeout(() => {
      if (!hiddenState) document.body.classList.remove("hidden");
    }, 70);
  }
}

function setupAutoHide() {
  clearTimeout(hideTimer);
  manualReveal = false;
  // edge mode starts hidden; off/smart start shown (smart hides only once the
  // backend reports the dock is actually covered, so on the desktop it stays
  // visible — never flapping).
  hiddenState = hideMode() === "edge";
  document.body.classList.toggle("hidden", hiddenState);
  applyFrame();
}

// Pointer entered the dock / notch → reveal and hold it open.
function reveal() {
  if (hideMode() === "off") return;
  clearTimeout(hideTimer);
  manualReveal = true;
  setHidden(false);
}

// Pointer left → after the delay, hide again if the mode still wants to.
function scheduleHide() {
  const mode = hideMode();
  if (mode === "off" || dragging) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (dragging) return;
    manualReveal = false;
    if (mode === "edge" || (mode === "smart" && occluded)) setHidden(true);
  }, cfg.autoHideDelay ?? 650);
}

// Smart-hide: the backend tells us when a window covers the dock's home area.
// We hide to the notch when covered and reappear when the desktop is clear —
// measured against a stable rect in Rust, so it can no longer flap.
function onOcclusionSignal(value) {
  occluded = value;
  if (hideMode() !== "smart") return;
  if (!value) {
    manualReveal = false;
    setHidden(false); // desktop is clear → always visible
  } else if (!manualReveal) {
    setHidden(true);
  }
}

document.body.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerleave", scheduleHide);

// The notch is a clickable handle to bring the dock back manually.
const revealHandle = document.getElementById("reveal-handle");
if (revealHandle) {
  revealHandle.addEventListener("pointerenter", reveal);
  revealHandle.addEventListener("click", reveal);
}

// ─────────────────── Desktop file drop ───────────────────

function setupFileDrop() {
  onFileDrop({
    onEnter: () => {
      reveal();
      dropOverlay.classList.add("active");
    },
    onLeave: () => dropOverlay.classList.remove("active"),
    onDrop: async (paths) => {
      dropOverlay.classList.remove("active");
      if (paths && paths.length) await addPaths(paths);
    },
  });
}

// ─────────────────── Running-app indicators ───────────────────

let pollTimer = null;
function startRunningPoll() {
  if (!isTauri) return;
  const tick = async () => {
    if (cfg.showIndicators === false) {
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => (t.dataset.running = "false"));
      return;
    }
    try {
      const wins = await dockApi.listWindows();
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => {
        const app = cfg.pinned.find((a) => a.id === t.dataset.id);
        if (!app || app.kind === "separator") return;
        const name = (app.name || "").toLowerCase();
        const matches = name ? wins.filter((w) => w.title.toLowerCase().includes(name)) : [];
        const badge = t.querySelector(".badge");
        if (matches.length) {
          t.dataset.running = "true";
          t.dataset.hwnd = String(matches[0].hwnd);
          if (badge) badge.textContent = matches.length > 1 ? String(matches.length) : "";
        } else {
          t.dataset.running = "false";
          delete t.dataset.hwnd;
          if (badge) badge.textContent = "";
        }
      });
    } catch (_) {
      /* ignore */
    }
  };
  tick();
  pollTimer = setInterval(tick, 4000);
}

// ─────────────────── Folder stacks (flyout) ───────────────────

const stackEl = document.getElementById("stack");
let stackOpen = false;

async function toggleStack(tileEl, item) {
  if (stackOpen) {
    closeStack();
    return;
  }
  const isGroup = item.kind === "group";
  let items = [];
  if (isGroup) {
    items = item.children || [];
  } else {
    try {
      items = await dockApi.listDir(item.path);
    } catch (_) {}
  }
  stackEl.innerHTML = "";
  const head = document.createElement("div");
  head.className = "stack-head";
  if (isGroup) {
    const input = document.createElement("input");
    input.className = "stack-rename";
    input.value = item.name || "";
    input.placeholder = t("group.new");
    input.addEventListener("input", () => renameGroup(item, input.value));
    head.appendChild(input);
    const ung = document.createElement("button");
    ung.className = "stack-ungroup";
    ung.title = t("group.ungroup");
    ung.textContent = "⊟";
    ung.addEventListener("click", () => ungroup(item));
    head.appendChild(ung);
  } else {
    head.textContent = item.name;
  }
  stackEl.appendChild(head);
  const grid = document.createElement("div");
  grid.className = "stack-grid";
  if (!items.length) {
    grid.innerHTML = `<div class="stack-empty">${t("stack.empty")}</div>`;
  }
  for (const it of items) {
    const cell = document.createElement("button");
    cell.className = "stack-item";
    cell.title = it.name;
    const ic = isGroup ? await resolveIcon(it) : await dockApi.appIcon(it.path);
    const isDir = isGroup ? it.kind === "folder" || it.kind === "group" : it.is_dir;
    cell.innerHTML =
      (ic ? `<img src="${ic}" alt="" />` : `<span class="stack-glyph">${isDir ? "📁" : (it.name[0] || "?").toUpperCase()}</span>`) +
      `<span class="stack-name">${it.name}</span>`;
    cell.addEventListener("click", () => {
      if (it.path) dockApi.launch(it.path, it.args || []);
      closeStack();
    });
    if (isGroup) {
      // Pull this item out of the folder (back to the dock).
      const out = document.createElement("span");
      out.className = "stack-rm";
      out.textContent = "×";
      out.title = t("group.takeOut");
      out.addEventListener("click", (ev) => {
        ev.stopPropagation();
        takeOutChild(item, it.id);
      });
      cell.appendChild(out);
    }
    grid.appendChild(cell);
  }
  stackEl.appendChild(grid);

  stackOpen = true;
  document.body.classList.add("stack-open");
  stackEl.classList.remove("hidden");
  reframe();
  // Place the flyout just past the bar, sized to the bar's real geometry (the
  // dock window is tight now, so a hardcoded offset would clip it).
  requestAnimationFrame(() => {
    const dr = dockEl.getBoundingClientRect();
    const gap = 10;
    stackEl.style.left = stackEl.style.right = stackEl.style.top = stackEl.style.bottom = "";
    if (!isVertical()) {
      const r = tileEl.getBoundingClientRect();
      const sw = stackEl.offsetWidth;
      let left = r.left + r.width / 2 - sw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - sw - 8));
      stackEl.style.left = `${left}px`;
      if (cfg.edge === "top") stackEl.style.top = `${dr.height + gap}px`;
      else stackEl.style.bottom = `${dr.height + gap}px`;
    } else {
      const r = tileEl.getBoundingClientRect();
      const sh = stackEl.offsetHeight;
      let top = r.top + r.height / 2 - sh / 2;
      top = Math.max(8, Math.min(top, window.innerHeight - sh - 8));
      stackEl.style.top = `${top}px`;
      if (cfg.edge === "left") stackEl.style.left = `${dr.width + gap}px`;
      else stackEl.style.right = `${dr.width + gap}px`;
    }
  });
}

function closeStack() {
  if (!stackOpen) return;
  stackOpen = false;
  document.body.classList.remove("stack-open");
  stackEl.classList.add("hidden");
  reframe();
}
window.addEventListener("pointerdown", (e) => {
  if (stackOpen && !e.target.closest("#stack") && !e.target.closest(".tile")) closeStack();
});

// ─────────────────── Update check ───────────────────

async function checkUpdates() {
  const pill = document.getElementById("update-pill");
  if (!pill) return;
  const update = await checkForUpdate();
  if (update) {
    pill.textContent = t("dock.update");
    pill.classList.remove("hidden");
    pill.addEventListener("click", () => dockApi.openSettings(), { once: true });
    // Give the notch a notification color/pulse so it's visible even when hidden.
    const handle = document.getElementById("reveal-handle");
    if (handle) handle.classList.add("notify");
  }
}

boot();
