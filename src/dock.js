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
  onLaunchIndex,
  onHotEdge,
  emitConfigChanged as emitConfigChangedRaw,
  logMessage,
  isTauri,
} from "./api.js";
import { icon } from "./icons.js";
import { emo } from "./emoji.js";
import { isLibIcon, resolveLibIcon } from "./icon-library.js";
import { applyTheme, applyEdge } from "./theme.js";
import { checkForUpdate } from "./update.js";
import { t, setLang, curLang, ensureLang } from "./i18n.js";

// Surface any runtime error to the app log (diagnostics on the user's machine).
window.addEventListener("error", (e) => logMessage("error", `dock: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `dock: unhandled ${e.reason}`)
);

const dockEl = document.getElementById("dock");
const ctxMenu = document.getElementById("ctx-menu");
const dropOverlay = document.getElementById("drop-overlay");

function availW() {
  const screenW = window.screen.availWidth || window.screen.width || window.innerWidth || 1280;
  return isTauri ? screenW : Math.min(screenW, window.innerWidth || screenW);
}

function availH() {
  const screenH = window.screen.availHeight || window.screen.height || window.innerHeight || 720;
  return isTauri ? screenH : Math.min(screenH, window.innerHeight || screenH);
}

// Safe .closest() — pointer/keyboard targets can be non-Element (document/window),
// which would throw "closest is not a function".
const closestSel = (target, sel) => (target && target.closest ? target.closest(sel) : null);

// Kill native HTML5 drag inside the dock window. Icon tiles are <img> elements,
// which the browser lets you drag out as an image — dropping one on the desktop
// made Windows save a stray .png. All our dragging is pointer-event based, and
// incoming file drops from Explorer use Tauri's own channel (not webview
// dragstart), so suppressing this is purely the fix with no downside.
window.addEventListener("dragstart", (e) => e.preventDefault());

// Escape user-controlled text (file/app names) before it goes into innerHTML —
// a file literally named "<img onerror=…>.txt" must render as text, not run.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let cfg = null;
// Tauri's event.emit echoes back to the sender. When the DOCK changes config it
// already has the new state, so it must ignore its own echoed config-changed
// event (otherwise: redundant reloadConfig → re-render → reframe = flicker). We
// mark a short window after any self-emit during which echoes are ignored.
let selfChangeUntil = 0;
function emitConfigChanged() {
  selfChangeUntil = Date.now() + 400;
  return emitConfigChangedRaw();
}
const iconCache = new Map();
const uid = () => Math.random().toString(36).slice(2, 9);
const isVertical = () => cfg.edge === "left" || cfg.edge === "right";
const baseSize = () => cfg.iconSize || 48;
function findPinnedById(id, items = cfg?.pinned || []) {
  for (const item of items) {
    if (item.id === id) return item;
    const child = findPinnedById(id, item.children || []);
    if (child) return child;
  }
  return null;
}

// ───────────────────────────── Boot ─────────────────────────────

async function boot() {
  try {
    cfg = await configApi.get();
    await ensureLang(cfg.language); // load pt/fr/de before the first paint
    applyAll();
    await render();
    reframe();
    setupAutoHide();
    setupFileDrop();
    startPolls(); // starts the widget + running-app/trash polls together
    // Only react to config changes made by OTHER windows (Settings). Tauri's
    // emit echoes back to the sender, so without this guard every dock reorder /
    // removal / grouping would trigger a redundant reloadConfig → re-render →
    // reframe (visible flicker + the window grow/shrink churn). selfChangeUntil
    // is bumped whenever the dock itself emits.
    onConfigChanged(() => { if (Date.now() < selfChangeUntil) return; reloadConfig(); });
    onOcclusion(onOcclusionSignal);
    onFullscreen(onFullscreenSignal);
    // Position hotkeys (modifier+1…9): launch the Nth item on the bar.
    onLaunchIndex((i) => {
      const items = cfg.pinned.filter((p) => p.kind !== "separator");
      const item = items[i];
      if (!item) return;
      const el = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
      if (el) launch(el, item);
      else if (item.path) dockApi.launch(item.path, item.args || []);
    });
    checkChangelog();
    // Keep the Explorer "Add to Booki" right-click menu in step with the
    // current groups + language (deferred: registry writes aren't urgent).
    setTimeout(maybeSyncCtxMenu, 2500);
    // Defer the update check (a network round-trip) a few seconds so it doesn't
    // compete with first paint / icon extraction during startup.
    setTimeout(checkUpdates, 4000);
    // Give the first layout a beat to settle so the tips measure correctly.
    setTimeout(maybeOnboard, 800);
    logMessage("info", `dock booted ok (pinned=${cfg.pinned.length})`);
  } catch (err) {
    logMessage("error", `boot failed: ${err}`);
    // Self-heal: a transient failure (e.g. the backend not ready yet) shouldn't
    // leave a dead dock. Retry once after a short beat before giving up.
    if (!boot.retried) {
      boot.retried = true;
      setTimeout(boot, 1500);
    }
  }
}

// Explorer right-click menu: entries live in the registry, written by the
// backend with labels WE localize here (so all 5 languages work). Re-synced
// whenever the groups, the language, or the toggle change.
const ctxGroupsSig = (c) =>
  (c.pinned || []).filter((p) => p.kind === "group").map((p) => `${p.id}:${p.name}`).join("|") +
  `|${c.contextMenu !== false}|${c.language || ""}`;
let lastCtxSig = null;
function syncCtxMenu() {
  lastCtxSig = ctxGroupsSig(cfg);
  dockApi
    .syncContextMenu(cfg.contextMenu !== false, t("ctx.addToBooki"), t("ctx.addToGroup"))
    .catch(() => {});
}
// Cheap guard used from persist(): dock-side group edits bypass reloadConfig
// (self-emit echo guard), so re-sync here when the signature actually moved.
function maybeSyncCtxMenu() {
  if (cfg && ctxGroupsSig(cfg) !== lastCtxSig) syncCtxMenu();
}

async function reloadConfig() {
  const prev = cfg;
  cfg = await configApi.get();
  // If the language changed, make sure its dictionary is loaded before re-render.
  if (!prev || prev.language !== cfg.language) await ensureLang(cfg.language);
  maybeSyncCtxMenu();
  if (prev && prev.edgeGap !== cfg.edgeGap) lastFull = null; // force re-place
  // Edge changed → mask the window teleport with a fade+pop: the bar vanishes
  // instantly, the window moves, and the bar pops back in on the new edge.
  const edgeSwapped = prev && prev.edge !== cfg.edge;
  if (edgeSwapped) {
    document.body.classList.add("edge-swap");
  }
  applyAll();
  // Only rebuild the bar when the pinned items actually changed — sliders and
  // toggles in Settings shouldn't make the whole dock flash.
  const pinsChanged = !prev || JSON.stringify(prev.pinned) !== JSON.stringify(cfg.pinned);
  if (pinsChanged) {
    await render();
    startPolls();
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
  if (edgeSwapped) {
    // Briefly SHOW the dock in its new spot so the user actually sees it move —
    // otherwise smart-hide (the settings window occludes the dock area) tucks it
    // away and only the notch appears to move. (Notch-only changes preview the
    // notch via notch_preview.) Then let the faded-out bar pop back in.
    positionPreview();
    setTimeout(() => {
      requestAnimationFrame(() => document.body.classList.remove("edge-swap"));
    }, 90);
  }
}

// Show the dock in its current position for a few seconds regardless of
// smart-hide occlusion — used as a live preview while tweaking position in
// Settings. After the window elapses, normal hide behavior resumes.
let previewing = false;
let previewTimer = null;
function positionPreview() {
  previewing = true;
  clearTimeout(previewTimer);
  manualHide = false;
  hiddenState = false;
  document.body.classList.remove("tucked");
  dockApi.revealDock();
  startPolls(); // visible again → resume live widgets
  applyFrame();
  previewTimer = setTimeout(() => {
    previewing = false;
    setupAutoHide(); // return to whatever the hide mode wants
  }, 2600);
}

function applyAll() {
  setLang(cfg.language);
  applyTheme(cfg);
  applyEdge(cfg);
  // The stage window spans the whole edge; the BAR aligns to the notch's
  // along-edge slot with CSS (the window itself no longer travels).
  const slot = cfg.notchPosition === "start" ? "start" : cfg.notchPosition === "end" ? "end" : "center";
  ["slot-start", "slot-center", "slot-end"].forEach((c) => document.body.classList.remove(c));
  document.body.classList.add(`slot-${slot}`);
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
  // How close the bar sits to its screen edge (user-tunable). The transparent
  // pad on the anchored side shrinks down to the requested gap; anything past
  // the stage pad is handled by the window's own margin (backend dock_xy).
  const edgeGap = Math.max(4, Math.min(96, cfg.edgeGap ?? 48));
  root.style.setProperty("--edge-pad", `${Math.min(SHADOW_PAD, edgeGap)}px`);
  // A small gap leaves no room for the outward drop shadow — soften it.
  document.body.classList.toggle("tight-edge", edgeGap < 24);
  // Tile/corner roundness (user-tunable). Drives tile, group and folder radii;
  // the dock's own outer corner is a touch rounder so it frames the tiles.
  const cr = cfg.cornerRadius ?? 12;
  root.style.setProperty("--tile-r", `${cr}px`);
  root.style.setProperty("--dock-r", `${cr + 8}px`);
  document.body.classList.toggle("show-labels", cfg.showLabels !== false);
  document.body.classList.toggle("compact", !!cfg.compact);
  document.body.classList.toggle("autohide", hideMode() !== "off");
  // Magnify animation style → easing curve used for the size/lift transitions.
  const style = cfg.magnifyStyle || "spring";
  const ease = style === "smooth" ? "cubic-bezier(0.16,1,0.3,1)" : "cubic-bezier(0.34,1.5,0.5,1)";
  root.style.setProperty("--mag-ease", ease);
  // Genie minimize: the notch always sits on the dock's edge, so the bar funnels
  // toward its along-position on that same edge.
  const ox = { start: 16.6, end: 83.4 }[cfg.notchPosition] ?? 50;
  root.style.setProperty("--genie-ox", `${ox}%`);
  root.style.setProperty("--genie-oxn", `${ox}`);
  const gedge = cfg.edge || "bottom";
  ["genie-bottom", "genie-top", "genie-left", "genie-right"].forEach((c) =>
    document.body.classList.remove(c)
  );
  document.body.classList.add(`genie-${gedge}`);
}

async function persist() {
  await configApi.save(cfg);
  maybeSyncCtxMenu(); // group added/renamed/removed on the dock → refresh Explorer menu
  // Always notify the other windows (Settings especially) so its pinned-apps
  // list can never drift out of sync with the dock — removing/adding/reordering
  // straight on the bar now reflects in Settings immediately.
  await emitConfigChanged();
}

// ──────────────────────────── Render ────────────────────────────

// Cache of live-widget elements by type, rebuilt on each render so the poll
// loop never re-queries the DOM every tick. Invalidated (rebuilt) below.
let widgetEls = {};
function cacheWidgetEls() {
  widgetEls = {};
  // Bar widgets always; grouped widgets ONLY while their flyout is actually open.
  // The flyout keeps its DOM after closing (until the next open), so gate on
  // stackOpen — otherwise the poll would keep updating hidden grouped widgets.
  const sel = stackOpen ? ".dock .tile.widget, #stack .tile.widget" : ".dock .tile.widget";
  document.querySelectorAll(sel).forEach((el) => {
    const w = el.dataset.widget || "";
    (widgetEls[w] || (widgetEls[w] = [])).push(el);
  });
}

// Remember which ids were on the bar last render, so only genuinely NEW tiles
// animate in (not every tile on an unrelated re-render).
let lastRenderIds = new Set();

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
  // Fade+scale in only the tiles that weren't on the bar before.
  const prevIds = lastRenderIds;
  for (const el of tiles) {
    const id = el.dataset && el.dataset.id;
    if (id && !prevIds.has(id)) el.classList.add("tile-in");
  }
  dockEl.replaceChildren(...tiles);
  lastRenderIds = new Set(cfg.pinned.map((p) => p.id));
  cacheWidgetEls();
  requestAnimationFrame(refreshPreviewMarquees);

  // Friendly empty state: a "+" tile that opens Settings on the Pinned-apps tab
  // (suggestions, widgets, tips) — much clearer than a bare file picker.
  if (!cfg.pinned.some((p) => p.kind !== "separator")) {
    const hint = document.createElement("button");
    hint.className = "tile hint";
    hint.style.setProperty("--size", `${baseSize()}px`);
    hint.title = t("dock.emptyAdd");
    // The capybara mascot waves you in — friendlier than a bare "+".
    hint.innerHTML =
      `<span class="label">${t("dock.emptyAdd")}</span>` +
      `<span class="hint-capy"><img src="/brand/svg/isotype.svg" alt="" draggable="false" />` +
      `<span class="hint-plus-badge">${icon("plus")}</span></span>`;
    hint.addEventListener("click", () => dockApi.openSettingsTab("apps"));
    hint.addEventListener("contextmenu", (e) => openBackgroundMenu(e));
    dockEl.appendChild(hint);
  }

  fitDock();
  // Repaint widget values right away so a freshly built card never lingers on
  // its "…" placeholder (e.g. after adding a widget or any structural re-render).
  // startPolls() does an immediate first paint and is idempotent (it resets its
  // own timer); it self-guards while the dock is tucked away.
  if (!hiddenState) startPolls();
}

// Smallest a shrunk icon may get before we stop shrinking and start scrolling —
// below this they're too tiny to recognise.
const MIN_TILE = 30;

// Keep the dock within the screen no matter how many items are pinned. First
// shrink icons to fit (macOS-style). If even at the minimum size they'd still
// run past the screen, cap the bar to the screen and switch to SCROLL mode
// (wheel + hover the ends) so you can reach the side items — the bar never grows
// past the screen and never "breaks".
function fitDock() {
  setAllSizes(baseSize());
  const vertical = isVertical();
  const span = vertical ? availH() : availW();
  // A slot-aligned bar (start/end) sits behind a 12% offset — that space isn't
  // usable, or a full bar would overflow past the far screen edge.
  const slotPad = cfg && cfg.notchPosition && cfg.notchPosition !== "center" ? span * 0.12 : 0;
  const usable = span - SHADOW_PAD * 2 - 24 - slotPad;
  let overflow = false;
  if (usable > 0) {
    const natural = vertical ? dockEl.scrollHeight : dockEl.scrollWidth;
    if (natural > usable) {
      const eff = Math.floor(baseSize() * (usable / natural));
      if (eff >= MIN_TILE) {
        setAllSizes(eff); // everything still fits at this smaller size
      } else {
        setAllSizes(MIN_TILE); // floor reached → the rest lives behind a scroll
        const natural2 = vertical ? dockEl.scrollHeight : dockEl.scrollWidth;
        overflow = natural2 > usable;
      }
    }
  }
  document.body.classList.toggle("dock-overflow", overflow);
  // Cap the visible bar so the window can never exceed the screen.
  dockEl.style.maxWidth = overflow && !vertical ? `${usable}px` : "";
  dockEl.style.maxHeight = overflow && vertical ? `${usable}px` : "";
  invalidateMag(); // tile sizes/positions just changed → re-measure lazily
}

function appTile(item) {
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

  const addGlyph = () => {
    if (el.querySelector(".glyph, img")) return;
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = (item.name || "?").trim().charAt(0).toUpperCase();
    el.appendChild(glyph);
  };
  const addImg = (src) => {
    const img = document.createElement("img");
    img.alt = item.name;
    // If the icon fails to decode, drop it, show the initial glyph, and forget
    // the cached value so a later render can try extracting it again.
    img.addEventListener("error", () => {
      img.remove();
      iconCache.delete(item.path);
      addGlyph();
    });
    img.src = src;
    el.appendChild(img);
  };
  // Show the icon we already have instantly; otherwise a shimmer skeleton while
  // it extracts (cold app icons take a beat on Windows) — never a blank tile.
  const now = syncIcon(item);
  if (now) {
    addImg(now);
  } else {
    const skel = document.createElement("span");
    skel.className = "glyph skel";
    el.appendChild(skel);
    resolveIcon(item)
      .then((src) => { skel.remove(); src ? addImg(src) : addGlyph(); })
      .catch(() => { skel.remove(); addGlyph(); });
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
function groupTile(item) {
  const el = document.createElement("button");
  el.className = "tile group";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  el.title = item.name || "";

  const grid = document.createElement("span");
  grid.className = "group-grid";
  const setMiniImg = (mini, src) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    mini.appendChild(img);
  };
  const setMiniLetter = (mini, child) => {
    mini.textContent = (child.name || "?").trim().charAt(0).toUpperCase();
  };
  const kids = (item.children || []).slice(0, 4);
  for (const child of kids) {
    const mini = document.createElement("span");
    mini.className = "group-mini";
    if (child.kind === "widget") {
      // A grouped widget previews as its emoji (it only goes live inside the group).
      mini.innerHTML = emo(WIDGET_ICONS[child.widget] || "puzzle", 18);
    } else {
      const now = syncIcon(child);
      if (now) {
        setMiniImg(mini, now);
      } else {
        mini.classList.add("skel");
        resolveIcon(child)
          .then((src) => { mini.classList.remove("skel"); src ? setMiniImg(mini, src) : setMiniLetter(mini, child); })
          .catch(() => { mini.classList.remove("skel"); setMiniLetter(mini, child); });
      }
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
    `<span class="badge trash-count"></span>` +
    `<span class="trash-glyph">${icon("trash")}</span>`;
  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item));
  refreshTrashState(el);
  return el;
}

async function refreshTrashState(el) {
  const tile = el || dockEl.querySelector(".tile.trash");
  if (!tile) return;
  const count = await dockApi.trashCount().catch(() => 0);
  tile.classList.toggle("full", count > 0);
  const badge = tile.querySelector(".trash-count");
  if (badge) badge.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
  tile.title = count > 0 ? `${t("trash.name")} · ${count}` : t("trash.name");
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

const WIDGETS = ["clock", "cpu", "ram", "disk", "net", "uptime", "battery", "notes", "media", "volume", "clipboard"];
// Transport glyphs for the media card — filled, rounded, Fluent-like SVGs.
const MEDIA_SVG = {
  prev: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3.2 2.8c0-.44.36-.8.8-.8s.8.36.8.8v4.1l7-4.63c.8-.53 1.87.04 1.87 1v9.46c0 .96-1.07 1.53-1.87 1L4.8 9.1v4.1c0 .44-.36.8-.8.8s-.8-.36-.8-.8V2.8Z"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12.8 2.8c0-.44-.36-.8-.8-.8s-.8.36-.8.8v4.1l-7-4.63c-.8-.53-1.87.04-1.87 1v9.46c0 .96 1.07 1.53 1.87 1l7-4.63v4.1c0 .44.36.8.8.8s.8-.36.8-.8V2.8Z"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M5.1 2.32c-.87-.5-1.95.13-1.95 1.13v9.1c0 1 1.08 1.63 1.95 1.13l7.9-4.55c.87-.5.87-1.76 0-2.26L5.1 2.32Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M4.1 2.5c-.61 0-1.1.49-1.1 1.1v8.8c0 .61.49 1.1 1.1 1.1h1.3c.61 0 1.1-.49 1.1-1.1V3.6c0-.61-.49-1.1-1.1-1.1H4.1Zm6.5 0c-.61 0-1.1.49-1.1 1.1v8.8c0 .61.49 1.1 1.1 1.1h1.3c.61 0 1.1-.49 1.1-1.1V3.6c0-.61-.49-1.1-1.1-1.1h-1.3Z"/></svg>',
};
// Fluent 3D emoji per widget (bundled — see emoji.js).
const WIDGET_ICONS = {
  clock: "clock", cpu: "brain", ram: "ice", disk: "floppy", net: "antenna",
  uptime: "stopwatch", battery: "battery", notes: "memo", media: "notes",
  volume: "speaker", clipboard: "clipboard",
};
const WIDGET_VARIANTS = ["glass", "solid", "gradient", "outline", "minimal"];
const STAT_WIDGETS = ["cpu", "ram", "disk", "net", "uptime", "battery"];
// Percent-based widgets get a circular progress ring instead of a linear bar —
// reads as a proper gauge (à la Docky/Cooldock) at a glance, and the number
// lives INSIDE the ring instead of stealing space in the label row.
const RING_WIDGETS = ["cpu", "ram", "disk", "battery", "volume"];
const RING_R = 15.5; // SVG viewBox 0 0 36 36
const RING_C = 2 * Math.PI * RING_R;
// Content-carrying widgets get a "preview card": a colored icon square, a bold
// title and a live one-line preview of the actual content — reads like a
// real Windows widget (notification/media card), not a bare label+number.
const PREVIEW_WIDGETS = ["notes", "clipboard"];
// Sensible default ring color per stat, so a freshly-pinned widget already
// reads at a glance (à la Docky/Cooldock) instead of every ring sharing the
// same accent — still fully overridable per-widget via its style modal.
const RING_DEFAULTS = { cpu: "#fb8b24", ram: "#3a86ff", disk: "#8338ec", battery: "#2ecc71", volume: "#06b6d4" };
const BATTERY_LOW = "#e5484d";

function widgetLabel(type) {
  return (
    {
      clock: t("w.clock"), cpu: "CPU", ram: "RAM", disk: t("w.disk"),
      net: t("w.net"), uptime: t("w.uptime"), battery: t("w.battery"), notes: t("w.notes"),
      media: t("w.media"), volume: t("w.volume"), clipboard: t("w.clipboard"),
    }[type] || type
  );
}

function widgetTile(item, { inFlyout = false } = {}) {
  const type = item.widget || "clock";
  const st = item.style || {};
  const el = document.createElement("button");
  el.className = "tile widget" + (inFlyout ? " in-flyout" : "");
  el.dataset.id = item.id;
  el.dataset.widget = type;
  el.dataset.variant = st.variant || "glass";
  if (type === "media" && st.scrollVolume) el.dataset.scrollVolume = "1";
  if (st.color) el.style.setProperty("--w-accent", st.color);
  else if (RING_DEFAULTS[type]) {
    el.style.setProperty("--w-accent", RING_DEFAULTS[type]);
    el.dataset.autoAccent = "1"; // no custom color set → the battery ring may still shift to red when low
  }
  if (st.animated) el.classList.add("animated");
  if (st.icon === false) el.classList.add("no-ico");
  el.style.setProperty("--size", `${baseSize()}px`);
  el.title = widgetLabel(type);

  const card = document.createElement("span");
  card.className = "w-card";
  const isRing = RING_WIDGETS.includes(type);
  const isPreview = PREVIEW_WIDGETS.includes(type);
  if (isPreview) el.classList.add("preview");
  card.innerHTML = isPreview
    ? `<span class="w-pv-ico">${emo(WIDGET_ICONS[type] || "puzzle", 22)}<span class="w-pv-count"></span></span>` +
      `<span class="w-pv-main"><span class="w-pv-title"></span><span class="w-pv-sub"></span></span>` +
      `<span class="w-pv-badge">${icon(type === "notes" ? "pencil" : "chevron-right")}</span>`
    : (isRing
      ? `<span class="w-ring">` +
        `<svg viewBox="0 0 36 36"><circle class="w-ring-track" cx="18" cy="18" r="${RING_R}"/>` +
        `<circle class="w-ring-fill" cx="18" cy="18" r="${RING_R}" style="stroke-dasharray:${RING_C.toFixed(2)};stroke-dashoffset:${RING_C.toFixed(2)}"/></svg>` +
        `<span class="w-ring-num"></span></span>`
      : `<span class="w-ico">${emo(WIDGET_ICONS[type] || "puzzle", 20)}</span>`) +
      `<span class="w-main">` +
      `<span class="w-label"></span>` +
      (isRing ? "" : `<span class="w-value">…</span><span class="w-bar"><i></i></span>`) +
      `</span>`;
  el.appendChild(card);

  // On the bar the widget is a full dock tile (removable, draggable, right-click
  // menu). Inside a group flyout it's just a live read-out — the flyout supplies
  // its own take-out/remove and drag-out gestures, so skip the dock wiring.
  if (!inFlyout) {
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
  }
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
    // still toggles play/pause). Crisp SVG glyphs, not text emoji.
    const controls = document.createElement("span");
    controls.className = "w-controls";
    const mkCtl = (label, svg, fn, cls) => {
      const b = document.createElement("button");
      b.className = "w-ctl" + (cls ? ` ${cls}` : "");
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = svg;
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        // A failing native media call must never bubble as an uncaught error.
        try { await fn(); } catch (_) {}
        setTimeout(refreshMedia, 350); // refresh title/state right away
      });
      controls.appendChild(b);
    };
    mkCtl(t("w.prev"), MEDIA_SVG.prev, () => dockApi.mediaPrev());
    mkCtl(t("w.playPause"), MEDIA_SVG.play, () => dockApi.mediaToggle(), "w-ctl-toggle");
    mkCtl(t("w.next"), MEDIA_SVG.next, () => dockApi.mediaNext());
    card.appendChild(controls);
  }
  if (type === "clock") tickClocks();
  if (type === "notes") {
    el.querySelector(".w-pv-title").textContent = t("w.notes");
    setPreviewSubText(el, st.note || t("w.notesEmpty"), !st.note);
    el.title = st.note ? `${t("w.notes")} — ${st.note}` : widgetLabel("notes");
  }
  if (type === "clipboard") {
    el.querySelector(".w-pv-title").textContent = t("w.clipboard");
    setPreviewSubText(el, t("clip.empty"), true);
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

const REDUCE_MOTION =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Animate an integer from its previous value to the next over ~320ms (easeOut),
// so CPU/RAM/volume tick up smoothly instead of snapping. Cheap: one rAF chain
// per metric, and it no-ops when the value is unchanged or motion is reduced.
function tweenNumber(el, to, fmt) {
  const from = Number(el.dataset.v);
  el.dataset.v = String(to);
  if (REDUCE_MOTION || !Number.isFinite(from) || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const dur = 320;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (p < 1 && el.dataset.v === String(to)) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

// Set a percentage metric (CPU/RAM/disk): label + value% + bar. Extra detail
// goes in the tooltip so nothing overflows the compact card.
function setMetric(el, label, val, title) {
  el.querySelector(".w-label").textContent = label;
  const pct = Math.min(100, Math.max(0, val));
  const ring = el.querySelector(".w-ring-fill");
  if (ring) {
    // Ring widget: the number lives INSIDE the ring, not the label row.
    tweenNumber(el.querySelector(".w-ring-num"), val, (n) => `${n}`);
    ring.style.strokeDashoffset = `${(RING_C * (1 - pct / 100)).toFixed(2)}`;
  } else {
    tweenNumber(el.querySelector(".w-value"), val, (n) => `${n}%`);
    const bar = el.querySelector(".w-bar");
    bar.style.display = "";
    bar.querySelector("i").style.width = `${pct}%`;
  }
  if (title) el.title = title;
}

function setText(el, label, value, title) {
  el.querySelector(".w-label").textContent = label;
  el.querySelector(".w-value").textContent = value;
  el.querySelector(".w-bar").style.display = "none";
  if (title) el.title = title;
}

// Media card text: artist as label, song as value. A title that doesn't fit its
// box scrolls gently in a loop (marquee) instead of being chopped by ellipsis —
// essential on the compact vertical card. Rebuilt only when the song changes so
// the animation never restarts mid-scroll on every poll.
function setMediaText(el, artist, title) {
  el.querySelector(".w-label").textContent = artist;
  el.querySelector(".w-bar").style.display = "none";
  if (el.dataset.mqTitle === title) return;
  el.dataset.mqTitle = title;
  const v = el.querySelector(".w-value");
  v.classList.remove("scroll");
  v.textContent = title;
  // Reduced motion: keep the plain single line (ellipsized by CSS) — never
  // build the doubled-span marquee that would sit clipped and frozen.
  if (REDUCE_MOTION) return;
  if (v.scrollWidth > v.clientWidth + 2) {
    const safe = esc(title);
    v.innerHTML = `<span class="mq"><span>${safe}</span><span>${safe}</span></span>`;
    const mq = v.querySelector(".mq");
    const distance = mq ? mq.scrollWidth / 2 : v.scrollWidth;
    v.style.setProperty("--mq-duration", `${marqueeDuration(distance).toFixed(2)}s`);
    v.classList.add("scroll");
  }
}

function marqueeDuration(distance) {
  // Slow, distance-aware marquee. The old media fallback used 9s for every
  // title, which made long tracks rush across the card. The keyframes hold at
  // rest for the first 12% of each cycle (a readable pause every loop), so the
  // duration is stretched to keep the actual scroll speed unchanged.
  return Math.max(18, Math.min(48, distance / 14)) / 0.88;
}

function setMarqueeText(el, text, keyName, force = false) {
  if (!el) return;
  if (!force && el.dataset[keyName] === text) return;
  el.dataset[keyName] = text;
  el.classList.remove("scroll");
  el.style.removeProperty("--mq-duration");
  el.textContent = text;
  if (REDUCE_MOTION) return; // plain ellipsized line instead of a frozen marquee
  if (!el.clientWidth || el.scrollWidth <= el.clientWidth + 2) return;
  const safe = esc(text);
  el.innerHTML = `<span class="mq"><span>${safe}</span><span>${safe}</span></span>`;
  const mq = el.querySelector(".mq");
  const distance = mq ? mq.scrollWidth / 2 : el.scrollWidth;
  const duration = marqueeDuration(distance);
  el.style.setProperty("--mq-duration", `${duration.toFixed(2)}s`);
  el.classList.add("scroll");
}

function setPreviewSubText(el, text, empty = false, force = false) {
  const sub = el.querySelector(".w-pv-sub");
  if (!sub) return;
  sub.classList.toggle("empty", empty);
  setMarqueeText(sub, text, "mqPreview", force);
}

function dockPreviewSnippet(text, max = 180) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3).trimEnd()}...`;
}

function refreshPreviewMarquees() {
  document.querySelectorAll(".tile.widget.preview").forEach((el) => {
    const sub = el.querySelector(".w-pv-sub");
    if (!sub) return;
    const text =
      sub.dataset.mqPreview ||
      sub.querySelector(".mq > span")?.textContent ||
      sub.textContent ||
      "";
    setPreviewSubText(el, text, sub.classList.contains("empty"), true);
  });
}

// Run fn over every cached element of a widget type (no per-tick DOM query).
function eachWidget(type, fn) {
  const list = widgetEls[type];
  if (list) list.forEach(fn);
}

function tickClocks() {
  if (hiddenState) return; // don't update a tucked-away dock
  const now = new Date();
  const loc =
    { es: "es-ES", en: "en-US", pt: "pt-BR", fr: "fr-FR", de: "de-DE" }[curLang()] || "en-US";
  const time = now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
  eachWidget("clock", (el) => setText(el, date, time));
}

// System stats (CPU/RAM/disk/net/uptime/battery) — one snapshot fans out to
// every stat card on the bar (from the cached element map).
async function pollStats() {
  let s;
  try {
    s = await dockApi.systemStats();
  } catch (_) {
    return;
  }
  if (!s) return;
  eachWidget("cpu", (el) => setMetric(el, "CPU", Math.round(s.cpu)));
  eachWidget("ram", (el) =>
    setMetric(el, "RAM", Math.round(s.mem), `${(s.mem_used_mb / 1024).toFixed(1)} / ${(s.mem_total_mb / 1024).toFixed(0)} GB`));
  eachWidget("disk", (el) =>
    setMetric(el, t("w.disk"), Math.round(s.disk), `${s.disk_used_gb} / ${s.disk_total_gb} GB`));
  eachWidget("net", (el) =>
    setText(el, `↓ ${fmtRate(s.net_down_kbps)}`, `↑ ${fmtRate(s.net_up_kbps)}`, t("w.net")));
  eachWidget("uptime", (el) => setText(el, t("w.uptime"), fmtUptime(s.uptime_secs)));
  eachWidget("battery", (el) => {
    if (s.battery < 0) { setText(el, t("w.battery"), "—"); return; }
    setMetric(el, (s.charging ? "⚡ " : "") + t("w.battery"), s.battery);
    // A ring left at its default color (never manually re-colored) turns red
    // when running low and unplugged — the same "pay attention" cue Windows
    // itself uses, without overriding a color the user picked on purpose.
    if (el.dataset.autoAccent) {
      el.style.setProperty("--w-accent", !s.charging && s.battery <= 20 ? BATTERY_LOW : RING_DEFAULTS.battery);
    }
  });
}

// Now-playing card: the system media session (Spotify, browser, …).
async function pollMedia() {
  const m = await dockApi.mediaInfo().catch(() => null);
  eachWidget("media", (el) => {
    const art = el.querySelector(".w-art");
    const ico = el.querySelector(".w-ico");
    const toggle = el.querySelector(".w-ctl-toggle");
    if (!m) {
      setText(el, t("w.media"), "—", t("w.media"));
      delete el.dataset.mqTitle;
      el.classList.remove("playing");
      if (art) { art.style.display = "none"; art.removeAttribute("data-src"); }
      if (ico) ico.style.display = "";
      if (toggle) toggle.innerHTML = MEDIA_SVG.play;
      return;
    }
    setMediaText(el, m.artist || t("w.media"), m.title || "—");
    el.title = `${m.title} — ${m.artist}`;
    el.classList.toggle("playing", !!m.playing);
    if (toggle) toggle.innerHTML = m.playing ? MEDIA_SVG.pause : MEDIA_SVG.play;
    if (art && m.thumb) {
      // Cross-fade the album art when the track's art actually changes.
      if (art.dataset.src !== m.thumb) {
        art.dataset.src = m.thumb;
        art.style.opacity = "0";
        art.onload = () => { art.style.opacity = "1"; };
        art.src = m.thumb;
      }
      art.style.display = "block";
      if (ico) ico.style.display = "none";
    } else if (art) {
      // Playing something with no artwork → don't leave the previous track's
      // cover showing; fall back to the widget icon.
      art.style.display = "none";
      art.removeAttribute("data-src");
      if (ico) ico.style.display = "";
    }
  });
}

// System volume — scroll changes it, click toggles mute.
let lastVolumePct = NaN;
let volumeWheelTimer = null;
let volumeInfoPending = false;
function renderVolume(pct, muted) {
  lastVolumePct = Number(pct);
  eachWidget("volume", (el) => {
    setMetric(el, muted ? t("w.muted") : t("w.volume"), pct, `${t("w.volume")}: ${pct}%`);
    el.classList.toggle("muted", muted);
  });
}
async function pollVolume() {
  const v = await dockApi.volumeInfo().catch(() => null);
  if (Array.isArray(v)) renderVolume(v[0], !!v[1]);
}
function readVolumeFromTile(tile) {
  const vEl = tile?.querySelector(".w-ring-num");
  const dataValue = Number(vEl?.dataset.v);
  if (Number.isFinite(dataValue)) return dataValue;
  const textValue = parseInt(vEl?.textContent || "", 10);
  return Number.isFinite(textValue) ? textValue : NaN;
}
function queueVolumeSet(next) {
  const pct = Math.max(0, Math.min(100, Math.round(next)));
  renderVolume(pct, false);
  clearTimeout(volumeWheelTimer);
  volumeWheelTimer = setTimeout(() => {
    dockApi.volumeSet(pct).then(refreshVolume, () => {});
  }, 70);
}
function adjustVolumeFromWheel(deltaY, sourceTile) {
  let cur = Number.isFinite(lastVolumePct) ? lastVolumePct : readVolumeFromTile(sourceTile);
  if (!Number.isFinite(cur)) {
    if (volumeInfoPending) return;
    volumeInfoPending = true;
    dockApi.volumeInfo()
      .then((v) => {
        volumeInfoPending = false;
        if (Array.isArray(v)) {
          lastVolumePct = Number(v[0]);
          adjustVolumeFromWheel(deltaY, sourceTile);
        }
      })
      .catch(() => { volumeInfoPending = false; });
    return;
  }
  const step = Math.abs(deltaY) > 80 ? 5 : 3;
  queueVolumeSet(cur + (deltaY > 0 ? -step : step));
}

// Clipboard-history widget: the bar card shows a live PREVIEW of the most
// recent copy (not just a bare count) — reads at a glance, like a real
// notification card. The full list is fetched once, when the flyout opens.
function renderClipboardSummary(count, preview) {
  eachWidget("clipboard", (el) => {
    const shown = preview ? dockPreviewSnippet(preview) : t("clip.empty");
    setPreviewSubText(el, shown, !preview);
    const badge = el.querySelector(".w-pv-count");
    badge.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
    // The tooltip carries the preview snippet too: in a vertical dock the card
    // collapses to icon+badge, so el.title is the only glanceable content.
    el.title = preview
      ? `${t("clip.countHint").replace("{n}", count)} — ${dockPreviewSnippet(preview, 120)}`
      : t("clip.empty");
  });
}
async function pollClipboard() {
  const s = await dockApi.clipboardSummary().catch(() => ({ count: 0, preview: null }));
  renderClipboardSummary(s.count, s.preview);
}

// ONE poll loop drives every live widget on its own cadence — a single timer
// instead of three, and it does nothing while the dock is tucked away. Fewer
// wakeups → lighter on the battery.
let widgetPollTimer = null;
let pollDue = { stats: 0, media: 0, volume: 0 };
// DOM-based so it also sees widgets rendered inside an open group flyout (they
// poll only while visible). widgetEls is rebuilt by cacheWidgetEls on every
// render and on flyout open/close.
function widgetPresent(w) {
  const has = (t) => !!(widgetEls[t] && widgetEls[t].length);
  return Array.isArray(w) ? w.some(has) : has(w);
}
function anyPinnedWidget(predicate, items = cfg?.pinned || []) {
  return items.some((item) =>
    (item.kind === "widget" && predicate(item)) ||
    anyPinnedWidget(predicate, item.children || [])
  );
}
function stopPolls() {
  clearInterval(widgetPollTimer);
  widgetPollTimer = null;
  // Also stop the running-app/trash poll so a tucked-away dock burns zero timer
  // wakeups (not just early-returns). Resumed by startPolls on reveal.
  clearInterval(pollTimer);
  pollTimer = null;
}
function startPolls() {
  clearInterval(widgetPollTimer);
  widgetPollTimer = null;
  if (hiddenState) return; // tucked away → stay idle until revealed
  startRunningPoll(); // running-app indicators + trash badge (independent of widgets)
  const hasClock = widgetPresent("clock");
  const hasStats = widgetPresent(STAT_WIDGETS);
  const hasMedia = widgetPresent("media");
  const hasVolume = widgetPresent("volume") || anyPinnedWidget((item) => item.widget === "media" && !!item.style?.scrollVolume);
  const hasClipboard = widgetPresent("clipboard");
  // Nothing live pinned → no timer at all (zero idle cost).
  if (!hasClock && !hasStats && !hasMedia && !hasVolume && !hasClipboard) return;
  // First paint immediately so cards aren't blank until the first tick, then
  // schedule each poll a full interval out (no wasteful double-poll at start).
  if (hasClock) tickClocks();
  if (hasStats) pollStats();
  if (hasMedia) pollMedia();
  if (hasVolume) pollVolume();
  if (hasClipboard) pollClipboard();
  const t0 = Date.now();
  pollDue = { stats: t0 + 2400, media: t0 + 3000, volume: t0 + 4000, clipboard: t0 + 4000 };
  // Base cadence: 1 s only when a clock needs the second/minute rollover;
  // otherwise 1.5 s is plenty and lighter.
  const base = hasClock ? 1000 : 1500;
  widgetPollTimer = setInterval(() => {
    if (hiddenState) return; // don't poll a tucked-away dock
    const now = Date.now();
    if (hasClock) tickClocks();
    if (hasStats && now >= pollDue.stats) { pollDue.stats = now + 2400; pollStats(); }
    if (hasMedia && now >= pollDue.media) { pollDue.media = now + 3000; pollMedia(); }
    if (hasVolume && now >= pollDue.volume) { pollDue.volume = now + 4000; pollVolume(); }
    if (hasClipboard && now >= pollDue.clipboard) { pollDue.clipboard = now + 4000; pollClipboard(); }
  }, base);
}
// Nudge a specific poll right away (e.g. after a transport/volume button).
function refreshMedia() { pollDue.media = 0; if (!hiddenState) pollMedia(); }
function refreshVolume() { pollDue.volume = 0; if (!hiddenState) pollVolume(); }
function refreshClipboard() { pollDue.clipboard = 0; if (!hiddenState) pollClipboard(); }

async function addWidget(type) {
  cfg.pinned.push({ id: uid(), name: widgetLabel(type), path: "", args: [], kind: "widget", widget: type });
  await persist();
  await emitConfigChanged();
  await render();
  reframe();
}

// Pinned pictures show their own thumbnail instead of a generic file icon.
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp|ico)$/i;

