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
  onReveal,
  onFullscreen,
  emitConfigChanged,
  logMessage,
  isTauri,
} from "./api.js";
import { icon } from "./icons.js";
import { isLibIcon, resolveLibIcon } from "./icon-library.js";
import { applyTheme, applyEdge } from "./theme.js";
import { checkForUpdate } from "./update.js";
import { t, setLang, curLang } from "./i18n.js";

// Surface any runtime error to the app log (diagnostics on the user's machine).
window.addEventListener("error", (e) => logMessage("error", `dock: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `dock: unhandled ${e.reason}`)
);

const dockEl = document.getElementById("dock");
const ctxMenu = document.getElementById("ctx-menu");
const dropOverlay = document.getElementById("drop-overlay");

// Safe .closest() — pointer/keyboard targets can be non-Element (document/window),
// which would throw "closest is not a function".
const closestSel = (target, sel) => (target && target.closest ? target.closest(sel) : null);

// Escape user-controlled text (file/app names) before it goes into innerHTML —
// a file literally named "<img onerror=…>.txt" must render as text, not run.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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
    startWidgetPoll();
    startMediaPoll();
    onConfigChanged(reloadConfig);
    onOcclusion(onOcclusionSignal);
    onFullscreen(onFullscreenSignal);
    checkUpdates();
    checkChangelog();
    maybeOnboard();
    logMessage("info", `dock booted ok (pinned=${cfg.pinned.length})`);
  } catch (err) {
    logMessage("error", `boot failed: ${err}`);
  }
}

async function reloadConfig() {
  const prev = cfg;
  cfg = await configApi.get();
  applyAll();
  // Only rebuild the bar when the pinned items actually changed — sliders and
  // toggles in Settings shouldn't make the whole dock flash.
  const pinsChanged = !prev || JSON.stringify(prev.pinned) !== JSON.stringify(cfg.pinned);
  if (pinsChanged) {
    await render();
    startWidgetPoll();
    startMediaPoll();
  } else {
    fitDock(); // size/spacing may still have changed
  }
  reframe();
  // Re-arming auto-hide resets the shown/hidden state; only do it when the
  // behavior actually changed, so unrelated tweaks can't blink the dock.
  const hideChanged =
    !prev ||
    prev.edge !== cfg.edge ||
    (prev.autoHideMode || "") !== (cfg.autoHideMode || "") ||
    prev.notchPeek !== cfg.notchPeek ||
    prev.notchPosition !== cfg.notchPosition;
  if (hideChanged) setupAutoHide();
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
  // Tile/corner roundness (user-tunable). Drives tile, group and folder radii;
  // the dock's own outer corner is a touch rounder so it frames the tiles.
  const cr = cfg.cornerRadius ?? 12;
  root.style.setProperty("--tile-r", `${cr}px`);
  root.style.setProperty("--dock-r", `${cr + 8}px`);
  document.body.classList.toggle("show-labels", cfg.showLabels !== false);
  document.body.classList.toggle("autohide", hideMode() !== "off");
  // Magnify animation style → easing curve used for the size/lift transitions.
  const style = cfg.magnifyStyle || "spring";
  const ease = style === "smooth" ? "cubic-bezier(0.16,1,0.3,1)" : "cubic-bezier(0.34,1.5,0.5,1)";
  root.style.setProperty("--mag-ease", ease);
  // Genie minimize: aim the collapse at wherever the notch sits along the edge.
  const ox = { start: 16.6, end: 83.4 }[cfg.notchPosition] ?? 50;
  root.style.setProperty("--genie-ox", `${ox}%`);
  root.style.setProperty("--genie-oxn", `${ox}`);
}

async function persist() {
  await configApi.save(cfg);
}

// ──────────────────────────── Render ────────────────────────────

async function render() {
  // Build every tile in parallel and swap the whole bar in ONE DOM operation —
  // no icons popping in one by one, no empty-bar flash between renders.
  const tiles = await Promise.all(
    cfg.pinned.map((item) => {
      if (item.kind === "separator") return separatorTile(item);
      if (item.kind === "group") return groupTile(item);
      if (item.kind === "widget") return widgetTile(item);
      if (item.kind === "trash") return trashTile(item);
      return appTile(item);
    })
  );
  dockEl.replaceChildren(...tiles);

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

  fitDock();
}

// Never let the dock clip: if its natural length exceeds the usable screen
// length on the anchored axis, shrink the icon size to fit (macOS-style), so any
// number of items always fits inside the window.
function fitDock() {
  setAllSizes(baseSize());
  const usable =
    (isVertical() ? window.screen.availHeight : window.screen.availWidth) - SHADOW_PAD * 2 - 28;
  const natural = isVertical() ? dockEl.scrollHeight : dockEl.scrollWidth;
  if (usable > 0 && natural > usable) {
    const eff = Math.max(20, Math.floor(baseSize() * (usable / natural)));
    setAllSizes(eff);
  }
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

// Recycle Bin pin: drop files on it to delete (with an in-dock confirmation);
// click opens the bin. The icon tints when the bin has items in it.
function trashTile(item) {
  const el = document.createElement("button");
  el.className = "tile trash";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  el.title = t("trash.name");
  el.innerHTML =
    `<span class="label">${t("trash.name")}</span>` +
    `<span class="trash-glyph">${icon("trash")}</span>`;
  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item));
  refreshTrashState(el);
  return el;
}

async function refreshTrashState(el) {
  const tile = el || dockEl.querySelector(".tile.trash");
  if (!tile) return;
  const empty = await dockApi.trashIsEmpty().catch(() => true);
  tile.classList.toggle("full", !empty);
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

// ───────────────────────────── Widgets ─────────────────────────────
// macOS-style "cards" living in the dock: a live clock, CPU%, RAM% and network
// throughput. Cheap by design — stats only poll while the dock is visible.

const WIDGETS = ["clock", "cpu", "ram", "disk", "net", "uptime", "battery", "notes", "media"];
const WIDGET_ICONS = {
  clock: "🕒", cpu: "🧠", ram: "🧊", disk: "💾", net: "📶", uptime: "⏱️", battery: "🔋", notes: "📝", media: "🎵",
};
const WIDGET_VARIANTS = ["glass", "solid", "gradient", "outline", "minimal"];
const STAT_WIDGETS = ["cpu", "ram", "disk", "net", "uptime", "battery"];

function widgetLabel(type) {
  return (
    {
      clock: t("w.clock"), cpu: "CPU", ram: "RAM", disk: t("w.disk"),
      net: t("w.net"), uptime: t("w.uptime"), battery: t("w.battery"), notes: t("w.notes"),
      media: t("w.media"),
    }[type] || type
  );
}

function widgetTile(item) {
  const type = item.widget || "clock";
  const st = item.style || {};
  const el = document.createElement("button");
  el.className = "tile widget";
  el.dataset.id = item.id;
  el.dataset.widget = type;
  el.dataset.variant = st.variant || "glass";
  if (st.color) el.style.setProperty("--w-accent", st.color);
  if (st.animated) el.classList.add("animated");
  if (st.icon === false) el.classList.add("no-ico");
  el.style.setProperty("--size", `${baseSize()}px`);
  el.title = widgetLabel(type);

  const card = document.createElement("span");
  card.className = "w-card";
  card.innerHTML =
    `<span class="w-ico">${WIDGET_ICONS[type] || "▦"}</span>` +
    `<span class="w-main">` +
    `<span class="w-label"></span>` +
    `<span class="w-value">…</span>` +
    `<span class="w-bar"><i></i></span>` +
    `</span>`;
  el.appendChild(card);

  const rm = document.createElement("button");
  rm.className = "rm";
  rm.textContent = "×";
  rm.title = t("apps.remove");
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => {
    e.stopPropagation();
    removeItem(item.id);
  });
  el.appendChild(rm);

  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item));
  if (type === "media") {
    el.classList.add("media");
    const art = document.createElement("img");
    art.className = "w-art";
    art.alt = "";
    card.prepend(art);
    el.querySelector(".w-label").textContent = t("w.media");
    el.querySelector(".w-value").textContent = "—";
    el.querySelector(".w-bar").style.display = "none";
    // Hover controls: previous · play/pause · next (click on the card itself
    // still toggles play/pause).
    const controls = document.createElement("span");
    controls.className = "w-controls";
    const mkCtl = (label, glyph, fn) => {
      const b = document.createElement("button");
      b.className = "w-ctl";
      b.title = label;
      b.textContent = glyph;
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        await fn();
        setTimeout(startMediaPoll, 350); // refresh title/state right away
      });
      controls.appendChild(b);
    };
    mkCtl(t("w.prev"), "⏮", () => dockApi.mediaPrev());
    mkCtl(t("w.playPause"), "⏯", () => dockApi.mediaToggle());
    mkCtl(t("w.next"), "⏭", () => dockApi.mediaNext());
    card.appendChild(controls);
  }
  if (type === "clock") tickClocks();
  if (type === "notes") {
    el.querySelector(".w-label").textContent = t("w.notes");
    el.querySelector(".w-value").textContent = st.note || t("w.notesEmpty");
    el.querySelector(".w-value").classList.add("w-note");
    el.querySelector(".w-bar").style.display = "none";
  }
  return el;
}

const fmtRate = (kbps) =>
  kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`;

function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Set a percentage metric (CPU/RAM/disk): label + value% + bar. Extra detail
// goes in the tooltip so nothing overflows the compact card.
function setMetric(el, label, val, title) {
  el.querySelector(".w-label").textContent = label;
  el.querySelector(".w-value").textContent = `${val}%`;
  const bar = el.querySelector(".w-bar");
  bar.style.display = "";
  bar.querySelector("i").style.width = `${Math.min(100, Math.max(0, val))}%`;
  if (title) el.title = title;
}

function setText(el, label, value, title) {
  el.querySelector(".w-label").textContent = label;
  el.querySelector(".w-value").textContent = value;
  el.querySelector(".w-bar").style.display = "none";
  if (title) el.title = title;
}

function tickClocks() {
  if (hiddenState) return; // don't update a tucked-away dock
  const now = new Date();
  const loc = curLang() === "en" ? "en-US" : "es-ES";
  const time = now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
  dockEl.querySelectorAll('.tile.widget[data-widget="clock"]').forEach((el) => {
    setText(el, date, time);
  });
}

let statsTimer = null;
let clockTimer = null;
function startWidgetPoll() {
  clearInterval(clockTimer);
  clearInterval(statsTimer);
  clockTimer = null;
  statsTimer = null;
  const hasClock = cfg.pinned.some((p) => p.kind === "widget" && p.widget === "clock");
  const needStats = () =>
    cfg.pinned.some((p) => p.kind === "widget" && STAT_WIDGETS.includes(p.widget));
  // Only run timers when there's actually a widget that needs them → zero idle
  // cost when the dock has no widgets.
  if (hasClock) {
    tickClocks();
    clockTimer = setInterval(tickClocks, 1000);
  }
  if (!needStats()) return;
  const tick = async () => {
    if (hiddenState) return;
    let s;
    try {
      s = await dockApi.systemStats();
    } catch (_) {
      return;
    }
    if (!s) return;
    dockEl.querySelectorAll(".tile.widget").forEach((el) => {
      const tp = el.dataset.widget;
      if (tp === "cpu") setMetric(el, "CPU", Math.round(s.cpu));
      else if (tp === "ram")
        setMetric(el, "RAM", Math.round(s.mem), `${(s.mem_used_mb / 1024).toFixed(1)} / ${(s.mem_total_mb / 1024).toFixed(0)} GB`);
      else if (tp === "disk")
        setMetric(el, t("w.disk"), Math.round(s.disk), `${s.disk_used_gb} / ${s.disk_total_gb} GB`);
      else if (tp === "net")
        setText(el, `↓ ${fmtRate(s.net_down_kbps)}`, `↑ ${fmtRate(s.net_up_kbps)}`, t("w.net"));
      else if (tp === "uptime")
        setText(el, t("w.uptime"), fmtUptime(s.uptime_secs));
      else if (tp === "battery") {
        if (s.battery < 0) setText(el, t("w.battery"), "—");
        else setMetric(el, (s.charging ? "⚡ " : "") + t("w.battery"), s.battery);
      }
    });
  };
  tick();
  statsTimer = setInterval(tick, 2500);
}

// Now-playing card: polls the system media session (Spotify, browser, …) only
// while a media widget is pinned and the dock is visible.
let mediaTimer = null;
function startMediaPoll() {
  clearInterval(mediaTimer);
  mediaTimer = null;
  if (!cfg.pinned.some((p) => p.kind === "widget" && p.widget === "media")) return;
  const tick = async () => {
    if (hiddenState) return;
    const m = await dockApi.mediaInfo().catch(() => null);
    dockEl.querySelectorAll('.tile.widget[data-widget="media"]').forEach((el) => {
      const art = el.querySelector(".w-art");
      const ico = el.querySelector(".w-ico");
      if (!m) {
        setText(el, t("w.media"), "—", t("w.media"));
        el.classList.remove("playing");
        if (art) art.style.display = "none";
        if (ico) ico.style.display = "";
        return;
      }
      setText(el, m.artist || t("w.media"), m.title || "—", `${m.title} — ${m.artist}`);
      el.classList.toggle("playing", !!m.playing);
      if (art && m.thumb) {
        art.src = m.thumb;
        art.style.display = "";
        if (ico) ico.style.display = "none";
      }
    });
  };
  tick();
  mediaTimer = setInterval(tick, 3000);
}

async function addWidget(type) {
  cfg.pinned.push({ id: uid(), name: widgetLabel(type), path: "", args: [], kind: "widget", widget: type });
  await persist();
  await emitConfigChanged();
  await render();
  reframe();
}

// Pinned pictures show their own thumbnail instead of a generic file icon.
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp|ico)$/i;

async function resolveIcon(item) {
  if (isLibIcon(item.icon)) return resolveLibIcon(item.icon); // built-in library glyph
  if (item.icon) return item.icon; // custom override (data URI or path-as-uri)
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  const uri = IMAGE_EXT.test(item.path || "")
    ? (await dockApi.imageDataUri(item.path)) || (await dockApi.appIcon(item.path))
    : await dockApi.appIcon(item.path);
  iconCache.set(item.path, uri);
  return uri;
}

// ─────────────────────────── Launch ───────────────────────────

function launch(el, item) {
  // Widgets aren't launchers — except the media card, where a click is
  // play/pause. Others do nothing on click.
  if (item.kind === "widget") {
    if (item.widget === "media") dockApi.mediaToggle().then(() => startMediaPoll());
    return;
  }
  // The trash pin opens the Recycle Bin.
  if (item.kind === "trash") {
    dockApi.launch("shell:RecycleBinFolder", []);
    return;
  }
  // Folder pins and groups open a "stack"/folder flyout instead of launching.
  if (item.kind === "folder" || item.kind === "group") {
    toggleStack(el, item);
    return;
  }
  // Launching/switching means the user is done with the dock for now — release
  // any pinned reveal so smart-hide can tuck it back into the notch.
  pinnedReveal = false;
  scheduleHide();
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

// Show the changelog the first time the app opens after an update.
async function checkChangelog() {
  try {
    const v = await dockApi.appVersion();
    if (v && cfg.seenVersion !== v) {
      cfg.seenVersion = v;
      await persist();
      dockApi.openChangelog();
    }
  } catch (_) {}
}

// First-run tips: three small coach bubbles, shown once ever.
async function maybeOnboard() {
  if (cfg.onboarded) return;
  const steps = [
    { emoji: "👆", text: t("ob.step1") },
    { emoji: "🗂️", text: t("ob.step2") },
    { emoji: "🦫", text: t("ob.step3") },
  ];
  let i = 0;
  pinnedReveal = true; // keep the dock open during the tour
  setHidden(false); // the tips are useless if the dock booted tucked away
  const pop = document.createElement("div");
  pop.className = "coach";
  placePop(pop);
  const showStep = () => {
    const last = i === steps.length - 1;
    pop.innerHTML =
      `<span class="coach-emoji">${steps[i].emoji}</span>` +
      `<span class="coach-text">${steps[i].text}</span>` +
      `<span class="coach-dots">${steps.map((_, k) => (k === i ? "●" : "○")).join(" ")}</span>`;
    const btn = document.createElement("button");
    btn.className = "coach-btn";
    btn.textContent = last ? t("ob.done") : t("ob.next");
    btn.addEventListener("click", async () => {
      i += 1;
      if (i < steps.length) {
        showStep();
      } else {
        pop.remove();
        document.body.classList.remove("pop-open");
        reframe();
        cfg.onboarded = true;
        await persist();
        pinnedReveal = false;
        scheduleHide();
      }
    });
    pop.appendChild(btn);
  };
  showStep();
}

// Double-click the empty bar → open Settings (quick, intuitive).
dockEl.addEventListener("dblclick", (e) => {
  if (!closestSel(e.target, ".tile")) dockApi.openSettings();
});

// Press-hold the empty bar and drag it toward its edge → tuck the dock away
// (the natural "push it off the screen" gesture).
let bgDrag = null;
dockEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || closestSel(e.target, ".tile")) return;
  bgDrag = { x: e.screenX, y: e.screenY };
});
window.addEventListener("pointermove", (e) => {
  if (!bgDrag) return;
  const dx = e.screenX - bgDrag.x;
  const dy = e.screenY - bgDrag.y;
  const toward =
    cfg.edge === "top" ? -dy : cfg.edge === "left" ? -dx : cfg.edge === "right" ? dx : dy;
  if (toward > 42) {
    bgDrag = null;
    pinnedReveal = false;
    manualReveal = false;
    // The pointer is still inside the window when the gesture ends — without
    // this flag the hover-reveal would pop the dock right back out.
    manualHide = true;
    setHidden(true);
  }
});
window.addEventListener("pointerup", () => (bgDrag = null));

