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
import { applyTheme, applyEdge } from "./theme.js";
import { checkForUpdate } from "./update.js";

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
    onOcclusion((occluded) => {
      if (hideMode() === "smart") setHidden(occluded);
    });
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
  applyTheme(cfg);
  applyEdge(cfg);
  const root = document.documentElement;
  root.style.setProperty("--material", String(cfg.opacity ?? 0.55));
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
    dockEl.appendChild(
      item.kind === "separator" ? separatorTile(item) : await appTile(item)
    );
  }

  // Friendly empty state — the bar stays clean (no +/gear chrome); users add
  // via drag-from-desktop or right-click.
  if (!cfg.pinned.some((p) => p.kind !== "separator")) {
    const hint = document.createElement("button");
    hint.className = "tile hint";
    hint.style.setProperty("--size", `${baseSize()}px`);
    hint.innerHTML =
      `<span class="label">Arrastra apps o carpetas aquí · clic derecho para añadir</span>` +
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
  if (item.icon) return item.icon; // custom override (data URI or path-as-uri)
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  const uri = await dockApi.appIcon(item.path);
  iconCache.set(item.path, uri);
  return uri;
}

// ─────────────────────────── Launch ───────────────────────────

function launch(el, item) {
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
    t.classList.remove("focus");
  });
}

// Booki magnify — a focused spring "pop": the hovered tile pops up with a
// lift + glow while neighbours grow only gently (tighter falloff than the
// classic macOS ripple).
function magnify(clientX, clientY) {
  if (cfg.magnification === false || (cfg.magnifyStyle || "spring") === "off") return;
  if (dockEl.classList.contains("dragging") || editMode) return;
  const base = baseSize();
  const max = base * (cfg.zoom || 1.8);
  const spread = base * 1.25; // tight → concentrated pop, not a wide ripple
  const vertical = isVertical();
  let best = null;
  let bestInf = 0;
  dockEl.querySelectorAll(".tile").forEach((t) => {
    const sep = t.classList.contains("separator");
    const b = sep ? base * 0.5 : base;
    const m = sep ? base * 0.5 : max;
    const r = t.getBoundingClientRect();
    const center = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
    const pointer = vertical ? clientY : clientX;
    const dist = Math.abs(pointer - center);
    const influence = Math.max(0, 1 - (dist / spread) ** 2);
    t.style.setProperty("--size", `${b + (m - b) * influence}px`);
    if (!sep && influence > bestInf) {
      bestInf = influence;
      best = t;
    }
  });
  dockEl.querySelectorAll(".tile.focus").forEach((t) => t !== best && t.classList.remove("focus"));
  if (best && bestInf > 0.4) best.classList.add("focus");
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
dockEl.addEventListener("pointerleave", () => setAllSizes(baseSize()));

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

function onPressMove(e) {
  if (!press) return;
  const dx = e.clientX - press.startX;
  const dy = e.clientY - press.startY;
  if (!press.moved && Math.hypot(dx, dy) < 6) return;
  press.moved = true;
  clearTimeout(press.longTimer);
  if (!editMode) return; // only reorder while editing
  if (!dragging) {
    dragging = true;
    dockEl.classList.add("dragging");
    press.el.classList.add("dragging");
  }
  const vertical = isVertical();
  const pointer = vertical ? e.clientY : e.clientX;
  const sibs = [...dockEl.querySelectorAll(".tile[data-id]")].filter((t) => t !== press.el);
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
    const ids = [...dockEl.querySelectorAll(".tile[data-id]")].map((t) => t.dataset.id);
    cfg.pinned.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    await persist();
    await render();
    reframe();
    return;
  }
  if (!p.moved && !editMode && p.item.kind !== "separator") {
    launch(p.el, p.item);
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
    add("app", "Abrir", () => dockApi.launch(item.path, item.args || []));
    add("palette", "Cambiar icono…", () => changeIcon(item));
    if (item.icon) add("x", "Quitar icono personalizado", () => clearIcon(item));
    sep();
  }
  add("plus", "Añadir app…", onAddApp);
  add("app", "Añadir carpeta…", onAddFolder);
  add("grid", "Añadir separador", () => addSeparatorAfter(item.id));
  add("trash", "Quitar del dock", () => removeItem(item.id));
  sep();
  add("settings", "Ajustes…", () => dockApi.openSettings());

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
  add("plus", "Añadir app…", onAddApp);
  add("app", "Añadir carpeta…", onAddFolder);
  const s = document.createElement("div");
  s.className = "sep";
  ctxMenu.appendChild(s);
  add("settings", "Ajustes…", () => dockApi.openSettings());
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
  const r = dockEl.getBoundingClientRect();
  const base = baseSize();
  const max = base * (cfg.magnification ? cfg.zoom || 1.8 : 1);
  const grow = max - base;
  const labelSpace = cfg.showLabels !== false ? 36 : 10;
  let wCss, hCss;
  if (isVertical()) {
    wCss = r.width + grow + labelSpace + 28;
    hCss = r.height + grow + 28;
  } else {
    wCss = r.width + grow * 2 + 56;
    hCss = r.height + grow + labelSpace + 20;
  }
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

function applyFrame() {
  const full = computeFrame();
  lastFull = full;
  const dpr = window.devicePixelRatio || 1;
  if (hiddenState) {
    const strip = Math.ceil(8 * dpr);
    if (isVertical()) dockApi.setDockFrame(cfg.edge, strip, full.h);
    else dockApi.setDockFrame(cfg.edge, full.w, strip);
  } else {
    dockApi.setDockFrame(cfg.edge, full.w, full.h);
  }
}

// ───────────────────────── Auto-hide ─────────────────────────
// Modes: "off" (always visible) · "smart" (hide when a window covers the dock,
// driven by the backend occlusion watcher) · "edge" (hide, reveal on hover).

let hiddenState = false;
let hideTimer = null;

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
    applyFrame(); // grow first…
    requestAnimationFrame(() => document.body.classList.remove("hidden")); // …then slide in
  }
}

function setupAutoHide() {
  clearTimeout(hideTimer);
  hiddenState = hideMode() === "edge"; // edge starts hidden; off/smart start shown
  document.body.classList.toggle("hidden", hiddenState);
  applyFrame();
}

function reveal() {
  if (hideMode() === "off") return;
  clearTimeout(hideTimer);
  setHidden(false);
}
function scheduleHide() {
  if (hideMode() !== "edge" || dragging) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => !dragging && setHidden(true), cfg.autoHideDelay ?? 650);
}

document.body.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerleave", scheduleHide);

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

// ─────────────────── Update check ───────────────────

async function checkUpdates() {
  const pill = document.getElementById("update-pill");
  if (!pill) return;
  const update = await checkForUpdate();
  if (update) {
    pill.classList.remove("hidden");
    pill.addEventListener("click", () => dockApi.openSettings(), { once: true });
  }
}

boot();