// The icon we can show RIGHT NOW without any async work (library glyph, custom
// override, or a cached extraction). null → it needs async extraction, so the
// caller shows a skeleton and fills in via resolveIcon().
function syncIcon(item) {
  if (isLibIcon(item.icon)) return resolveLibIcon(item.icon);
  if (item.icon) return item.icon;
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  return null;
}

async function resolveIcon(item) {
  if (isLibIcon(item.icon)) return resolveLibIcon(item.icon); // built-in library glyph
  if (item.icon) return item.icon; // custom override (data URI or path-as-uri)
  if (iconCache.has(item.path)) return iconCache.get(item.path);
  let uri;
  try {
    uri = IMAGE_EXT.test(item.path || "")
      ? (await dockApi.imageDataUri(item.path)) || (await dockApi.appIcon(item.path))
      : await dockApi.appIcon(item.path);
  } catch (_) {
    uri = null;
  }
  // Only cache a real icon — never a failed/empty result, so a transient
  // extraction failure retries on the next render instead of sticking forever.
  if (uri) iconCache.set(item.path, uri);
  return uri;
}

// Notes widget: click it to jot a note in a small editor that saves as you go.
let noteEditor = null;
function closeNoteEditor() {
  if (noteEditor) noteEditor.remove();
  noteEditor = null;
  reframe();
}
function editNote(item) {
  closeNoteEditor();
  const tile = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
  if (!tile) return;
  const ta = document.createElement("textarea");
  ta.className = "note-editor";
  ta.value = (item.style && item.style.note) || "";
  ta.placeholder = t("w.notesEmpty");
  document.body.appendChild(ta);
  noteEditor = ta;
  pinnedReveal = true; // keep the dock open while writing
  applyFrame(); // grow the window so the editor isn't clipped
  const place = () => {
    const r = tile.getBoundingClientRect();
    const gap = 10;
    const w = ta.offsetWidth, h = ta.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    let y = cfg.edge === "top" ? r.bottom + gap : r.top - h - gap;
    if (isVertical()) {
      y = r.top + r.height / 2 - h / 2;
      x = cfg.edge === "left" ? r.right + gap : r.left - w - gap;
    }
    ta.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 6))}px`;
    ta.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 6))}px`;
  };
  place();
  setTimeout(() => { place(); ta.focus(); ta.select(); }, 80);
  const save = () => {
    item.style = { ...(item.style || {}), note: ta.value };
    eachWidget("notes", (el) => {
      if (el.dataset.id !== item.id) return;
      setPreviewSubText(el, ta.value || t("w.notesEmpty"), !ta.value);
      el.title = ta.value ? `${t("w.notes")} — ${ta.value}` : widgetLabel("notes");
    });
    persist();
  };
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { save(); closeNoteEditor(); pinnedReveal = false; scheduleHide(); }
  });
  ta.addEventListener("blur", () => { save(); closeNoteEditor(); pinnedReveal = false; scheduleHide(); });
}