// Mouse wheel over a widget → cycle its visual style (a fun, fast tweak).
let wheelSaveTimer = null;
dockEl.addEventListener(
  "wheel",
  (e) => {
    const w = closestSel(e.target, ".tile.widget");
    if (!w) return;
    e.preventDefault();
    const item = cfg.pinned.find((p) => p.id === w.dataset.id);
    if (!item) return;
    const cur = (item.style && item.style.variant) || "glass";
    const i = WIDGET_VARIANTS.indexOf(cur);
    const step = e.deltaY > 0 ? 1 : WIDGET_VARIANTS.length - 1;
    const next = WIDGET_VARIANTS[(i + step) % WIDGET_VARIANTS.length];
    item.style = { ...(item.style || {}), variant: next };
    w.dataset.variant = next;
    clearTimeout(wheelSaveTimer);
    wheelSaveTimer = setTimeout(async () => {
      await persist();
      await emitConfigChanged();
    }, 350);
  },
  { passive: false }
);

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

  // Hovering the CENTER of another tile → folder (merge) intent. Only apps merge
  // into folders (groups can't nest; widgets/separators never form folders).
  const canMerge = press.item.kind === "app";
  let centerTarget = null;
  if (canMerge) {
    for (const s of sibs) {
      if (s.classList.contains("separator") || s.classList.contains("widget")) continue;
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
  // Skip if it's already in place (avoids resetting the FLIP transition).
  if (press.el.nextElementSibling === ref) return;
  flipReorder(() => dockEl.insertBefore(press.el, ref));
}

// FLIP: animate the OTHER tiles sliding to their new slots when the dragged tile
// is reinserted, so reordering reads as a smooth shuffle (not an instant jump).
function flipReorder(mutate) {
  const tiles = [...dockEl.querySelectorAll(".tile")];
  const first = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
  mutate();
  for (const t of tiles) {
    if (t === press?.el) continue; // the dragged tile follows the pointer itself
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
      await emitConfigChanged(); // keep the Settings list in sync with the new order
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
  await emitConfigChanged();
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
  if (editMode && !closestSel(e.target, ".tile")) exitEdit();
  // Clicking anywhere outside the trash confirmation cancels it (never delete
  // on an ambiguous gesture).
  if (trashPop && !closestSel(e.target, ".trash-pop")) {
    closeTrashPop();
    pinnedReveal = false;
    scheduleHide();
  }
});

// ───────────────────────── Context menu ─────────────────────────

function openMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const add = (iconName, text, fn) => {
    const b = document.createElement("button");
    b.innerHTML = `${icon(iconName)}<span>${esc(text)}</span>`;
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
      } else if (item.kind === "trash") {
        dockApi.launch("shell:RecycleBinFolder", []);
      } else {
        dockApi.launch(item.path, item.args || []);
      }
    });
    // Recents (a lightweight jump list of files opened with this app via Booki).
    if (item.kind === "app" && (item.recents || []).length) {
      sep();
      item.recents.slice(0, 6).forEach((rp) =>
        add("app", baseName(rp), () => dockApi.launch(item.path, [rp]))
      );
      sep();
    }
    // A custom icon only makes sense for apps/folders (groups show a mini-grid,
    // widgets show their card) — so don't offer it for those.
    if (item.kind === "app" || item.kind === "folder") {
      add("palette", t("m.changeIcon"), () => changeIcon(item));
      if (item.icon) add("x", t("m.removeIcon"), () => clearIcon(item));
    }
    if (item.kind === "group") add("grid", t("group.ungroup"), () => ungroup(item));
    if (item.kind === "trash") add("trash", t("trash.empty"), () => confirmTrash([], true));
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
  add("grid", t("w.add.clock"), () => addWidget("clock"));
  add("grid", t("w.add.cpu"), () => addWidget("cpu"));
  add("grid", t("w.add.ram"), () => addWidget("ram"));
  add("grid", t("w.add.disk"), () => addWidget("disk"));
  add("grid", t("w.add.net"), () => addWidget("net"));
  add("grid", t("w.add.uptime"), () => addWidget("uptime"));
  add("grid", t("w.add.battery"), () => addWidget("battery"));
  add("grid", t("w.add.notes"), () => addWidget("notes"));
  const s2 = document.createElement("div");
  s2.className = "sep";
  ctxMenu.appendChild(s2);
  add("settings", t("m.settings"), () => dockApi.openSettings());
  placeMenu(e);
}