// ─────────────────────────── Launch ───────────────────────────

function launch(el, item) {
  // Widgets aren't launchers — except the media card, where a click is
  // play/pause. Others do nothing on click.
  if (item.kind === "widget") {
    if (item.widget === "media") dockApi.mediaToggle().then(refreshMedia, () => {});
    if (item.widget === "volume") dockApi.volumeMute().then(refreshVolume, () => {});
    if (item.widget === "notes") editNote(item);
    if (item.widget === "clipboard") toggleClipboardStack(el);
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
  // Launcher + switcher: when "focus if running" is enabled and the app already
  // has a window, bring it to the front instead of launching a new instance.
  // Off by default — each click launches (single-instance apps focus themselves).
  const hwnd = el.dataset.hwnd;
  if (cfg.focusIfRunning && el.dataset.running === "true" && hwnd) {
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

async function addPaths(paths, forceKind, atIndex = null) {
  const items = [];
  for (const path of paths) {
    if (isRecycleBin(path)) {
      // Only one trash tile makes sense; if it's already there, skip silently.
      if (!cfg.pinned.some((p) => p.kind === "trash")) {
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
  if (atIndex == null || atIndex >= cfg.pinned.length) cfg.pinned.push(...items);
  else cfg.pinned.splice(Math.max(0, atIndex), 0, ...items);
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
  // Drop "live" mode first so restoring the transform transition lets the tiles
  // ease smoothly back to rest instead of snapping.
  dockEl.classList.remove("mag-live");
  dockEl.querySelectorAll(".tile").forEach((t) => {
    t.style.transform = "";
    t.classList.remove("focus");
  });
  magFocus = null;
}

// Cached tile geometry for magnify: measured ONCE per layout (transforms don't
// affect offsetLeft/Top, so the resting centers stay valid), then reused on
// every pointer move — no more read/write layout thrashing in the hot loop.
let magCache = null;
let magFocus = null;
let magDockRect = null;
function invalidateMag() {
  magCache = null;
  magDockRect = null;
  magFocus = null;
}
function buildMagCache() {
  const vertical = isVertical();
  // Measure the bar's viewport rect ONCE here (it only moves on reframe/edge
  // change, both of which invalidate the cache) so the hot per-frame loop never
  // reads layout again — pure compositor writes = smooth at any refresh rate.
  magDockRect = dockEl.getBoundingClientRect();
  magCache = [...dockEl.querySelectorAll(".tile")].map((el) => ({
    el,
    center: vertical ? el.offsetTop + el.offsetHeight / 2 : el.offsetLeft + el.offsetWidth / 2,
    // Widgets are info CARDS, not launch icons — scaling a big media/clock card
    // covers its neighbours, so they (and separators) don't magnify.
    noMag: el.classList.contains("separator") || el.classList.contains("widget"),
  }));
}

// Booki magnify — tasteful, CONTAINED scaling. Tiles keep their layout slot and
// scale visually (CSS transform), growing into the bar's edge-side padding so
// nothing overflows the window (no clipping, no resize per frame). The hovered
// tile gets a subtle glow. The measuring pass is cached; this loop only writes.
function magnify(clientX, clientY) {
  if (cfg.magnification === false || (cfg.magnifyStyle || "spring") === "off") return;
  if (dockEl.classList.contains("dragging") || editMode) return;
  // In scroll (overflow) mode the bar clips its ends, so a scaled tile would be
  // cut off — skip magnify; the name still shows via tooltip on hover.
  if (document.body.classList.contains("dock-overflow")) return;
  if (!magCache) buildMagCache();
  // Follow the pointer 1:1 this frame (no CSS transition lag) — the settle when
  // you leave still eases. This is what makes it feel crisp at high refresh.
  dockEl.classList.add("mag-live");
  const base = baseSize();
  const maxScale = Math.max(1, cfg.zoom || 1.25);
  const spread = base * 1.5;
  const vertical = isVertical();
  const liftAxis = vertical ? "X" : "Y";
  const liftSign = (vertical ? cfg.edge === "left" : cfg.edge === "top") ? 1 : -1;
  const dr = magDockRect;
  const pointer = vertical ? clientY - dr.top : clientX - dr.left;
  let best = null;
  let bestInf = 0;
  for (const item of magCache) {
    const influence = item.noMag ? 0 : Math.max(0, 1 - (Math.abs(pointer - item.center) / spread) ** 2);
    const scale = item.noMag ? 1 : 1 + (maxScale - 1) * influence;
    // A small lift toward the screen interior (translate BEFORE scale so it
    // stays a constant px amount regardless of zoom).
    const lift = Math.round(influence * 6);
    const liftTf = lift ? `translate${liftAxis}(${liftSign * lift}px) ` : "";
    item.el.style.transform = `${liftTf}scale(${scale.toFixed(3)})`;
    if (!item.noMag && influence > bestInf) {
      bestInf = influence;
      best = item.el;
    }
  }
  const focus = best && bestInf > 0.45 ? best : null;
  if (focus !== magFocus) {
    if (magFocus) magFocus.classList.remove("focus");
    if (focus) focus.classList.add("focus");
    magFocus = focus;
  }
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
    { emoji: emo("pointer", 22), text: t("ob.step1") },
    { emoji: emo("card", 22), text: t("ob.step2") },
    { emoji: emo("beaver", 22), text: t("ob.step3") },
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
  const tile = closestSel(e.target, ".tile");
  if (!tile) {
    dockApi.openSettings(); // double-click the empty bar → Settings
    return;
  }
  // Double-click a widget → jump to its editor (styles/colors live in Apps).
  if (tile.classList.contains("widget")) dockApi.openSettingsTab("apps");
});

// Middle-click an app/folder/file pin → open its location in Explorer.
dockEl.addEventListener("auxclick", (e) => {
  if (e.button !== 1) return;
  const tile = closestSel(e.target, ".tile");
  if (!tile || !tile.dataset.id) return;
  const item = cfg.pinned.find((p) => p.id === tile.dataset.id);
  if (item && item.path && (item.kind === "app" || item.kind === "folder")) {
    e.preventDefault();
    dockApi.openLocation(item.path);
  }
});

// Drag the empty bar to MOVE the dock to another edge — with a live preview so
// you SEE where it will land instead of it teleporting: the window grows to
// cover the screen, four anchor targets light up, and a ghost bar slides to
// whichever edge is nearest the cursor. Release commits; Esc cancels. Nearest-
// edge (not dominant-direction) makes the anchors forgiving, not rigid.
let edgeMove = null;
let edgeOverlay = null;

function buildEdgeOverlay() {
  if (edgeOverlay) return edgeOverlay;
  const o = document.createElement("div");
  o.id = "edge-overlay";
  o.className = "hidden";
  o.innerHTML =
    ["top", "bottom", "left", "right"]
      .map((ed) => `<div class="edge-zone edge-zone-${ed}" data-edge="${ed}"><span class="edge-zone-dot"></span></div>`)
      .join("") + `<div class="edge-ghost" aria-hidden="true"></div>`;
  document.body.appendChild(o);
  edgeOverlay = o;
  return o;
}

// Nearest of the four edges to a point inside the (work-area-sized) window.
function edgeMoveTarget(x, y, W, H) {
  const d = { top: y, bottom: H - y, left: x, right: W - x };
  return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
}

function updateEdgePreview(x, y) {
  if (!edgeMove || !edgeMove.ready) return;
  const { W, H } = edgeMove;
  const target = edgeMoveTarget(x, y, W, H);
  edgeMove.target = target;
  edgeOverlay.querySelectorAll(".edge-zone").forEach((z) =>
    z.classList.toggle("active", z.dataset.edge === target));
  const g = edgeOverlay.querySelector(".edge-ghost");
  const vert = target === "left" || target === "right";
  const len = Math.min(edgeMove.barLen, (vert ? H : W) * 0.7);
  const thick = edgeMove.barThick;
  const m = 14;
  if (vert) {
    g.style.width = `${thick}px`;
    g.style.height = `${len}px`;
    g.style.top = `${(H - len) / 2}px`;
    g.style.left = target === "left" ? `${m}px` : `${W - thick - m}px`;
  } else {
    g.style.width = `${len}px`;
    g.style.height = `${thick}px`;
    g.style.left = `${(W - len) / 2}px`;
    g.style.top = target === "top" ? `${m}px` : `${H - thick - m}px`;
  }
}

async function enterEdgeMove() {
  // Capture the bar's footprint BEFORE the window grows (afterwards it reflows
  // against the huge window and the numbers stop meaning anything).
  const r = dockEl.getBoundingClientRect();
  const vert = isVertical();
  edgeMove.barLen = Math.round(vert ? r.height : r.width) || 320;
  edgeMove.barThick = Math.round(vert ? r.width : r.height) || 54;
  buildEdgeOverlay();
  document.body.classList.add("edge-moving");
  let css = null;
  try { css = await dockApi.dockCoverWorkarea(); } catch (_) {}
  if (!edgeMove) return; // released/cancelled while the resize was in flight
  edgeMove.W = (css && css[0]) || window.innerWidth;
  edgeMove.H = (css && css[1]) || window.innerHeight;
  edgeOverlay.classList.remove("hidden");
  edgeMove.ready = true;
  updateEdgePreview(edgeMove.lastX, edgeMove.lastY);
}

function endEdgeMove(commit) {
  const mv = edgeMove;
  edgeMove = null;
  if (edgeOverlay) edgeOverlay.classList.add("hidden");
  document.body.classList.remove("edge-moving");
  if (!mv || !mv.active) return; // never grew the window → nothing to restore
  // The OS window was grown to cover the screen, but lastFull still holds the
  // bar-sized frame — so applyFrame() would no-op and leave the window huge.
  // Force it to re-issue the real frame.
  lastFull = null;
  const target = mv.target;
  if (commit && target && target !== cfg.edge) {
    // Land on the new edge with a pop so the move reads as motion, not a jump.
    cfg.edge = target;
    applyEdge(cfg);
    fitDock();
    document.body.classList.add("edge-swap");
    applyFrame();
    dockApi.setDockEdge(target).catch(() => {});
    setTimeout(() => requestAnimationFrame(() => document.body.classList.remove("edge-swap")), 90);
  } else {
    applyFrame(); // same edge or cancelled → just shrink the window back to the bar
  }
}

dockEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || closestSel(e.target, ".tile")) return;
  edgeMove = {
    x: e.screenX, y: e.screenY, active: false, ready: false,
    lastX: e.clientX, lastY: e.clientY, target: cfg.edge,
  };
  try { dockEl.setPointerCapture(e.pointerId); } catch (_) {}
});
window.addEventListener("pointermove", (e) => {
  if (!edgeMove) return;
  edgeMove.lastX = e.clientX;
  edgeMove.lastY = e.clientY;
  if (!edgeMove.active) {
    const dx = e.screenX - edgeMove.x;
    const dy = e.screenY - edgeMove.y;
    if (Math.hypot(dx, dy) < 20) return; // small threshold → forgiving, not rigid
    edgeMove.active = true;
    enterEdgeMove();
    return;
  }
  updateEdgePreview(e.clientX, e.clientY);
});
window.addEventListener("pointerup", () => { if (edgeMove) endEdgeMove(true); });
window.addEventListener("pointercancel", () => { if (edgeMove) endEdgeMove(false); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && edgeMove) endEdgeMove(false);
});

// Mouse wheel over a widget → cycle its visual style (a fun, fast tweak).
let wheelSaveTimer = null;
dockEl.addEventListener(
  "wheel",
  (e) => {
    // In overflow (scroll) mode, the wheel pans the bar so you can reach the
    // side items — unless you're over a widget (which keeps its own wheel use).
    if (document.body.classList.contains("dock-overflow") && !closestSel(e.target, ".tile.widget")) {
      e.preventDefault();
      const amt = (e.deltaY || e.deltaX) * 1.2;
      if (isVertical()) dockEl.scrollTop += amt;
      else dockEl.scrollLeft += amt;
      return;
    }
    const w = closestSel(e.target, ".tile.widget");
    if (!w) return;
    e.preventDefault();
    const item = findPinnedById(w.dataset.id);
    if (!item) return;
    if (w.dataset.widget === "media" && item.style?.scrollVolume) {
      adjustVolumeFromWheel(e.deltaY || e.deltaX, w);
      return;
    }
    // The volume card is the exception: scrolling it changes the volume
    // (the natural gesture), not the visual variant.
    if (w.dataset.widget === "volume") {
      // Read the settled value (dataset.v), not the tween's mid-animation text.
      const vEl = w.querySelector(".w-ring-num");
      const cur = Number(vEl.dataset.v) || parseInt(vEl.textContent, 10) || 0;
      const next = Math.max(0, Math.min(100, cur + (e.deltaY > 0 ? -3 : 3)));
      queueVolumeSet(next);
      return;
    }
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
let magPointer = { x: 0, y: 0 };
dockEl.addEventListener("pointermove", (e) => {
  // Always keep the freshest pointer position; coalesce to one magnify per frame
  // so it runs exactly at the display's refresh (crisp at 60/120/144Hz alike).
  magPointer.x = e.clientX;
  magPointer.y = e.clientY;
  if (edgeMove) return; // moving the whole dock to another edge — no magnify
  if (document.body.classList.contains("dock-overflow")) { edgeAutoScroll(); return; }
  if (magnifyRaf) return;
  magnifyRaf = requestAnimationFrame(() => {
    magnifyRaf = 0;
    magnify(magPointer.x, magPointer.y);
  });
});
dockEl.addEventListener("pointerleave", () => { resetMagnify(); stopEdgeScroll(); });

// Overflow mode: hovering near an end of the bar auto-scrolls it that way, so you
// can reach the side items by just moving the cursor there (macOS-Genie style).
let edgeScrollRaf = 0;
let edgeScrollVel = 0;
function edgeAutoScroll() {
  const vertical = isVertical();
  const r = dockEl.getBoundingClientRect();
  const pos = vertical ? magPointer.y : magPointer.x;
  const lo = vertical ? r.top : r.left;
  const hi = vertical ? r.bottom : r.right;
  const zone = Math.min(90, (hi - lo) * 0.18);
  if (pos < lo + zone) edgeScrollVel = -Math.ceil((lo + zone - pos) / 6);
  else if (pos > hi - zone) edgeScrollVel = Math.ceil((pos - (hi - zone)) / 6);
  else edgeScrollVel = 0;
  if (edgeScrollVel && !edgeScrollRaf) {
    const tick = () => {
      if (!edgeScrollVel || !document.body.classList.contains("dock-overflow")) { edgeScrollRaf = 0; return; }
      if (isVertical()) dockEl.scrollTop += edgeScrollVel;
      else dockEl.scrollLeft += edgeScrollVel;
      edgeScrollRaf = requestAnimationFrame(tick);
    };
    edgeScrollRaf = requestAnimationFrame(tick);
  }
}
function stopEdgeScroll() { edgeScrollVel = 0; }

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
  press = { el, item, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
  // Long-press on an app/folder enters edit mode (iOS-style).
  if (item.kind !== "separator" && !editMode) {
    press.longTimer = setTimeout(enterEdit, 550);
  }
  window.addEventListener("pointermove", onPressMove);
  window.addEventListener("pointerup", onPressUp, { once: true });
}

let mergeEl = null; // tile currently armed as a folder (merge) target
let mergeArm = 0; // timestamp hovering the current target's center began
let dragClone = null; // floating copy of the tile that follows the pointer
let willUnpin = false; // pointer pulled far from the bar → release = unpin

function clearMerge() {
  if (mergeEl) mergeEl.classList.remove("merge-target");
  mergeEl = null;
  mergeArm = 0;
}

function killClone() {
  if (dragClone) dragClone.remove();
  dragClone = null;
  willUnpin = false;
}

// Distance from the pointer to the bar, measured AWAY from the anchored edge.
function pullDistance(e) {
  const r = dockEl.getBoundingClientRect();
  if (cfg.edge === "top") return e.clientY - r.bottom;
  if (cfg.edge === "left") return e.clientX - r.right;
  if (cfg.edge === "right") return r.left - e.clientX;
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
    if (press && pressMoveEv) processMove(pressMoveEv);
  });
}
function processMove(e) {
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
    // Capture the pointer so moves keep firing even once the cursor leaves the
    // dock's small window — otherwise the "pull far out to unpin" gesture could
    // never reach its threshold with a mouse (mice get no implicit capture).
    try { press.el.setPointerCapture(press.pointerId); } catch (_) {}
    // A floating copy follows the pointer; the real tile stays as a ghost slot,
    // so you SEE what you're moving instead of it teleporting between slots.
    const r = press.el.getBoundingClientRect();
    dragClone = press.el.cloneNode(true);
    dragClone.className = "tile drag-clone";
    dragClone.style.width = `${r.width}px`;
    dragClone.style.height = `${r.height}px`;
    press.grabX = e.clientX - r.left;
    press.grabY = e.clientY - r.top;
    document.body.appendChild(dragClone);
  }
  if (dragClone) {
    dragClone.style.left = `${e.clientX - press.grabX}px`;
    dragClone.style.top = `${e.clientY - press.grabY}px`;
  }

  // Pulled clearly out of the bar's window → dropping here
  // unpins (macOS-style). Reachable now that the pointer is captured.
  const pulling = pullDistance(e) > 64;
  if (pulling !== willUnpin) {
    willUnpin = pulling;
    if (dragClone) dragClone.classList.toggle("will-unpin", willUnpin);
    press.el.classList.toggle("unpin-slot", willUnpin);
  }
  if (willUnpin) {
    clearMerge();
    return; // no reordering/merging while aiming outside the bar
  }

  const sibs = [...dockEl.querySelectorAll(".tile[data-id]")].filter((s) => s !== press.el);

  // Hovering the CENTER of another tile → group (merge) intent. Apps and widgets
  // can both be grouped now (widgets go live only inside the group). Separators,
  // the trash tile and groups-into-groups never form a group.
  const canMerge = press.item.kind === "app" || press.item.kind === "widget";
  let centerTarget = null;
  if (canMerge) {
    for (const s of sibs) {
      if (s.classList.contains("separator") || s.classList.contains("trash")) continue;
      const r = s.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Aim near the centre to group; anywhere else reorders. A roomy bullseye
        // makes grouping easy without grouping by accident on a quick pass-over.
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
    // Hold on the centre a moment longer before arming the merge — a quick pass
    // over a tile while reordering should never fold things into a folder.
    if (Date.now() - mergeArm > 260) centerTarget.classList.add("merge-target");
    return; // aiming at the bullseye → hold for a merge, don't reorder
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
  cancelAnimationFrame(pressMoveRaf);
  pressMoveRaf = 0;
  const p = press;
  press = null;
  if (!p) return;
  clearTimeout(p.longTimer);
  try { p.el.releasePointerCapture(p.pointerId); } catch (_) {}
  if (dragging) {
    dragging = false;
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
      await removeItem(p.item.id);
      await emitConfigChanged();
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
  cancelAnimationFrame(pressMoveRaf);
  pressMoveRaf = 0;
  if (press) { try { press.el.releasePointerCapture(press.pointerId); } catch (_) {} }
  const wasDragging = dragging;
  press = null;
  dragging = false;
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

// Remove a child from a group entirely (unpin), dissolving the folder if it's
// left with fewer than 2 items — matches the dock's own pull-out-to-remove.
async function removeChildFromGroup(group, childId) {
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const grp = cfg.pinned[gi];
  const kids = (grp.children || []).filter((c) => c.id !== childId);
  let reopenId = grp.id;
  if (kids.length < 2) {
    cfg.pinned.splice(gi, 1, ...kids); // dissolve: leftover (if any) returns to the dock
    reopenId = null;
  } else {
    grp.children = kids;
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

// Let a flyout child be dragged out of the panel to unpin it. Pointer-based (no
// native drag → no stray files); a floating clone follows the cursor and a poof
// confirms removal. A plain click still launches (the drag suppresses it).
function wireStackDragOut(cell, group, child) {
  let st = null;
  cell.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || closestSel(e.target, ".stack-rm")) return;
    st = { x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId };
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
    // Dragged clear of the flyout panel → releasing here removes it.
    const sr = stackEl.getBoundingClientRect();
    const out =
      e.clientX < sr.left - 8 || e.clientX > sr.right + 8 ||
      e.clientY < sr.top - 8 || e.clientY > sr.bottom + 8;
    if (out !== st.out) { st.out = out; st.clone.classList.toggle("will-unpin", out); }
  });
  const finish = async () => {
    if (!st) return;
    const s = st;
    st = null;
    try { cell.releasePointerCapture(s.pointerId); } catch (_) {}
    cell.classList.remove("dragging");
    if (!s.moved) return; // a click, not a drag → the click handler launches
    cell._suppressClick = true;
    setTimeout(() => { cell._suppressClick = false; }, 0);
    if (s.out) {
      if (s.clone) {
        const c = s.clone;
        c.classList.add("poof");
        setTimeout(() => c.remove(), 280);
      }
      await removeChildFromGroup(group, child.id);
    } else if (s.clone) {
      s.clone.remove();
    }
  };
  cell.addEventListener("pointerup", finish);
  cell.addEventListener("pointercancel", finish);
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

function menuPinTitle(item) {
  if (!item) return "Booki";
  if (item.kind === "separator") return t("m.separator");
  if (item.kind === "trash") return t("trash.name");
  if (item.kind === "widget") return widgetLabel(item.widget);
  return item.name || baseName(item.path || "") || t("m.pin");
}

function menuKindLabel(item) {
  if (!item) return t("m.system");
  if (item.kind === "widget") return t("m.widgets");
  if (item.kind === "folder") return t("m.folder");
  if (item.kind === "group") return t("m.group");
  if (item.kind === "separator") return t("m.separator");
  if (item.kind === "trash") return t("trash.name");
  return t("m.app");
}

function addMenuHead(title, subtitle) {
  const head = document.createElement("div");
  head.className = "menu-head";
  head.innerHTML = `<strong>${esc(title)}</strong><span>${esc(subtitle || "")}</span>`;
  ctxMenu.appendChild(head);
}

function addMenuLabel(text) {
  const label = document.createElement("div");
  label.className = "menu-label";
  label.textContent = text;
  ctxMenu.appendChild(label);
}

function openMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const add = (iconName, text, fn, tone = "") => {
    const b = document.createElement("button");
    if (tone) b.classList.add(tone);
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
  addMenuHead(menuPinTitle(item), menuKindLabel(item));

  // The menu adapts to what you clicked: widgets have nothing to "open",
  // folders get a straight jump to Explorer, only apps get recents.
  let hasPrimaryActions = false;
  if (item.kind !== "separator" && item.kind !== "widget") {
    addMenuLabel(t("m.actions"));
    hasPrimaryActions = true;
    const openIcon = item.kind === "folder" || item.kind === "group" ? "folder" : item.kind === "trash" ? "trash" : "app";
    add(openIcon, t("m.open"), () => {
      if (item.kind === "folder" || item.kind === "group") {
        const tileEl = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
        if (tileEl) toggleStack(tileEl, item);
      } else if (item.kind === "trash") {
        dockApi.launch("shell:RecycleBinFolder", []);
      } else {
        dockApi.launch(item.path, item.args || []);
      }
    });
    if (item.kind === "folder")
      add("external", t("stack.openExplorer"), () => dockApi.launch(item.path, []));
    // Recents (a lightweight jump list of files opened with this app via Booki).
    if (item.kind === "app" && (item.recents || []).length) {
      sep();
      addMenuLabel(t("m.recent"));
      item.recents.slice(0, 6).forEach((rp) =>
        add("external", baseName(rp), () => dockApi.launch(item.path, [rp]))
      );
    }
    // A custom icon only makes sense for apps/folders (groups show a mini-grid,
    // widgets show their card) — so don't offer it for those.
    if (item.kind === "app" || item.kind === "folder") {
      add("palette", t("m.changeIcon"), () => changeIcon(item));
      if (item.icon) add("x", t("m.removeIcon"), () => clearIcon(item));
    }
    if (item.kind === "group") add("grid", t("group.ungroup"), () => ungroup(item));
    if (item.kind === "trash") add("trash", t("trash.empty"), () => confirmTrash([], true), "danger");
  }
  // Slot for the system's recent files (filled asynchronously for app pins so
  // opening the menu stays instant).
  let recentsSlot = null;
  if (item.kind === "app") {
    recentsSlot = document.createElement("div");
    recentsSlot.className = "ctx-recents";
    ctxMenu.appendChild(recentsSlot);
  }
  if (hasPrimaryActions) sep();
  addMenuLabel(t("m.add"));
  add("plus", t("m.addApp"), onAddApp);
  add("folder-plus", t("m.addFolder"), onAddFolder);
  add("grid", t("m.addSep"), () => addSeparatorAfter(item.id));
  sep();
  add("trash", t("m.remove"), () => removeItem(item.id), "danger");
  addMenuLabel(t("m.system"));
  add("settings", t("m.settings"), () => dockApi.openSettings());

  placeMenu(e);
  if (recentsSlot) fillRecentFiles(recentsSlot, e, item);
}

// Recent files for THIS app only (matched by file association in the backend)
// dropped into the pin's context menu. Runs after the menu is already on
// screen; re-places it once the items are in. Nothing relevant -> no section.
async function fillRecentFiles(slot, e, item) {
  let recents = [];
  try {
    recents = await dockApi.recentFilesFor(item.path, 6);
  } catch (_) {
    return;
  }
  if (!recents || !recents.length || !slot.isConnected) return;
  const head = document.createElement("div");
  head.className = "menu-label";
  head.textContent = t("m.recent");
  slot.appendChild(head);
  recents.forEach((r) => {
    const b = document.createElement("button");
    b.innerHTML = `${icon("external")}<span>${esc(r.name)}</span>`;
    b.title = r.name;
    b.addEventListener("click", async () => {
      closeMenu();
      await dockApi.launch(r.path, []);
    });
    slot.appendChild(b);
  });
  const s = document.createElement("div");
  s.className = "sep";
  slot.appendChild(s);
  placeMenu(e); // re-measure now that the menu is taller
}

// Right-click on empty dock area / hint → add + profiles + settings.
async function openBackgroundMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const add = (iconName, text, fn, tone = "") => {
    const b = document.createElement("button");
    if (tone) b.classList.add(tone);
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
  addMenuHead("Booki", t("m.dockMenu"));
  addMenuLabel(t("m.add"));
  add("plus", t("m.addApp"), onAddApp);
  add("folder-plus", t("m.addFolder"), onAddFolder);
  // Widgets as a compact chip grid (emoji + tooltip) — ten text rows would
  // make the menu taller than the screen's worth of attention.
  // Only offer widgets you don't already have — no point adding a second CPU
  // meter or clock. When they're all added, the whole section disappears.
  const availableWidgets = WIDGETS.filter((type) => !widgetPresent(type));
  if (availableWidgets.length) {
    sep();
    addMenuLabel(t("m.widgets"));
    const grid = document.createElement("div");
    grid.className = "menu-grid";
    for (const type of availableWidgets) {
      const chip = document.createElement("button");
      chip.className = "menu-chip";
      chip.title = widgetLabel(type);
      chip.innerHTML = `${emo(WIDGET_ICONS[type] || "puzzle", 18)}<span>${esc(widgetLabel(type))}</span>`;
      chip.addEventListener("click", async () => {
        closeMenu();
        await addWidget(type);
      });
      grid.appendChild(chip);
    }
    ctxMenu.appendChild(grid);
  }
  // Saved profiles → one-click switch, right from the dock. The active one
  // (last applied/saved) is marked with a check.
  const profiles = await dockApi.profileList().catch(() => []);
  if (Array.isArray(profiles) && profiles.length) {
    sep();
    addMenuLabel(t("m.profiles"));
    for (const name of profiles.slice(0, 6)) {
      const active = name === (cfg.lastProfile || "");
      add(active ? "check" : "sparkles", name, async () => {
        const fresh = await dockApi.profileApply(name).catch(() => null);
        if (fresh) {
          cfg = fresh;
          applyAll();
          await render();
          reframe();
        }
      });
    }
  }
  sep();
  addMenuLabel(t("m.system"));
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
    // Clamp BOTH axes into the window — a long menu near a corner used to get
    // sliced at the window edge (worst on vertical docks).
    if (isVertical()) {
      const top = Math.min(Math.max(pad, cy - mh / 2), window.innerHeight - mh - pad);
      ctxMenu.style.top = `${top}px`;
      let left = cfg.edge === "left" ? dr.right + gap : dr.left - mw - gap;
      left = Math.min(Math.max(pad, left), window.innerWidth - mw - pad);
      ctxMenu.style.left = `${left}px`;
    } else {
      const left = Math.min(Math.max(pad, cx - mw / 2), window.innerWidth - mw - pad);
      ctxMenu.style.left = `${left}px`;
      let top = cfg.edge === "top" ? dr.bottom + gap : dr.top - mh - gap;
      top = Math.min(Math.max(pad, top), window.innerHeight - mh - pad);
      ctxMenu.style.top = `${top}px`;
    }
  };
  put();
  // The window resizes asynchronously after applyFrame(); reposition again the
  // moment it actually settles (via the resize hook) AND on a short fallback, so
  // the menu can never end up clipped by a window that grew a beat too late.
  pendingReplace = put;
  setTimeout(() => {
    requestAnimationFrame(() => {
      put();
      ctxMenu.style.visibility = "";
    });
  }, 90);
}
function closeMenu() {
  if (ctxMenu.classList.contains("hidden")) return;
  ctxMenu.classList.add("hidden");
  document.body.classList.remove("menu-open");
  pendingReplace = null;
  reframe();
}

// When the dock window finishes resizing (async, after applyFrame), re-place the
// overlay that's currently open so it can't be left clipped by a slow resize.
let pendingReplace = null;
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
  // Play a quick fade+scale-out on the tile before the re-render swaps it away.
  const el = dockEl.querySelector(`.tile[data-id="${id}"]`);
  if (el && !REDUCE_MOTION) {
    el.classList.add("tile-out");
    await new Promise((r) => setTimeout(r, 170));
  }
  cfg.pinned = cfg.pinned.filter((a) => a.id !== id);
  await persist();
  await emitConfigChanged(); // keep the Settings "pinned apps" list in sync
  await render();
  reframe();
}

// ─────────────────── Window frame (magnify headroom) ───────────────────

// Widgets change size when their data arrives (music title, network rates…) —
// watch the bar's real layout size and re-fit the window whenever it moves, so
// nothing ever gets cut off at the window edge.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => {
    reframe();
    placeUpdatePill();
  }).observe(dockEl);
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

// Tight visual breathing room around the bar. Booki now leans on Mica-style
// tint instead of large drop shadows, so the native transparent stage can stay
// smaller and clicks just outside the painted dock reach the app underneath.
const SHADOW_PAD = 18;

// Fixed headroom past the bar for everything that opens around it — group
// flyouts, context menu, popovers, tooltips, the update pill, magnify and the
// soft shadow. Reserving it permanently is THE anti-flicker design: opening a
// group/menu is pure DOM inside a window that never resizes (every native
// resize repaints a frame where the WebView's layout lags the new rect — that
// lag was the visible jump/blink). Empty stage regions don't steal clicks: a
// cursor watcher (backend) flips the window click-through outside the hit
// rects the frontend reports (reportHitRects).
const PANEL_ROOM = 320;

let lastFull = null;
function computeFrame() {
  const dpr = window.devicePixelRatio || 1;
  // The STAGE: full length along the anchored edge; bar depth + panel headroom
  // across it. It only changes when the bar's depth changes (icon size, labels,
  // compact) or the screen does — never when something opens or closes.
  // Use offsetWidth/Height (layout size) — NOT getBoundingClientRect — so a dock
  // that's currently scaled by the minimize animation doesn't size the window too
  // small (which left the bar looking cut off after revealing, esp. at the top).
  const edgePad = Math.min(SHADOW_PAD, Math.max(4, Math.min(96, cfg.edgeGap ?? 48)));
  let wCss, hCss;
  if (isVertical()) {
    wCss = dockEl.offsetWidth + edgePad + PANEL_ROOM;
    hCss = availH();
  } else {
    wCss = availW();
    hCss = dockEl.offsetHeight + edgePad + PANEL_ROOM;
  }
  wCss = Math.min(wCss, availW());
  hCss = Math.min(hCss, availH());
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

let lastFrameEdge = null;
function applyFrame() {
  const full = computeFrame();
  // Skip the native resize when the change is small: the transparent SHADOW_PAD
  // absorbs minor bar-size jitter, so live widgets whose text
  // width wiggles (net rates, media title, rolling numbers) don't make the whole
  // window grow/shrink every second — that constant resize was a real flicker.
  // Only resize once a change is big enough to threaten the shadow's headroom.
  const key = `${cfg.edge}:${cfg.monitor ?? -1}`;
  const dpr = window.devicePixelRatio || 1;
  const slack = Math.round(8 * dpr); // px; small enough to keep the tighter stage accurate
  if (
    lastFull && lastFrameEdge === key &&
    Math.abs(full.w - lastFull.w) <= slack && Math.abs(full.h - lastFull.h) <= slack
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

// Reposition when the screen metrics change — resolution, DPI/scale, taskbar
// size, or plugging/unplugging a monitor. The dock's pixel size may be identical
// (so applyFrame's no-op guard would skip it), yet its anchored spot moved, which
// otherwise left it half-off-screen until the next settings change.
let lastScreenSig = "";
function screenSig() {
  const s = window.screen || {};
  return [s.width, s.height, s.availWidth, s.availHeight, window.devicePixelRatio || 1].join("x");
}
function checkScreenChange() {
  if (!cfg) return; // a resize before boot finished → nothing to reframe yet
  const sig = screenSig();
  if (sig === lastScreenSig) return;
  lastScreenSig = sig;
  lastFull = null; // force setDockFrame even if the pixel size is unchanged
  if (typeof invalidateMag === "function") invalidateMag();
  fitDock();
  applyFrame();
}
lastScreenSig = screenSig();
let screenChangeTimer = null;
window.addEventListener("resize", () => {
  // The bar's viewport rect (cached for magnify) shifts when the window resizes
  // — re-measure lazily so magnify never maps the pointer against a stale rect.
  invalidateMag();
  requestAnimationFrame(refreshPreviewMarquees);
  // An open menu/flyout grew the window; now that it actually resized, snap it
  // back into place so it's never clipped by the resize lagging behind.
  if (pendingReplace) { try { pendingReplace(); } catch (_) {} }
  clearTimeout(screenChangeTimer);
  screenChangeTimer = setTimeout(checkScreenChange, 250);
});

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
let occRevealTimer = null; // debounce for the smart-mode auto-reveal
let hiddenBeforeFullscreen = false;
const SMART_REVEAL_DELAY = 1100;

// Fullscreen game/movie/presentation → get completely out of the way: flash a
// brief toast, then hide BOTH the bar and the notch. Restore when it ends.
function onFullscreenSignal(value) {
  fullscreen = value;
  clearTimeout(blackoutTimer);
  if (value) {
    hiddenBeforeFullscreen = hiddenState;
    pinnedReveal = false;
    manualReveal = false;
    hiddenState = true;
    stopPolls(); // fullscreen game/movie → go fully idle
    document.body.classList.add("tucked");
    dockApi.notchToast(t("fs.hidden")); // hides the dock + shows the toast on the notch
    blackoutTimer = setTimeout(() => {
      if (fullscreen) dockApi.hideAll(); // then hide the notch too (full blackout)
    }, 2600);
  } else {
    // Back to normal: re-evaluate smart-hide and show the right window.
    document.body.classList.remove("tucked");
    if (hiddenBeforeFullscreen && hideMode() === "smart" && (cfg.notchTrigger || "click") === "click") {
      hiddenState = true;
      stopPolls();
      document.body.classList.add("tucked");
      dockApi.hideDock(cfg.edge);
    } else {
      hiddenState = false;
      setupAutoHide();
    }
    hiddenBeforeFullscreen = false;
  }
}

function hideMode() {
  return cfg.autoHideMode || (cfg.autoHide ? "edge" : "off");
}

function setHidden(v) {
  if (v === hiddenState) return;
  hiddenState = v;
  // Fully STOP the widget poll while tucked away (not just skip it) — a truly
  // idle dock burns no timer wakeups; it resumes the moment it reappears.
  if (v) stopPolls();
  else startPolls();
  if (v) {
    // The window is about to go away — the pointer can't be "inside" anymore.
    // (Windows won't fire pointerout for a window that hides under the cursor.)
    pointerInside = false;
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

// ─── The ONE rule of hiding ───────────────────────────────────────────────
// The dock NEVER tucks away while you're using it: pointer on the bar, a drag
// in flight, an open group/menu/popover. Timers and occlusion signals don't
// hide directly — they go through tryTuck(), which defers until the gesture
// ends; the pointer leaving the window is what finishes a deferred hide.
// The auto-hide delay is purely a grace period AFTER you leave, never a
// countdown while you're on the dock.
let pointerInside = false;

// Would the current mode want the dock hidden right now (ignoring the user's
// ongoing interaction)? edge = whenever you're not on it; smart = only while
// another window covers its spot.
function wantsHideNow() {
  const m = hideMode();
  return m === "edge" || (m === "smart" && occluded);
}

// Anything mid-use that a hide would yank out from under the user.
function interacting() {
  return (
    pointerInside || dragging || draggingFile || pinnedReveal || stackOpen ||
    !!edgeMove || document.body.classList.contains("menu-open") ||
    !!document.querySelector(".trash-pop, .note-editor, .coach")
  );
}

// Hide if the user isn't mid-something; otherwise wait — the pointer-out
// handler re-checks when they actually leave.
function tryTuck() {
  if (fullscreen || previewing || !wantsHideNow()) return;
  if (interacting()) return; // deferred: pointer-out / gesture-end re-checks
  manualReveal = false;
  setHidden(true);
}

// Track pointer presence at the WINDOW level (bar + its transparent pad):
// relatedTarget === null means the pointer truly entered/left the window,
// not just moved between elements inside it.
window.addEventListener("pointerover", (e) => {
  if (e.relatedTarget) return;
  if (!pointInLiveHitArea(e.clientX, e.clientY)) {
    pointerInside = false;
    return;
  }
  pointerInside = true;
  if (pinnedReveal) pinTouched = true; // the summon got used
  // A visible dock never counts down while you're on it — any trigger mode.
  if (!hiddenState) clearTimeout(hideTimer);
});
window.addEventListener("pointerout", (e) => {
  if (e.relatedTarget) return;
  pointerInside = false;
  // A used pin ends when you leave — the dock goes back to normal hiding.
  if (pinnedReveal && pinTouched) pinnedReveal = false;
  // Leaving is the moment a wanted hide (edge mode, or smart while covered)
  // actually happens — after the grace delay.
  if (!hiddenState && wantsHideNow()) scheduleHide();
});

// ───────────────── Hit regions of the stage window ─────────────────
// The window spans the whole edge, but only the painted bar/tiles and open
// panels are interactive; everywhere else the backend flips it click-through.
// Report those regions whenever the DOM changes.
let lastHitSig = "";
const DOCK_HIT_PAD = 0;
const TILE_HIT_PAD = 2;
const PANEL_HIT_PAD = 4;

function rectFromElement(el, inflate = 0) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return [r.left - inflate, r.top - inflate, r.width + inflate * 2, r.height + inflate * 2];
}

function pointInRect(x, y, rect) {
  return !!rect && x >= rect[0] && x < rect[0] + rect[2] && y >= rect[1] && y < rect[1] + rect[3];
}

function pointInLiveHitArea(x, y) {
  if (edgeMove || dragging || draggingFile) return true;
  const rects = [
    rectFromElement(dockEl, DOCK_HIT_PAD),
    ...[...dockEl.querySelectorAll(".tile")].map((el) => rectFromElement(el, TILE_HIT_PAD)),
    stackOpen ? rectFromElement(stackEl, PANEL_HIT_PAD) : null,
    ...[...document.querySelectorAll(
      ".trash-pop, .coach, .note-editor, #ctx-menu:not(.hidden), .dock-tip.show, .update-pill:not(.hidden)"
    )].map((el) => rectFromElement(el, PANEL_HIT_PAD)),
  ];
  return rects.some((rect) => pointInRect(x, y, rect));
}
function reportHitRects() {
  if (!dockApi.setHitRects) return;
  // Anything of ours in flight (tile drag, edge-move, edit wobble, an OS file
  // drag over the dock) → the whole stage stays interactive; never yank the
  // window out from under a gesture.
  const all = !!(
    edgeMove || dragging || draggingFile || document.body.classList.contains("edit") ||
    document.querySelector(".drag-clone, .stack-drag-clone")
  );
  const rects = [];
  const add = (el, inflate = 0) => {
    const rect = rectFromElement(el, inflate);
    if (rect) rects.push(rect);
  };
  // Keep the shadow room visual. The clickable region follows the bar,
  // transformed tiles and live panels, so apps behind Booki receive near-edge
  // clicks immediately.
  add(dockEl, DOCK_HIT_PAD);
  for (const tile of dockEl.querySelectorAll(".tile")) add(tile, TILE_HIT_PAD);
  if (stackOpen) add(stackEl, PANEL_HIT_PAD);
  for (const el of document.querySelectorAll(
    ".trash-pop, .coach, .note-editor, #ctx-menu:not(.hidden), .dock-tip.show, .update-pill:not(.hidden)"
  ))
    add(el, PANEL_HIT_PAD);
  const sig = all ? "all" : rects.map((r) => r.map(Math.round).join(",")).join(";");
  if (sig === lastHitSig) return;
  lastHitSig = sig;
  dockApi.setHitRects(rects, all).catch(() => {});
}
let hitRafId = 0;
function scheduleHitReport() {
  if (hitRafId) return;
  hitRafId = requestAnimationFrame(() => {
    hitRafId = 0;
    reportHitRects();
  });
}
// Any open/close/move in the window re-reports (one measurement per frame);
// a slow safety tick self-heals anything the observer can't see.
new MutationObserver(scheduleHitReport).observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["class", "style"],
});
window.addEventListener("resize", scheduleHitReport);
setInterval(() => {
  if (!hiddenState) reportHitRects();
}, 900);

// The backend cursor watcher is the source of truth for "is the pointer on
// the dock" once the window can go click-through — DOM enter/leave events
// stop arriving the moment the window starts ignoring the mouse.
if (dockApi.onCursorInside)
  dockApi.onCursorInside((v) => {
    if (v === pointerInside) return;
    pointerInside = v;
    if (v) {
      if (pinnedReveal) pinTouched = true;
      if (!hiddenState) clearTimeout(hideTimer);
    } else {
      if (pinnedReveal && pinTouched) pinnedReveal = false;
      if (!hiddenState && wantsHideNow()) scheduleHide();
    }
  });

function setupAutoHide() {
  clearTimeout(hideTimer);
  manualReveal = false;
  pinnedReveal = false;
  // smart starts hidden only if we're currently in an app (occluded), so a
  // config reload while working doesn't flash the dock open. edge now starts
  // VISIBLE and then visibly tucks after the grace delay (unless you move onto
  // it) — starting already-hidden read as "the dock never comes out".
  hiddenState = hideMode() === "smart" && occluded;
  document.body.classList.toggle("tucked", hiddenState);
  applyFrame();
  // Sync the two windows to the starting state (these don't emit, so this won't
  // pin the dock open).
  if (hiddenState) dockApi.hideDock(cfg.edge);
  else dockApi.revealDock();
  // Keep the poll loop in step with visibility (idle when tucked away).
  if (hiddenState) stopPolls();
  else startPolls();
  if (!hiddenState && wantsHideNow()) scheduleHide();
}

// Pointer entered the dock area while HIDDEN → reveal (hover trigger only; in
// click mode a hidden dock comes back exclusively from the notch).
function reveal() {
  if (fullscreen) return; // stay out of the way during fullscreen
  if (manualHide) return; // user swiped the dock away — only the notch brings it back
  if ((cfg.notchTrigger || "click") === "click") return;
  const mode = hideMode();
  if (mode === "off") return;
  // In smart mode, while you're working in another app, DON'T reveal on hover —
  // the dock returns only on the desktop or when you click the notch.
  if (mode === "smart" && occluded && !pinnedReveal) return;
  clearTimeout(hideTimer);
  manualReveal = true;
  setHidden(false);
}

// Grace period after leaving the dock; the callback re-checks EVERYTHING so a
// pointer that came back (or an opened menu) simply cancels the hide.
function scheduleHide() {
  if (hideMode() === "off") return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(tryTuck, cfg.autoHideDelay ?? 650);
}

// Smart-hide: the backend tells us when a window covers the dock's home area.
// We hide to the notch when covered and reappear when the desktop is clear —
// measured against a stable rect in Rust, so it can no longer flap.
function onOcclusionSignal(value) {
  occluded = value;
  // Going back to work in an app releases a manual swipe-hide: next time the
  // desktop is clear, normal smart behavior resumes.
  if (value) manualHide = false;
  if (previewing) return; // a live position preview owns visibility for now
  if (fullscreen) return; // blackout owns the visibility while fullscreen
  if (draggingFile) return; // never tuck away mid file-drag (the drop needs us)
  if (manualHide) return; // stay hidden until the user asks for the dock again
  if (hideMode() !== "smart") return;
  if (!value) {
    if ((cfg.notchTrigger || "click") === "click") {
      clearTimeout(occRevealTimer);
      return;
    }
    // Back on the desktop → bring the dock out automatically, but only after
    // the desktop has stayed clear for a beat. Switching/moving windows opens
    // transient gaps over the dock's spot, and revealing on those made the dock
    // pop out "by itself" mid alt-tab / drag (reported bug).
    clearTimeout(occRevealTimer);
    occRevealTimer = setTimeout(() => {
      if (occluded || fullscreen || manualHide || hideMode() !== "smart") return;
      pinnedReveal = false;
      manualReveal = false;
      setHidden(false);
    }, SMART_REVEAL_DELAY);
  } else if (pointerInside || interacting()) {
    clearTimeout(occRevealTimer); // covered again → drop any pending reveal
    // Another window covers the dock's spot, but the user is ON the dock right
    // now (it's topmost) — hiding it under the cursor was the "it hides while
    // I'm using it!" bug. It tucks the moment they leave instead (pointer-out).
    return;
  } else {
    clearTimeout(occRevealTimer); // covered again → drop any pending reveal
    // Working in another window → tuck away. Even a dock pinned open from the
    // notch hides once you switch to another app.
    pinnedReveal = false;
    manualReveal = false;
    setHidden(true);
  }
}

document.body.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerleave", () => { if (wantsHideNow()) scheduleHide(); });

// The notch is now its own small window. Clicking it calls the backend, which
// shows the dock window again and fires `booki://reveal`. This must NOT go
// through reveal() — that helper is the hover-trigger path and bails out in
// click mode, which silently ate the notch click (the dock never came back in
// \u201cal salir\u201d). An explicit summon always reveals, whatever the trigger.
let pinTimer = null;
let pinTouched = false; // the pointer actually visited the dock since the pin
function pinOpen() {
  if (fullscreen) return;
  manualHide = false;
  pinnedReveal = true;
  pinTouched = false;
  clearTimeout(hideTimer);
  setHidden(false);
  // Outside clicks pass through the stage window now, so they can't release
  // the pin — instead the pin ends when you visit the dock and leave, with a
  // timeout valve for an accidental summon that's never used.
  clearTimeout(pinTimer);
  pinTimer = setTimeout(() => {
    if (pinnedReveal && !pinTouched) {
      pinnedReveal = false;
      if (wantsHideNow()) scheduleHide();
    }
  }, 8000);
}
onReveal(pinOpen);

// Hot edge: the cursor was pushed against the dock's screen edge — an explicit
// "come out" gesture, treated exactly like clicking the notch.
onHotEdge(() => {
  if (fullscreen || !hiddenState) return;
  pinOpen();
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
    const item = cfg.pinned.find((p) => p.id === tile.dataset.id);
    const k = item && item.kind;
    if (k === "app" || k === "folder" || k === "group" || k === "trash") {
      const r = tile.getBoundingClientRect();
      const inX = x > r.left + r.width * 0.24 && x < r.right - r.width * 0.24;
      const inY = y > r.top + r.height * 0.24 && y < r.bottom - r.height * 0.24;
      if (inX && inY) return { target: tile, index: null };
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

let dropTargetEl = null;
function setDropTarget(el) {
  // Only highlight tiles that actually accept a dropped file: apps (open with),
  // folders/groups (move/pin in) and the trash. Widgets/separators don't react.
  if (el) {
    const item = cfg.pinned.find((p) => p.id === el.dataset.id);
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

// ─────────────────────── Custom tooltips ───────────────────────
// A Booki-styled tooltip (acrylic, soft fade) shown on hover, replacing the OS
// tooltip. Only when tile labels are hidden — otherwise the name is already
// visible under the icon. We stash the native title while hovering so the OS
// one never double-shows, and restore it (for accessibility) on leave.
const tipEl = document.createElement("div");
tipEl.className = "dock-tip";
tipEl.setAttribute("role", "tooltip");
document.body.appendChild(tipEl);
let tipTile = null;
let tipTimer = 0;

function tipName(el) {
  const label = el.querySelector(".label");
  return (label && label.textContent) || el.getAttribute("title") || "";
}

function showTip(el) {
  const name = tipName(el);
  if (!name) return;
  // Measure while still hidden (opacity:0, but laid out) so we can decide whether
  // it fits BEFORE committing to it.
  tipEl.textContent = name;
  const r = el.getBoundingClientRect();
  const gap = 10;
  const tw = tipEl.offsetWidth;
  const th = tipEl.offsetHeight;
  let x, y;
  if (cfg.edge === "left") {
    x = r.right + gap;
    y = r.top + r.height / 2 - th / 2;
  } else if (cfg.edge === "right") {
    x = r.left - gap - tw;
    y = r.top + r.height / 2 - th / 2;
  } else if (cfg.edge === "top") {
    x = r.left + r.width / 2 - tw / 2;
    y = r.bottom + gap;
  } else {
    x = r.left + r.width / 2 - tw / 2;
    y = r.top - gap - th;
  }
  // The dock window is only the bar + a small shadow-pad margin, so a wide tip
  // (long name, or a slim vertical bar) can't fit inside the webview and would be
  // clipped. When it doesn't fit, bail and let the native OS tooltip show instead
  // (its title is still on the tile), so the name is never cut off or invisible.
  const m = 4;
  const fits =
    x >= m && y >= m && x + tw <= window.innerWidth - m && y + th <= window.innerHeight - m;
  if (!fits) return;
  // Committing: suppress the OS tooltip (stash its title) and show ours.
  const nativeTitle = el.getAttribute("title");
  if (nativeTitle != null) {
    el._tip = nativeTitle;
    el.removeAttribute("title");
  }
  tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tipEl.classList.add("show");
}

function hideTip() {
  clearTimeout(tipTimer);
  tipTimer = 0;
  if (tipTile) {
    // Restore the native title we stashed for screen readers.
    if (tipTile._tip != null) {
      tipTile.setAttribute("title", tipTile._tip);
      tipTile._tip = null;
    }
    tipTile = null;
  }
  tipEl.classList.remove("show");
}

dockEl.addEventListener("pointerover", (e) => {
  if (document.body.classList.contains("show-labels")) return; // name already shown
  if (editMode || dragging) return;
  const el = e.target.closest && e.target.closest(".tile[data-id]");
  if (!el || el === tipTile) return;
  if (el.classList.contains("separator")) return;
  hideTip();
  tipTile = el;
  // Don't touch the native title yet — showTip removes it only if the custom tip
  // actually fits, otherwise the OS tooltip stays as the reliable fallback.
  tipTimer = setTimeout(() => showTip(el), 340);
});
dockEl.addEventListener("pointerout", (e) => {
  const to = e.relatedTarget;
  if (tipTile && (!to || !tipTile.contains(to))) hideTip();
});
dockEl.addEventListener("pointerdown", hideTip, true);

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
    // Center on the BAR (not the window: a slot-aligned dock sits off-center)
    // and clamp both axes into the viewport, like placeMenu does.
    const dr = dockEl.getBoundingClientRect();
    const gap = 12;
    const pad = 8;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    pop.style.left = pop.style.right = pop.style.top = pop.style.bottom = "";
    pop.style.transform = "";
    if (isVertical()) {
      const top = Math.min(Math.max(pad, dr.top + dr.height / 2 - ph / 2), window.innerHeight - ph - pad);
      pop.style.top = `${top}px`;
      let left = cfg.edge === "left" ? dr.right + gap : dr.left - pw - gap;
      left = Math.min(Math.max(pad, left), window.innerWidth - pw - pad);
      pop.style.left = `${left}px`;
    } else {
      const left = Math.min(Math.max(pad, dr.left + dr.width / 2 - pw / 2), window.innerWidth - pw - pad);
      pop.style.left = `${left}px`;
      let top = cfg.edge === "top" ? dr.bottom + gap : dr.top - ph - gap;
      top = Math.min(Math.max(pad, top), window.innerHeight - ph - pad);
      pop.style.top = `${top}px`;
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
  // The coach swaps its content per step WITHOUT re-calling placePop; since the
  // popover is now hard-positioned (no translate centering), re-run put() on
  // any size change so every step stays centered on the bar and in-viewport.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      if (pop.isConnected) put();
    }).observe(pop);
  }
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
    `<span class="tp-emoji">${emo("shield", 24)}</span><span class="tp-col">` +
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

// Drop-on-folder: ask, then move the files into that folder (shell move —
// undoable with Ctrl+Z in Explorer).
function confirmMove(paths, item) {
  closeTrashPop();
  pinnedReveal = true;
  const n = paths.length;
  const what = n === 1 ? `«${esc(baseName(paths[0]))}»` : t("move.n").replace("{n}", n);
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  pop.innerHTML =
    `${icon("folder")}<span class="tp-col"><span class="tp-text">${t("move.ask")
      .replace("{what}", what)
      .replace("{dest}", esc(item.name))}</span>` +
    `<span class="tp-sub">${t("move.sub")}</span></span>`;
  const mkBtn = (cls, label, fn) => {
    const b = document.createElement("button");
    b.className = `tp-btn ${cls}`;
    b.textContent = label;
    b.addEventListener("click", fn);
    pop.appendChild(b);
  };
  mkBtn("", t("move.ok"), async () => {
    closeTrashPop();
    try {
      await dockApi.movePaths(paths, item.path);
    } catch (err) {
      logMessage(`move: ${err}`);
    }
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
    onOver: (position) => {
      const spot = dropSpot(position);
      setDropTarget(spot.target);
      setDropGap(spot.target ? null : spot.index);
    },
    onLeave: () => {
      draggingFile = false;
      pinnedReveal = false;
      dropOverlay.classList.remove("active");
      setDropTarget(null);
      setDropGap(null);
      scheduleHide();
    },
    onDrop: async (paths, position) => {
      draggingFile = false;
      pinnedReveal = false;
      dropOverlay.classList.remove("active");
      const spot = dropSpot(position);
      const target = spot.target;
      setDropTarget(null);
      setDropGap(null);
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
            kind: "app",
          });
        }
        await persist();
        await emitConfigChanged();
        await render();
        reframe();
        return;
      }
      // Otherwise pin them exactly where the gap showed.
      await addPaths(paths, null, spot.index);
    },
  });
}

// ─────────────────── Running-app indicators ───────────────────

let pollTimer = null;
function startRunningPoll() {
  if (!isTauri) return;
  clearInterval(pollTimer); // never stack two running-app polls
  pollTimer = null;
  const tick = async () => {
    // Don't poll while tucked into the notch — saves CPU/IPC when idle.
    if (hiddenState) return;
    // Cheap, no-IPC guard that repositions the dock if the screen changed.
    checkScreenChange();
    // Keep the trash badge in sync with deletions made outside Booki.
    if (dockEl.querySelector(".tile.trash")) refreshTrashState();
    if (cfg.showIndicators === false) {
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => (t.dataset.running = "false"));
      return;
    }
    // Nothing that could be "running" is pinned (only widgets/trash/separators) →
    // skip enumerating every window (which now also resolves each process's exe).
    if (!cfg.pinned.some((p) => p.kind === "app" || p.kind === "folder" || p.kind === "group")) {
      return;
    }
    try {
      const wins = await dockApi.listWindows();
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => {
        const app = cfg.pinned.find((a) => a.id === t.dataset.id);
        if (!app || app.kind === "separator" || app.kind === "trash") return;
        // Prefer matching by the owning process's executable (reliable, exact);
        // fall back to a title contains-name match for .lnk/shell pins.
        const path = (app.path || "").toLowerCase();
        const exeBase = path.endsWith(".exe") ? path.split(/[\\/]/).pop() : "";
        const name = (app.name || "").toLowerCase();
        let matches = exeBase
          ? wins.filter((w) => ((w.exe || "").split(/[\\/]/).pop() || "") === exeBase)
          : [];
        if (!matches.length && name) {
          matches = wins.filter((w) => w.title.toLowerCase().includes(name));
        }
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
let stackSeq = 0; // guards async fills against a flyout that was reopened meanwhile

// Files that get a REAL thumbnail (Explorer-grade, via the shell) instead of
// their type icon in folder flyouts. Cached per path for the session.
const THUMB_RE = /\.(jpe?g|png|gif|bmp|webp|avif|heic|heif|tiff?|mp4|mkv|mov|avi|webm|m4v|wmv)$/i;
const thumbCache = new Map(); // path → data uri (or null after a miss)
const THUMB_CACHE_MAX = 400;
function rememberThumb(path, src) {
  if (thumbCache.size >= THUMB_CACHE_MAX) {
    // drop the oldest entry (Map preserves insertion order)
    thumbCache.delete(thumbCache.keys().next().value);
  }
  thumbCache.set(path, src);
}

// Drag a FILE out of a folder flyout into Explorer / another app — a real OS
// drag (OLE), so the drop target decides copy vs move. Small threshold keeps
// a plain click launching as always.
function wireFileDragOut(cell, it) {
  cell.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
    };
    const move = (ev) => {
      if (started) return;
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 12) return;
      started = true;
      cleanup();
      cell._suppressClick = true;
      setTimeout(() => (cell._suppressClick = false), 600);
      const img = cell.querySelector("img");
      dockApi.dragOutFiles([it.path], img ? img.src : null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
  });
}

async function toggleStack(tileEl, item) {
  if (stackOpen) {
    closeStack();
    return;
  }
  const isGroup = item.kind === "group";
  const seq = ++stackSeq;
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
  if (!isGroup) {
    // The flyout shows a slice of the folder — Explorer is the "see everything
    // / do more" escape hatch, one click away.
    const openDir = document.createElement("button");
    openDir.className = "stack-close stack-opendir";
    openDir.title = t("stack.openExplorer");
    openDir.innerHTML = icon("external");
    openDir.addEventListener("click", () => {
      dockApi.launch(item.path, []);
      closeStack();
    });
    head.appendChild(openDir);
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
  const fillGrid = (items) => {
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = `<div class="stack-empty">${t("stack.empty")}</div>`;
    }
    let cellIdx = 0;
    for (const it of items) {
      // A grouped widget renders as its LIVE read-out (only here, inside the open
      // group — never on the bar). It spans the row so the card gets full width.
      if (isGroup && it.kind === "widget") {
        const wCell = document.createElement("div");
        wCell.className = "stack-item stack-widget";
        wCell.style.setProperty("--i", cellIdx++);
        wCell.appendChild(widgetTile(it, { inFlyout: true }));
        wireStackDragOut(wCell, item, it);
        const out = document.createElement("span");
        out.className = "stack-rm";
        out.textContent = "×";
        out.title = t("group.takeOut");
        out.addEventListener("click", (ev) => { ev.stopPropagation(); takeOutChild(item, it.id); });
        wCell.appendChild(out);
        grid.appendChild(wCell);
        continue;
      }
      const cell = document.createElement("button");
      cell.className = "stack-item";
      cell.style.setProperty("--i", cellIdx++); // staggered entry
      cell.title = it.name;
      const isDir = isGroup ? it.kind === "folder" || it.kind === "group" : it.is_dir;
      const fallbackGlyph = () => (isDir ? emo("folder", 26) : esc((it.name[0] || "?").toUpperCase()));
      // Show whatever icon we already have instantly; otherwise a shimmer skeleton
      // and fill it in — resolved in PARALLEL across cells (was a sequential await
      // per item, so a folder of 20 files opened one slow icon at a time).
      // Photos and videos get a REAL thumbnail instead of their type icon.
      const wantsThumb = !isGroup && !it.is_dir && THUMB_RE.test(it.name);
      const cachedThumb = wantsThumb ? thumbCache.get(it.path) : undefined;
      const now = cachedThumb || syncIcon(it);
      cell.innerHTML =
        (now
          ? `<img${cachedThumb ? ' class="thumb"' : ""} src="${esc(now)}" alt="" />`
          : `<span class="stack-glyph skel"></span>`) +
        `<span class="stack-name">${esc(it.name)}</span>`;
      if (!now) {
        const setImg = (src, isThumb) => {
          const holder = cell.querySelector(".stack-glyph.skel");
          if (holder)
            holder.outerHTML = `<img${isThumb ? ' class="thumb"' : ""} src="${esc(src)}" alt="" />`;
        };
        const clearSkel = () => {
          const holder = cell.querySelector(".stack-glyph.skel");
          if (holder) { holder.classList.remove("skel"); holder.innerHTML = fallbackGlyph(); }
        };
        const resolveGeneric = () => {
          resolveIcon(it)
            .then((src) => { if (src) setImg(src, false); else clearSkel(); })
            .catch(clearSkel);
        };
        if (wantsThumb && dockApi.fileThumbnail) {
          dockApi
            .fileThumbnail(it.path)
            .then((src) => {
              rememberThumb(it.path, src || null);
              if (src) setImg(src, true);
              else resolveGeneric();
            })
            .catch(resolveGeneric);
        } else {
          resolveGeneric();
        }
      }
      cell.addEventListener("click", () => {
        if (cell._suppressClick) return; // a drag just happened → don't also launch
        if (it.path) dockApi.launch(it.path, it.args || []);
        closeStack();
      });
      if (isGroup) {
        // Drag a child OUT of the flyout to unpin it (parity with the dock's
        // pull-out-to-remove gesture); the × instead pops it back onto the dock.
        wireStackDragOut(cell, item, it);
        const out = document.createElement("span");
        out.className = "stack-rm";
        out.textContent = "×";
        out.title = t("group.takeOut");
        out.addEventListener("click", (ev) => {
          ev.stopPropagation();
          takeOutChild(item, it.id);
        });
        cell.appendChild(out);
      } else if (it.path && !it.is_dir) {
        // Real files: hover actions (copy path · reveal in Explorer · open
        // with…) and drag-out — pull the file into Explorer or any other app.
        const acts = document.createElement("div");
        acts.className = "stack-acts";
        const act = (ic, title, fn) => {
          const b = document.createElement("button");
          b.className = "stack-act";
          b.title = title;
          b.innerHTML = icon(ic);
          b.addEventListener("pointerdown", (ev) => ev.stopPropagation());
          b.addEventListener("click", (ev) => {
            ev.stopPropagation();
            fn(b);
          });
          acts.appendChild(b);
        };
        act("copy", t("stack.copyPath"), (b) => {
          dockApi.copyText(it.path);
          b.innerHTML = icon("check");
          setTimeout(() => (b.innerHTML = icon("copy")), 900);
        });
        act("external", t("stack.showInExplorer"), () => {
          dockApi.openLocation(it.path);
          closeStack();
        });
        act("app", t("stack.openWith"), () => {
          dockApi.openWith(it.path);
          closeStack();
        });
        cell.appendChild(acts);
        wireFileDragOut(cell, it);
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
    } else if (items.length >= 80) {
      // list_dir caps at 80 entries — say so and hand off to Explorer.
      const more = document.createElement("button");
      more.className = "stack-more";
      more.textContent = t("stack.more");
      more.addEventListener("click", () => {
        dockApi.launch(item.path, []);
        closeStack();
      });
      grid.appendChild(more);
    }
  };
  if (isGroup) {
    fillGrid(item.children || []);
  } else {
    // Open NOW with shimmer placeholders and fill when the listing lands — a
    // big folder (Downloads…) must not stall the flyout.
    for (let i = 0; i < 8; i++) {
      const c = document.createElement("div");
      c.className = "stack-item stack-skel";
      c.style.setProperty("--i", i);
      c.innerHTML = `<span class="stack-glyph skel"></span><span class="stack-name skel"></span>`;
      grid.appendChild(c);
    }
    dockApi
      .listDir(item.path)
      .then((items) => {
        if (seq !== stackSeq || !stackOpen) return;
        fillGrid(items || []);
        applyFrame();
        if (pendingReplace) requestAnimationFrame(pendingReplace);
      })
      .catch(() => {
        if (seq !== stackSeq || !stackOpen) return;
        fillGrid([]);
      });
  }
  stackEl.appendChild(grid);

  stackOpen = true;
  document.body.classList.add("stack-open");
  // Pick up any widgets rendered inside the flyout so they poll live while open.
  cacheWidgetEls();
  startPolls();
  // Grow the window synchronously BEFORE the flyout becomes visible — same
  // pattern as the context menu / popovers, so opening a folder never flashes
  // a clipped panel while the window catches up.
  applyFrame();
  // The stage window never resizes for the flyout, so it can open on the very
  // next frame — position it, then flip to .open so the transition plays.
  const placeStack = () => placeStackNear(tileEl);
  pendingReplace = placeStack; // re-place if the window DOES resize (screen change)
  requestAnimationFrame(() => {
    placeStack();
    requestAnimationFrame(() => stackEl.classList.add("open"));
  });
}

// Anchor #stack to a tile's real POSITION (not its size — that ignores the
// anchored-side padding and sits the flyout ON TOP of the bar's first row).
// Shared by the folder/group flyout and the clipboard-history flyout below.
function placeStackNear(tileEl) {
  const dr = dockEl.getBoundingClientRect();
  const gap = 10;
  stackEl.style.left = stackEl.style.right = stackEl.style.top = stackEl.style.bottom = "";
  if (!isVertical()) {
    const r = tileEl.getBoundingClientRect();
    const sw = stackEl.offsetWidth;
    let left = r.left + r.width / 2 - sw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - sw - 8));
    stackEl.style.left = `${left}px`;
    if (cfg.edge === "top") stackEl.style.top = `${dr.bottom + gap}px`;
    else stackEl.style.bottom = `${window.innerHeight - dr.top + gap}px`;
  } else {
    const r = tileEl.getBoundingClientRect();
    const sh = stackEl.offsetHeight;
    let top = r.top + r.height / 2 - sh / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - sh - 8));
    stackEl.style.top = `${top}px`;
    if (cfg.edge === "left") stackEl.style.left = `${dr.right + gap}px`;
    else stackEl.style.right = `${window.innerWidth - dr.left + gap}px`;
  }
}