// The context menu lives beside the bar (like the folder flyout): the window is
// grown to fit it, so it can never be cut off by the dock window's bounds.
function placeMenu(e) {
  const cx = e.clientX;
  const cy = e.clientY;
  // Measure invisibly, grow the window FIRST, then reveal in its final spot —
  // one paint, no flicker from the window resizing under an already-visible menu.
  ctxMenu.style.visibility = "hidden";
  ctxMenu.classList.remove("hidden");
  document.body.classList.add("menu-open");
  applyFrame();
  const put = () => {
    const dr = dockEl.getBoundingClientRect();
    const pad = 8;
    const gap = 10;
    const mw = ctxMenu.offsetWidth;
    const mh = ctxMenu.offsetHeight;
    if (isVertical()) {
      const top = Math.min(Math.max(pad, cy - mh / 2), window.innerHeight - mh - pad);
      ctxMenu.style.top = `${top}px`;
      ctxMenu.style.left =
        cfg.edge === "left" ? `${dr.right + gap}px` : `${dr.left - mw - gap}px`;
    } else {
      const left = Math.min(Math.max(pad, cx - mw / 2), window.innerWidth - mw - pad);
      ctxMenu.style.left = `${left}px`;
      ctxMenu.style.top =
        cfg.edge === "top" ? `${dr.bottom + gap}px` : `${dr.top - mh - gap}px`;
    }
  };
  put();
  setTimeout(() => {
    requestAnimationFrame(() => {
      put();
      ctxMenu.style.visibility = "";
    });
  }, 70);
}
function closeMenu() {
  if (ctxMenu.classList.contains("hidden")) return;
  ctxMenu.classList.add("hidden");
  document.body.classList.remove("menu-open");
  reframe();
}
// Right-click on the bar's empty space (tiles stopPropagation their own menu).
dockEl.addEventListener("contextmenu", openBackgroundMenu);
window.addEventListener("click", closeMenu);
window.addEventListener("blur", () => {
  closeMenu();
  // Focus moved to another app → release a pinned reveal so the dock can tuck
  // back into the notch instead of lingering on top of whatever the user opened.
  if (pinnedReveal) {
    pinnedReveal = false;
    scheduleHide();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    exitEdit();
    closeStack();
    cancelDrag();
    closeTrashPop();
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

// Widgets change size when their data arrives (music title, network rates…) —
// watch the bar's real layout size and re-fit the window whenever it moves, so
// nothing ever gets cut off at the window edge.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => reframe()).observe(dockEl);
}

let reframeTimer = null;
function reframe() {
  // Coalesce rapid calls (render + settings changes) into one resize.
  clearTimeout(reframeTimer);
  reframeTimer = setTimeout(
    () => requestAnimationFrame(() => requestAnimationFrame(applyFrame)),
    50
  );
}

// Transparent breathing room around the bar so the dock's drop shadow and the
// magnified tiles have room to render without being clipped by the window edge.
const SHADOW_PAD = 22;

let lastFull = null;
function computeFrame() {
  const dpr = window.devicePixelRatio || 1;
  // The window is the bar plus a transparent shadow-pad margin. The dock surface
  // is centered inside via body padding; magnify and the soft shadow live in the
  // pad. The hover name uses the native OS tooltip (title attr).
  // Use offsetWidth/Height (layout size) — NOT getBoundingClientRect — so a dock
  // that's currently scaled by the minimize animation doesn't size the window too
  // small (which left the bar looking cut off after revealing, esp. at the top).
  let wCss = dockEl.offsetWidth + SHADOW_PAD * 2;
  let hCss = dockEl.offsetHeight + SHADOW_PAD * 2;
  // Make room for an open folder-stack flyout.
  if (stackOpen && stackEl) {
    const sr = stackEl.getBoundingClientRect();
    hCss += sr.height + 16;
    wCss = Math.max(wCss, sr.width + 32);
  }
  // …and for anything open beside the bar: popovers (trash confirm, first-run
  // tips) and the context menu. Everything that isn't the bar itself must fit
  // INSIDE the window or it gets clipped at the window edge.
  const pop = document.querySelector(".trash-pop, .coach, #ctx-menu:not(.hidden)");
  if (pop) {
    if (isVertical()) wCss += pop.offsetWidth + 24;
    else hCss += pop.offsetHeight + 24;
    wCss = Math.max(wCss, pop.offsetWidth + 40);
  }
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

let lastFrameEdge = null;
function applyFrame() {
  const full = computeFrame();
  // Skip the native resize+reposition when nothing actually changed (±1px) —
  // otherwise every settings tweak (zoom, labels…) made the whole dock jump.
  const key = `${cfg.edge}:${cfg.monitor ?? -1}`;
  if (
    lastFull && lastFrameEdge === key &&
    Math.abs(full.w - lastFull.w) <= 1 && Math.abs(full.h - lastFull.h) <= 1
  ) {
    return;
  }
  lastFull = full;
  lastFrameEdge = key;
  // The dock window stays full-size at all times now; hiding is done by showing
  // the separate notch window and hiding the dock window (no resize → no notch
  // flap or repaint race). hidden=false keeps the home rect updated for occlusion.
  dockApi.setDockFrame(cfg.edge, full.w, full.h, false);
}

// ───────────────────────── Auto-hide ─────────────────────────
// Modes: "off" (always visible) · "smart" (hide when a window covers the dock,
// driven by the backend occlusion watcher) · "edge" (hide, reveal on hover).

let hiddenState = false;
let hideTimer = null;
let occluded = false; // last occlusion signal from the backend (smart mode)
let manualReveal = false; // user hovered/clicked the notch → keep shown for now
let pinnedReveal = false; // user CLICKED the notch → keep the dock open to use it
let fullscreen = false; // a fullscreen game/movie is running → blackout everything
let draggingFile = false; // an OS file drag is over the dock → keep it open
let manualHide = false; // user swiped the bar away → hover must not bring it back
let blackoutTimer = null;

// Fullscreen game/movie/presentation → get completely out of the way: flash a
// brief toast, then hide BOTH the bar and the notch. Restore when it ends.
function onFullscreenSignal(value) {
  fullscreen = value;
  clearTimeout(blackoutTimer);
  if (value) {
    pinnedReveal = false;
    manualReveal = false;
    hiddenState = true;
    document.body.classList.add("tucked");
    dockApi.notchToast(t("fs.hidden")); // hides the dock + shows the toast on the notch
    blackoutTimer = setTimeout(() => {
      if (fullscreen) dockApi.hideAll(); // then hide the notch too (full blackout)
    }, 2600);
  } else {
    // Back to normal: re-evaluate smart-hide and show the right window.
    document.body.classList.remove("tucked");
    hiddenState = false;
    setupAutoHide();
  }
}

function hideMode() {
  return cfg.autoHideMode || (cfg.autoHide ? "edge" : "off");
}

function setHidden(v) {
  if (v === hiddenState) return;
  hiddenState = v;
  if (v) {
    // Slide/fade the bar out, then hand off to the notch window (and hide the
    // dock window) once the animation has played.
    document.body.classList.add("tucked");
    setTimeout(() => {
      if (hiddenState) dockApi.hideDock(cfg.edge);
    }, 360); // let the minimize animation play before the window hides
  } else {
    // Show the dock window (and hide the notch), make sure it's sized to the full
    // bar, then slide the bar back in.
    dockApi.revealDock();
    applyFrame();
    setTimeout(() => {
      if (!hiddenState) document.body.classList.remove("tucked");
    }, 60);
  }
}

function setupAutoHide() {
  clearTimeout(hideTimer);
  manualReveal = false;
  pinnedReveal = false;
  // edge mode starts hidden; off/smart start shown (smart hides only once the
  // backend reports the dock is actually covered, so on the desktop it stays
  // visible — never flapping).
  // edge mode starts hidden; smart starts hidden only if we're currently in an
  // app (occluded) — so a config reload while you're working doesn't flash the
  // dock open. off/smart-on-desktop start shown.
  hiddenState = hideMode() === "edge" || (hideMode() === "smart" && occluded);
  document.body.classList.toggle("tucked", hiddenState);
  applyFrame();
  // Sync the two windows to the starting state (these don't emit, so this won't
  // pin the dock open).
  if (hiddenState) dockApi.hideDock(cfg.edge);
  else dockApi.revealDock();
}

// Pointer entered the dock → reveal and hold it open.
function reveal() {
  if (fullscreen) return; // stay out of the way during fullscreen
  if (manualHide) return; // user swiped the dock away — only the notch brings it back
  const mode = hideMode();
  if (mode === "off") return;
  // In smart mode, while you're working in another app, DON'T reveal on hover —
  // the dock returns only on the desktop or when you click the notch. This keeps
  // it out of the way instead of popping open as the cursor passes by.
  if (mode === "smart" && occluded && !pinnedReveal) return;
  clearTimeout(hideTimer);
  manualReveal = true;
  setHidden(false);
}

// Pointer left → after the delay, hide again if the mode still wants to.
function scheduleHide() {
  const mode = hideMode();
  // While the user is dragging or has explicitly pinned the dock open from the
  // notch, never tuck it away — they're in the middle of using it.
  if (mode === "off" || dragging || draggingFile || pinnedReveal) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (dragging || draggingFile || pinnedReveal) return;
    manualReveal = false;
    if (mode === "edge" || (mode === "smart" && occluded)) setHidden(true);
  }, cfg.autoHideDelay ?? 650);
}

// Smart-hide: the backend tells us when a window covers the dock's home area.
// We hide to the notch when covered and reappear when the desktop is clear —
// measured against a stable rect in Rust, so it can no longer flap.
function onOcclusionSignal(value) {
  occluded = value;
  // Going back to work in an app releases a manual swipe-hide: next time the
  // desktop is clear, normal smart behavior resumes.
  if (value) manualHide = false;
  if (fullscreen) return; // blackout owns the visibility while fullscreen
  if (draggingFile) return; // never tuck away mid file-drag (the drop needs us)
  if (manualHide) return; // stay hidden until the user asks for the dock again
  if (hideMode() !== "smart") return;
  if (!value) {
    // Back on the desktop → bring the dock out automatically.
    pinnedReveal = false;
    manualReveal = false;
    setHidden(false);
  } else if (!pinnedReveal) {
    // Working in an app → tuck away regardless of hover, unless the user pinned
    // the dock open from the notch.
    manualReveal = false;
    setHidden(true);
  }
}

document.body.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerleave", scheduleHide);

// The notch is now its own small window. Clicking it calls the backend, which
// shows the dock window again and fires `booki://reveal` — we pin the dock open
// (so the user can actually launch something) until they click away or launch.
onReveal(() => {
  manualHide = false; // explicit notch click always brings the dock back
  pinnedReveal = true;
  reveal();
});

// Clicking anywhere outside the dock releases a pinned reveal and lets the dock
// tuck back into the notch (when the mode wants it hidden).
window.addEventListener("pointerdown", (e) => {
  if (!pinnedReveal) return;
  if (closestSel(e.target, "#dock")) return;
  pinnedReveal = false;
  scheduleHide();
});

// ─────────────────── Desktop file drop ───────────────────

function tileFromPoint(position) {
  if (!position) return null;
  const dpr = window.devicePixelRatio || 1;
  const el = document.elementFromPoint(position.x / dpr, position.y / dpr);
  return el ? el.closest(".tile[data-id]") : null;
}
let dropTargetEl = null;
function setDropTarget(el) {
  if (dropTargetEl === el) return;
  if (dropTargetEl) dropTargetEl.classList.remove("drop-target");
  dropTargetEl = el;
  if (el) el.classList.add("drop-target");
}

// ─────────────────────── Trash confirmation ───────────────────────
// A small in-dock popover: nothing is ever deleted without an explicit yes.
// Files go to the Recycle Bin (undoable), never a permanent delete.

let trashPop = null;
function closeTrashPop() {
  if (trashPop) trashPop.remove();
  trashPop = null;
  document.body.classList.remove("pop-open");
  reframe();
}

// Place a dock popover (trash confirm / first-run tips) NEXT TO the bar — never
// on top of it — and grow the window so nothing gets clipped.
function placePop(pop) {
  pop.style.visibility = "hidden";
  document.body.appendChild(pop);
  document.body.classList.add("pop-open");
  applyFrame(); // grow the window before anything is visible
  const put = () => {
    const dr = dockEl.getBoundingClientRect();
    const gap = 12;
    pop.style.left = pop.style.right = pop.style.top = pop.style.bottom = "";
    if (isVertical()) {
      pop.style.top = "50%";
      pop.style.transform = "translateY(-50%)";
      if (cfg.edge === "left") pop.style.left = `${dr.width + gap}px`;
      else pop.style.right = `${dr.width + gap}px`;
    } else {
      pop.style.left = "50%";
      pop.style.transform = "translateX(-50%)";
      if (cfg.edge === "top") pop.style.top = `${dr.height + gap}px`;
      else pop.style.bottom = `${dr.height + gap}px`;
    }
  };
  put();
  // Reveal only after the window has grown and the popover sits in place.
  setTimeout(() => {
    requestAnimationFrame(() => {
      put();
      pop.style.visibility = "";
    });
  }, 70);
}

function confirmTrash(paths, emptyBin = false) {
  closeTrashPop();
  pinnedReveal = true; // keep the dock open while the question is on screen
  const n = paths.length;
  const text = emptyBin
    ? t("trash.emptyAsk")
    : (n === 1 ? t("trash.askOne").replace("{name}", esc(baseName(paths[0]))) : t("trash.ask").replace("{n}", n));
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  pop.innerHTML =
    `${icon("trash")}<span class="tp-col"><span class="tp-text">${text}</span>` +
    `<span class="tp-sub">${t("trash.sub")}</span></span>`;
  const mkBtn = (cls, label, fn) => {
    const b = document.createElement("button");
    b.className = `tp-btn ${cls}`;
    b.textContent = label;
    b.addEventListener("click", fn);
    pop.appendChild(b);
    return b;
  };
  mkBtn("danger", emptyBin ? t("trash.empty") : t("trash.delete"), async () => {
    closeTrashPop();
    try {
      if (emptyBin) await dockApi.emptyTrash();
      else await dockApi.trashPaths(paths);
      const tile = dockEl.querySelector(".tile.trash");
      if (tile) {
        tile.classList.remove("gulp");
        void tile.offsetWidth;
        tile.classList.add("gulp");
      }
    } catch (err) {
      // Deletion was blocked (usually Defender's Controlled Folder Access) —
      // explain honestly instead of failing in silence.
      logMessage(`trash: ${err}`);
      trashBlockedInfo();
      return;
    }
    await refreshTrashState();
    pinnedReveal = false;
    scheduleHide();
  });
  mkBtn("", t("trash.cancel"), () => {
    closeTrashPop();
    pinnedReveal = false;
    scheduleHide();
  });
  placePop(pop);
  trashPop = pop;
}

// Shown when Windows refuses the operation: it's almost always Defender's
// "Controlled folder access" being cautious about an app it doesn't know yet.
function trashBlockedInfo() {
  closeTrashPop();
  pinnedReveal = true;
  const pop = document.createElement("div");
  pop.className = "trash-pop blocked";
  pop.innerHTML =
    `<span class="tp-emoji">🛡️</span><span class="tp-col">` +
    `<span class="tp-text">${t("trash.blocked")}</span>` +
    `<span class="tp-sub">${t("trash.blockedSub")}</span></span>`;
  const ok = document.createElement("button");
  ok.className = "tp-btn";
  ok.textContent = t("trash.ok");
  ok.addEventListener("click", () => {
    closeTrashPop();
    pinnedReveal = false;
    scheduleHide();
  });
  pop.appendChild(ok);
  placePop(pop);
  trashPop = pop;
}

// Open files with an app and remember them as recents (a small jump list).
async function openWith(item, paths) {
  for (const p of paths) dockApi.launch(item.path, [p]);
  const i = cfg.pinned.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const cur = cfg.pinned[i].recents || [];
    cfg.pinned[i].recents = [...paths, ...cur.filter((r) => !paths.includes(r))].slice(0, 8);
    await persist();
  }
}