let stackCloseTimer = null;
function closeStack() {
  if (!stackOpen) return;
  stackOpen = false;
  pendingReplace = null;
  document.body.classList.remove("stack-open");
  stackEl.classList.remove("open"); // plays the close transition
  // Any grouped widgets that were live are gone now — drop them from the poll
  // (stops the timer if nothing on the bar still needs it).
  cacheWidgetEls();
  startPolls();
  // Shrink the window only after the close animation has played, so it doesn't
  // get cut off mid-fade.
  clearTimeout(stackCloseTimer);
  stackCloseTimer = setTimeout(reframe, 240);
}

// Clipboard-history flyout: the "clipboard" widget's click target. Reuses the
// same #stack panel/positioning as the folder/group flyout (one flyout
// concept, different content) so it inherits the stage-window stability,
// hit-region reporting and open/close transition for free.
let clipStackQuery = "";
let clipSearchTimer = null;
let clipRenderSeq = 0;
async function toggleClipboardStack(tileEl) {
  if (stackOpen) {
    closeStack();
    return;
  }
  stackEl.innerHTML = "";
  const head = document.createElement("div");
  head.className = "stack-head";
  const glyph = document.createElement("span");
  glyph.className = "stack-head-icon";
  glyph.innerHTML = emo("clipboard", 15);
  head.appendChild(glyph);
  const title = document.createElement("span");
  title.className = "stack-title";
  title.textContent = t("clip.title");
  head.appendChild(title);
  const close = document.createElement("button");
  close.className = "stack-close";
  close.title = t("stack.close");
  close.innerHTML = icon("x");
  close.addEventListener("click", closeStack);
  head.appendChild(close);
  stackEl.appendChild(head);

  const guide = document.createElement("div");
  guide.className = "clip-guide";
  guide.innerHTML = `
    <strong>${t("clip.howTitle")}</strong>
    <span>${t("clip.howCopy")}</span>
    <span>${t("clip.howStar")}</span>
    <span>${t("clip.howPrivate")}</span>
  `;
  stackEl.appendChild(guide);

  const tools = document.createElement("div");
  tools.className = "clip-tools";
  const searchWrap = document.createElement("label");
  searchWrap.className = "clip-search";
  searchWrap.innerHTML = `<span>${icon("search")}</span>`;
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = t("clip.search");
  search.value = clipStackQuery;
  search.addEventListener("input", () => {
    clipStackQuery = search.value;
    clearTimeout(clipSearchTimer);
    clipSearchTimer = setTimeout(() => renderClipboardList(grid, foot), 80);
  });
  searchWrap.appendChild(search);
  tools.appendChild(searchWrap);
  stackEl.appendChild(tools);

  const grid = document.createElement("div");
  grid.className = "stack-grid clip-list";
  stackEl.appendChild(grid);

  const foot = document.createElement("div");
  foot.className = "clip-foot";
  stackEl.appendChild(foot);

  stackOpen = true;
  document.body.classList.add("stack-open");
  applyFrame();
  const placeStack = () => placeStackNear(tileEl);
  pendingReplace = placeStack;

  await renderClipboardList(grid, foot);
  requestAnimationFrame(() => {
    placeStack();
    requestAnimationFrame(() => stackEl.classList.add("open"));
  });
}

// (Re)draw the clipboard list into an already-open panel — used both on first
// open and after copy/edit/delete/clear so the list stays live without
// closing the flyout.
async function renderClipboardList(grid, foot) {
  const seq = ++clipRenderSeq;
  let items = [];
  try {
    items = await dockApi.clipboardHistory(200);
  } catch (_) {}
  if (seq !== clipRenderSeq || !stackOpen) return;
  const rawCount = items.length;
  const q = clipStackQuery.trim().toLowerCase();
  if (q) {
    items = items.filter((entry) => (entry.text || "").toLowerCase().includes(q));
  }
  grid.innerHTML = "";
  foot.innerHTML = "";
  grid.classList.toggle("compact", !!cfg.clipboardCompact || rawCount > 18);
  if (!stackOpen) return; // closed while we were awaiting
  if (!items.length) {
    grid.innerHTML = `<div class="stack-empty">${q ? t("clip.noMatches") : t("clip.empty")}</div>`;
    if (pendingReplace) requestAnimationFrame(pendingReplace);
    return;
  }
  items.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "clip-row" + (entry.favorite ? " favorite" : "") + (entry.private ? " private" : "");
    row.style.setProperty("--i", i);
    const text = document.createElement("div");
    text.className = "clip-text";
    text.textContent = entry.text;
    text.title = entry.text;
    row.appendChild(text);

    const acts = document.createElement("div");
    acts.className = "clip-acts";
    const act = (ic, title, fn) => {
      const b = document.createElement("button");
      b.className = "clip-act";
      b.title = title;
      b.innerHTML = icon(ic);
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await fn();
      });
      acts.appendChild(b);
    };
    act(entry.favorite ? "star" : "star", entry.favorite ? t("clip.unfavorite") : t("clip.favorite"), async () => {
      await dockApi.clipboardFavorite(entry.id, !entry.favorite);
      await renderClipboardList(grid, foot);
    });
    act("shield", entry.private ? t("clip.makePersistent") : t("clip.private"), async () => {
      await dockApi.clipboardPrivate(entry.id, !entry.private);
      await renderClipboardList(grid, foot);
    });
    act("pencil", t("clip.edit"), () => startClipEdit(row, entry, grid, foot));
    act("trash", t("clip.delete"), async () => {
      await dockApi.clipboardDelete(entry.id);
      refreshClipboard();
      await renderClipboardList(grid, foot);
    });
    row.appendChild(acts);

    row.addEventListener("click", async () => {
      await dockApi.clipboardCopy(entry.text);
      refreshClipboard();
      row.classList.add("copied");
      setTimeout(() => row.classList.remove("copied"), 700);
    });
    grid.appendChild(row);
  });

  const clear = document.createElement("button");
  clear.className = "clip-clear";
  clear.textContent = t("clip.clear");
  clear.addEventListener("click", async () => {
    await dockApi.clipboardClear();
    refreshClipboard();
    await renderClipboardList(grid, foot);
  });
  foot.appendChild(clear);
  const meta = document.createElement("div");
  meta.className = "clip-meta";
  meta.textContent = t("clip.countHint").replace("{n}", rawCount);
  foot.appendChild(meta);
  if (pendingReplace) requestAnimationFrame(pendingReplace);
}