function setupFileDrop() {
  onFileDrop({
    onEnter: () => {
      // A file drag is aimed at the dock: force it open and PIN it open for the
      // whole drag (smart-hide would otherwise tuck it away mid-drag, since
      // dragging from Explorer counts as "working in another app").
      draggingFile = true;
      pinnedReveal = true;
      clearTimeout(hideTimer);
      setHidden(false);
      dropOverlay.classList.add("active");
    },
    onOver: (position) => setDropTarget(tileFromPoint(position)),
    onLeave: () => {
      draggingFile = false;
      pinnedReveal = false;
      dropOverlay.classList.remove("active");
      setDropTarget(null);
      scheduleHide();
    },
    onDrop: async (paths, position) => {
      draggingFile = false;
      pinnedReveal = false;
      dropOverlay.classList.remove("active");
      const target = tileFromPoint(position);
      setDropTarget(null);
      if (!paths || !paths.length) return;
      // Dropped onto an app icon → open the files with that app.
      const item = target && cfg.pinned.find((p) => p.id === target.dataset.id);
      if (item && item.kind === "app") {
        await openWith(item, paths);
        return;
      }
      // Dropped onto the trash pin → confirm, then send to the Recycle Bin.
      if (item && item.kind === "trash") {
        confirmTrash(paths);
        return;
      }
      // Otherwise pin them to the dock.
      await addPaths(paths);
    },
  });
}