// Turn one row into an inline editor; Save copies the edited text (bumping it
// to the top of history) and refreshes the list, Cancel just redraws as-is.
function startClipEdit(row, entry, grid, foot) {
  row.innerHTML = "";
  row.classList.add("editing");
  const ta = document.createElement("textarea");
  ta.className = "clip-edit-area";
  ta.value = entry.text;
  row.appendChild(ta);
  const acts = document.createElement("div");
  acts.className = "clip-acts";
  const save = document.createElement("button");
  save.className = "clip-act";
  save.title = t("clip.save");
  save.innerHTML = icon("check");
  save.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const v = ta.value.trim();
    if (v) { await dockApi.clipboardCopy(v); refreshClipboard(); }
    await renderClipboardList(grid, foot);
  });
  const cancel = document.createElement("button");
  cancel.className = "clip-act";
  cancel.title = t("clip.cancel");
  cancel.innerHTML = icon("x");
  cancel.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await renderClipboardList(grid, foot);
  });
  acts.appendChild(save);
  acts.appendChild(cancel);
  row.appendChild(acts);
  ta.focus();
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

// Keep the pill centered over the BAR (not the window — the window grows for
// popovers/flyouts, which would leave a fixed-centered pill visibly off-axis).
function placeUpdatePill() {
  const pill = document.getElementById("update-pill");
  if (!pill || pill.classList.contains("hidden")) return;
  const r = dockEl.getBoundingClientRect();
  const pad = 8;
  const gap = 8;
  pill.style.left = "";
  pill.style.right = "";
  pill.style.top = "";
  pill.style.bottom = "";
  if (isVertical()) {
    const top = Math.min(
      Math.max(pad, r.top + r.height / 2 - pill.offsetHeight / 2),
      Math.max(pad, window.innerHeight - pill.offsetHeight - pad)
    );
    const left =
      (cfg.edge || "bottom") === "left"
        ? Math.min(r.right + gap, window.innerWidth - pill.offsetWidth - pad)
        : Math.max(pad, r.left - pill.offsetWidth - gap);
    pill.style.top = `${top}px`;
    pill.style.left = `${left}px`;
  } else {
    const left = Math.min(
      Math.max(pad, r.left + r.width / 2 - pill.offsetWidth / 2),
      Math.max(pad, window.innerWidth - pill.offsetWidth - pad)
    );
    const top =
      (cfg.edge || "bottom") === "top"
        ? Math.min(r.bottom + gap, window.innerHeight - pill.offsetHeight - pad)
        : Math.max(pad, r.top - pill.offsetHeight - gap);
    pill.style.left = `${left}px`;
    pill.style.top = `${top}px`;
  }
}

async function checkUpdates() {
  const pill = document.getElementById("update-pill");
  if (!pill) return;
  const update = await checkForUpdate();
  if (update && pill.classList.contains("hidden")) {
    pill.textContent = t("dock.update");
    pill.classList.remove("hidden");
    placeUpdatePill();
    // Straight to General — that's where the install button and progress live.
    pill.addEventListener("click", () => dockApi.openSettingsTab("general"), { once: true });
  }
}
// Long sessions deserve the pill too — re-check every 4 h, not just at boot.
setInterval(checkUpdates, 4 * 3600 * 1000);

// Easter egg: Konami party.
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

boot();