// ─────────────────── Running-app indicators ───────────────────

let pollTimer = null;
function startRunningPoll() {
  if (!isTauri) return;
  const tick = async () => {
    // Don't poll while tucked into the notch — saves CPU/IPC when idle.
    if (hiddenState) return;
    if (cfg.showIndicators === false) {
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => (t.dataset.running = "false"));
      return;
    }
    try {
      const wins = await dockApi.listWindows();
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => {
        const app = cfg.pinned.find((a) => a.id === t.dataset.id);
        if (!app || app.kind === "separator" || app.kind === "trash") return;
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
  pollTimer = setInterval(tick, 5000);
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
  const glyph = document.createElement("span");
  glyph.className = "stack-head-icon";
  glyph.innerHTML = icon("folder");
  head.appendChild(glyph);
  if (isGroup) {
    const input = document.createElement("input");
    input.className = "stack-rename";
    input.value = item.name || "";
    input.placeholder = t("group.new");
    input.addEventListener("input", () => renameGroup(item, input.value));
    head.appendChild(input);
  } else {
    const name = document.createElement("span");
    name.className = "stack-title";
    name.textContent = item.name;
    head.appendChild(name);
  }
  const close = document.createElement("button");
  close.className = "stack-close";
  close.title = t("stack.close");
  close.innerHTML = icon("x");
  close.addEventListener("click", closeStack);
  head.appendChild(close);
  stackEl.appendChild(head);
  const grid = document.createElement("div");
  grid.className = "stack-grid";
  if (!items.length) {
    grid.innerHTML = `<div class="stack-empty">${t("stack.empty")}</div>`;
  }
  let cellIdx = 0;
  for (const it of items) {
    const cell = document.createElement("button");
    cell.className = "stack-item";
    cell.style.setProperty("--i", cellIdx++); // staggered entry
    cell.title = it.name;
    const ic = isGroup ? await resolveIcon(it) : await dockApi.appIcon(it.path);
    const isDir = isGroup ? it.kind === "folder" || it.kind === "group" : it.is_dir;
    cell.innerHTML =
      (ic ? `<img src="${esc(ic)}" alt="" />` : `<span class="stack-glyph">${isDir ? "📁" : esc((it.name[0] || "?").toUpperCase())}</span>`) +
      `<span class="stack-name">${esc(it.name)}</span>`;
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
  // Quick "add app to this folder" cell — makes filling a folder fast.
  if (isGroup) {
    const addCell = document.createElement("button");
    addCell.className = "stack-item stack-add";
    addCell.title = t("apps.addToFolder");
    addCell.innerHTML =
      `<span class="stack-glyph">＋</span><span class="stack-name">${t("apps.addToFolder")}</span>`;
    addCell.addEventListener("click", (ev) => {
      ev.stopPropagation();
      addToFolderFromDock(item);
    });
    grid.appendChild(addCell);
  }
  stackEl.appendChild(grid);

  stackOpen = true;
  document.body.classList.add("stack-open");
  // Grow the window synchronously BEFORE the flyout becomes visible — same
  // pattern as the context menu / popovers, so opening a folder never flashes
  // a clipped panel while the window catches up.
  applyFrame();
  setTimeout(() => requestAnimationFrame(() => {
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
    // Positioned in its closed state → flip to open so the transition plays.
    stackEl.classList.add("open");
  }), 70);
}

let stackCloseTimer = null;
function closeStack() {
  if (!stackOpen) return;
  stackOpen = false;
  document.body.classList.remove("stack-open");
  stackEl.classList.remove("open"); // plays the close transition
  // Shrink the window only after the close animation has played, so it doesn't
  // get cut off mid-fade.
  clearTimeout(stackCloseTimer);
  stackCloseTimer = setTimeout(reframe, 240);
}

// Add an app into a folder from its open flyout, then reopen it so you can keep
// adding several in a row.
async function addToFolderFromDock(group) {
  const path = await pickAppFile();
  if (!path) return;
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  cfg.pinned[gi].children = [
    ...(cfg.pinned[gi].children || []),
    { id: uid(), name: baseName(path), path, args: [], kind: "app" },
  ];
  await persist();
  await emitConfigChanged();
  closeStack();
  await render();
  reframe();
  const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
  const it = cfg.pinned.find((p) => p.id === group.id);
  if (el && it) toggleStack(el, it);
}
window.addEventListener("pointerdown", (e) => {
  if (stackOpen && !closestSel(e.target, "#stack") && !closestSel(e.target, ".tile")) closeStack();
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
  }
}

// ─────────────────── Easter egg: Konami → party 🦫 ───────────────────
const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];
let konami = [];
window.addEventListener("keydown", (e) => {
  konami.push(e.key);
  if (konami.length > KONAMI.length) konami = konami.slice(-KONAMI.length);
  if (konami.length === KONAMI.length && KONAMI.every((k, i) => k === konami[i])) {
    konami = [];
    partyMode();
  }
});
function partyMode() {
  document.body.classList.add("party");
  const tiles = [...dockEl.querySelectorAll(".tile")];
  tiles.forEach((t, i) => (t.style.animationDelay = `${i * 60}ms`));
  setTimeout(() => {
    document.body.classList.remove("party");
    tiles.forEach((t) => (t.style.animationDelay = ""));
  }, 4200);
}

// A friendly signature in the console for the curious. 🦫
try {
  // eslint-disable-next-line no-console
  console.log(
    "%c🦫 Booki Dock %c— hecho con cariño por Punkable (@Punkabl3). ¡Prueba el código Konami!",
    "font-weight:700;color:#dfaa75",
    "color:inherit"
  );
} catch (_) {}

boot();
