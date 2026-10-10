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
  onDesktop,
  onReveal,
  onSoftReveal,
  onFullscreen,
  onToggleDock,
  onLauncher,
  onLaunchIndex,
  onHotEdge,
  emitConfigChanged as emitConfigChangedRaw,
  logMessage,
  isTauri,
} from "./api.js";
import { createDockTooltip, setTileLabel } from "./dock/tooltip.js";
import { timerSeconds, formatTimer, tasksSummary } from "./dock/productivity.js";
import { buildProductivityPanel } from "./dock/productivity-panel.js";
import { createDraftSaver } from "./dock/draft-saver.js";
import { parseConfigConflict } from "./settings/config-conflicts.js";
import { observeSystem, recoveryInterval } from "./dock/system-observer.js";
import { singleFlight } from "./dock/async-cache.js";
import { widgetWidth, chooseFitSize } from "./dock/layout-model.js";
import { decideVisible, wantsHidden } from "./dock/visibility-policy.js";
import { icon } from "./icons.js";
import { emo } from "./emoji.js";
import { isLibIcon, resolveLibIcon, libGlyphSVG } from "./icon-library.js";
import { applyTheme, applyEdge } from "./theme.js";
import { checkForUpdate } from "./update.js";
import { t, setLang, curLang, ensureLang } from "./i18n.js";
import {
  WIDGET_ICONS,
  WIDGET_GLYPHS,
  WIDGET_VARIANTS,
  STAT_WIDGETS,
  PREVIEW_WIDGETS,
  RING_DEFAULTS,
  WIDGET_META,
  widgetDisplayName,
  canonicalWidget,
} from "./widgets-meta.js";
import { reduceMotion } from "./dock/motion.js";
import { availW, availH, rectFromElement, pointInRect, hitSignature } from "./dock/geometry.js";
import { placeBesideBar, transformOrigin } from "./dock/placement.js";
import {
  MEDIA_SVG,
  BATTERY_LOW,
  dockPreviewSnippet,
  clockParts,
  volumeStep,
  widgetCardHTML,
  setMetric,
  setText,
  setMediaText,
  setPreviewSubText,
  refreshPreviewMarquees,
  LIVE_WIDGETS,
  setSystem,
} from "./dock/widget-view.js";
import { dockRadius } from "./surface.js";
import { groupAppearance } from "./group-style.js";
import { pinFallback } from "./pin-fallback.js";
import { canMergeKind, kindForPath, mergePins, normalizeGroups, takeOutOfGroup } from "./pins.js";
import { createFolderNavigation } from "./dock/folder-navigation.js";
import { menuActions, menuItems, moveMenuFocus, isTextEditor } from "./dock/context-menu.js";
import { buildAddPanel } from "./dock/add-panel.js";
import { buildLauncher } from "./dock/launcher.js";
import { reportMaterial, shapeOf, materialTint, setMaterialTint, applyMaterial, followFrames } from "./material.js";

// Surface any runtime error to the app log (diagnostics on the user's machine).
window.addEventListener("error", (e) => logMessage("error", `dock: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `dock: unhandled ${e.reason}`)
);

const dockEl = document.getElementById("dock");
const ctxMenu = document.getElementById("ctx-menu");
const dropOverlay = document.getElementById("drop-overlay");
const undoToast = document.getElementById("undo-toast");

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
let nativeSupport = {};
let appPollTick = null;
let undoRemoval = null;
let undoRemovalTimer = null;

function hideUndoToast() {
  clearTimeout(undoRemovalTimer);
  undoRemovalTimer = null;
  undoRemoval = null;
  undoToast?.classList.add("hidden");
  if (undoToast) undoToast.innerHTML = "";
}

function placeUndoToast() {
  if (!cfg || !undoToast || undoToast.classList.contains("hidden")) return;
  const { left, top } = placeBesideBar({
    bar: dockEl.getBoundingClientRect(),
    box: { width: undoToast.offsetWidth, height: undoToast.offsetHeight },
    edge: cfg.edge, viewport: { width: innerWidth, height: innerHeight }, gap: 12, pad: 8,
  });
  undoToast.style.left = `${left}px`; undoToast.style.top = `${top}px`;
}

function showUndoToast(item, index) {
  if (!undoToast) return;
  clearTimeout(undoRemovalTimer);
  undoRemoval = { item: structuredClone(item), index };
  undoToast.innerHTML = `<span>${esc(item.name || baseName(item.path || "Booki"))}</span><button type="button">${esc(t("act.undo"))}</button>`;
  undoToast.classList.remove("hidden");
  placeUndoToast();
  undoToast.querySelector("button")?.addEventListener("click", undoLastRemoval, { once: true });
  undoRemovalTimer = setTimeout(hideUndoToast, 5000);
}

async function undoLastRemoval() {
  if (!undoRemoval || !cfg) return;
  const { item, index } = undoRemoval;
  hideUndoToast();
  if (cfg.pinned.some((entry) => entry.id === item.id)) return;
  cfg.pinned.splice(Math.min(index, cfg.pinned.length), 0, item);
  if (!(await persist())) return;
  await render();
  reframe();
}
// The shared bridge filters this WebView's own echo by origin.
function emitConfigChanged() { return emitConfigChangedRaw(); }
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
    await render(); // render() starts widget polls when visible
    reframe();
    setupAutoHide();
    setupFileDrop();
    // Remove booting class to trigger the slide-in animation.
    document.body.classList.remove("booting");
    document.body.classList.add("boot-animate");
    setTimeout(() => document.body.classList.remove("boot-animate"), 500);
    onConfigChanged(() => reloadConfig());
    observeSystem(dockApi, { media: refreshMedia, volume: refreshVolume, windows: () => { if (!hiddenState) appPollTick?.(false); } }, (support) => {
      const windowsChanged = !!nativeSupport.windows !== !!support.windows;
      nativeSupport = support;
      if (windowsChanged && !hiddenState) startRunningPoll();
    });
    onOcclusion(onOcclusionSignal);
    onDesktop(onDesktopSignal);
    onFullscreen(onFullscreenSignal);
    // Tray / global hotkey: tuck or summon through the same hide/reveal path
    // the notch uses so JS hiddenState stays in sync with the native windows.
    onToggleDock(() => {
      if (fullscreen) return;
      if (hiddenState) pinOpen();
      else setHidden(true);
    });
    // Quick launcher shortcut: summon the dock if tucked, then open the search.
    onLauncher(() => {
      if (fullscreen) return;
      if (hiddenState) pinOpen();
      openLauncher();
    });
    // Position hotkeys (modifier+1…9): launch the Nth item on the bar.
    onLaunchIndex((i) => {
      const items = cfg.pinned.filter((p) => p.kind !== "separator");
      const item = items[i];
      if (!item) return;
      const el = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
      if (el) launch(el, item);
      else if (item.path) dockApi.launch(item.path, item.args || []);
    });
    // Keep the Explorer "Add to Booki" right-click menu in step with the
    // current groups + language (deferred: registry writes aren't urgent).
    setTimeout(maybeSyncCtxMenu, 2500);
    // Defer the update check (a network round-trip) a few seconds so it doesn't
    // compete with first paint / icon extraction during startup.
    setTimeout(checkUpdates, 4000);
    // First-run tips first; changelog only after the user is past onboarding.
    setTimeout(() => {
      if (!cfg.onboarded) maybeOnboard();
      else checkChangelog();
    }, 800);
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

let configReloadGeneration = 0;
async function reloadConfig() {
  const request = ++configReloadGeneration;
  const next = await configApi.get();
  if (request !== configReloadGeneration) return;
  const prev = cfg;
  cfg = next;
  // If the language changed, make sure its dictionary is loaded before re-render.
  if (!prev || prev.language !== cfg.language) await ensureLang(cfg.language);
  if (request !== configReloadGeneration) return;
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
  const languageChanged = !!prev && prev.language !== cfg.language;
  if (languageChanged) { closeMenu(); closeTrashPop(); hideTip(); }
  const pinsChanged = languageChanged || !prev || JSON.stringify(prev.pinned) !== JSON.stringify(cfg.pinned);
  if (pinsChanged) {
    // Stale flyout handlers hold old children — close rather than lie.
    const keepCatalog = stackOpen && stackItemId === "__add";
    if (stackOpen && !keepCatalog) closeStack();
    await render();
    if (keepCatalog) stackRefreshPins?.();
  } else {
    fitDock();
  }
  reframe();
  // Re-arming auto-hide resets the shown/hidden state; only do it when the
  // behavior actually changed, so unrelated tweaks can't blink the dock.
  const hideChanged =
    !prev ||
    prev.edge !== cfg.edge ||
    (prev.autoHideMode || "") !== (cfg.autoHideMode || "") ||
    prev.notchMode !== cfg.notchMode ||
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
  // The two strings baked into index.html were Spanish, which no language
  // setting could reach — a German user dragging a file onto the bar was told
  // "Suelta para anclar a Booki". They live in the dictionary now and are
  // written here, so they follow the language like everything else.
  dropOverlay.querySelector("#drop-pill").textContent = t("dock.dropPin");
  const pill = document.getElementById("update-pill");
  if (pill) {
    pill.textContent = t("dock.update");
    pill.title = t("dock.updateTip");
  }
  applyTheme(cfg);
  applyEdge(cfg);
  document.body.classList.toggle("hide-running-indicators", cfg.showIndicators === false);
  // The stage window spans the whole edge; the BAR aligns to the notch's
  // along-edge slot with CSS (the window itself no longer travels).
  const slot = cfg.notchPosition === "start" ? "start" : cfg.notchPosition === "end" ? "end" : "center";
  ["slot-start", "slot-center", "slot-end"].forEach((c) => document.body.classList.remove(c));
  document.body.classList.add(`slot-${slot}`);
  const root = document.documentElement;
  // CSS materials on a transparent window (native DWM vibrancy left a gray box).
  // Solidity + optional glass tint drive dock/notch fill together.
  applyMaterial(cfg);
  if (cfg.accent) {
    root.style.setProperty("--accent", cfg.accent);
  }
  dockEl.style.setProperty("--gap", `${cfg.spacing ?? 6}px`);
  // How close the bar sits to its screen edge (user-tunable). The transparent
  // pad on the anchored side shrinks down to the requested gap; anything past
  // the stage pad is handled by the window's own margin (backend dock_xy).
  const edgeGap = Math.max(0, Math.min(96, cfg.edgeGap ?? 12));
  root.style.setProperty("--edge-pad", `${Math.min(SHADOW_PAD, edgeGap)}px`);
  // A small gap leaves no room for the outward drop shadow — soften it.
  document.body.classList.toggle("tight-edge", edgeGap < 24);
  // Tile/corner roundness (user-tunable). Drives tiles, widgets (.w-card),
  // group grids/minis, and letter glyphs. Dock chrome is a touch rounder.
  const cr = cfg.cornerRadius ?? 12;
  root.style.setProperty("--tile-r", `${cr}px`);
  root.style.setProperty("--dock-r", `${dockRadius(cfg)}px`);
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

let persistQueue = Promise.resolve();
function persist(patch = {}, { showError = true } = {}) {
  const pending = persistQueue.then(() => performPersist(patch, showError));
  persistQueue = pending.catch(() => {});
  return pending;
}
async function performPersist(patch, showError) {
  // Keep named group containers intact, including empty and single-item groups.
  cfg.pinned = normalizeGroups(cfg.pinned);
  const changes = { pinned: cfg.pinned, seenVersion: cfg.seenVersion || "", onboarded: !!cfg.onboarded, settingsIntroSeen: !!cfg.settingsIntroSeen, ...patch };
  try {
    await configApi.patch(changes);
    maybeSyncCtxMenu();
    await emitConfigChanged();
    return true;
  } catch (error) {
    logMessage("error", `dock save failed: ${error}`);
    const conflict = parseConfigConflict(error);
    // Restore the persisted view; retain the proposed edit for explicit retry.
    await reloadConfig().catch(() => {});
    if (undoToast && showError) {
      hideUndoToast();
      undoToast.innerHTML = `<span>${esc(t(conflict ? "workspace.conflict" : "status.saveError"))}</span><button type="button">${esc(t(conflict ? "workspace.keepMine" : "focus.retry"))}</button>`;
      undoToast.classList.remove("hidden");
      placeUndoToast();
      const retryButton = undoToast.querySelector("button");
      retryButton?.addEventListener("click", async () => {
        retryButton.disabled = true;
        try {
          await configApi.get(); // Retry is an explicit decision against the latest snapshot.
          await configApi.patch(changes);
          await emitConfigChanged();
          await reloadConfig();
          if (undoToast.contains(retryButton)) hideUndoToast();
        } catch (retryError) {
          logMessage("error", `dock retry failed: ${retryError}`);
          retryButton.disabled = false;
        }
      });
    }
    return false;
  }
}

// ──────────────────────────── Render ────────────────────────────

// Cache of live-widget elements by type, rebuilt on each render so the poll
// loop never re-queries the DOM every tick. Invalidated (rebuilt) below.
let widgetEls = {};
function cacheWidgetEls() {
  widgetEls = {};
  // The widget elements are about to be replaced, so any "already painted this
  // minute" shortcut is stale — a fresh clock card would otherwise sit on its
  // placeholder until the minute rolled over.
  lastClockKey = "";
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
let renderGeneration = 0;

async function render() {
  const generation = ++renderGeneration;
  const snapshot = cfg;
  // Build every tile in parallel and swap the whole bar in ONE DOM operation —
  // no icons popping in one by one, no empty-bar flash between renders.
  const tiles = await Promise.all(
    snapshot.pinned.map((item) => {
      if (item.kind === "separator") return separatorTile(item);
      if (item.kind === "group") return groupTile(item);
      if (item.kind === "widget") return widgetTile(item);
      if (item.kind === "trash") return trashTile(item);
      if (item.kind === "action") return actionTile(item);
      return appTile(item);
    })
  );
  if (generation !== renderGeneration || cfg !== snapshot) return;
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

  // Empty state opens the same searchable app/widget panel as the dock menu.
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
    hint.addEventListener("click", () => openAddPanel(hint));
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
  const span = vertical ? availH(isTauri) : availW(isTauri);
  // A slot-aligned bar (start/end) sits behind a 12% offset — that space isn't
  // usable, or a full bar would overflow past the far screen edge.
  const slotPad = cfg && cfg.notchPosition && cfg.notchPosition !== "center" ? span * 0.12 : 0;
  const usable = span - SHADOW_PAD * 2 - 24 - slotPad;
  let overflow = false;
  if (usable > 0) {
    const natural = vertical ? dockEl.scrollHeight : dockEl.scrollWidth;
    if (natural > usable) {
      const eff = chooseFitSize(baseSize(), natural, usable, cfg.overflowMode);
      if (eff >= MIN_TILE) {
        setAllSizes(eff);
        overflow = (vertical ? dockEl.scrollHeight : dockEl.scrollWidth) > usable;
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

function actionTile(item) {
  const el = document.createElement("button"); el.className = "tile action-tile";
  const label = item.name && item.name !== "Booki" ? item.name : t("m.settings");
  el.dataset.id = item.id; setTileLabel(el, label);
  el.style.setProperty("--size", `${baseSize()}px`);
  const fallback = () => { const glyph = document.createElement("span"); glyph.className = "action-icon"; glyph.innerHTML = icon("settings"); el.appendChild(glyph); };
  if (item.icon) {
    const img = document.createElement("img"); img.alt = "";
    img.addEventListener("error", () => { img.remove(); fallback(); }, { once: true });
    img.src = isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon; el.appendChild(img);
  } else fallback();
  el.addEventListener("contextmenu", (e) => openMenu(e, item));
  const rm = document.createElement("span"); rm.className = "rm"; rm.innerHTML = icon("x"); rm.title = t("apps.remove");
  rm.addEventListener("pointerdown", (e) => e.stopPropagation());
  rm.addEventListener("click", (e) => { e.stopPropagation(); removeItem(item.id); }); el.appendChild(rm);
  el.addEventListener("pointerdown", (e) => onPointerDown(e, el, item)); return el;
}

function appTile(item) {
  const el = document.createElement("button");
  el.className = "tile";
  el.dataset.id = item.id;
  el.style.setProperty("--size", `${baseSize()}px`);
  // Accessible name is independent of the custom hover/focus hint.
  setTileLabel(el, item.name);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.name;
  el.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "badge";
  el.appendChild(badge);

  const addGlyph = () => {
    if (el.querySelector(".glyph, img")) return;
    const look = pinFallback(item);
    const glyph = document.createElement("span");
    glyph.className = "glyph fallback";
    glyph.style.setProperty("--fb-color", look.color);
    glyph.style.setProperty("--fb-deep", look.deep);
    glyph.style.setProperty("--fb-ink", look.ink);
    if (look.glyph) glyph.innerHTML = icon(look.glyph);
    else glyph.textContent = look.letter;
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
  rm.innerHTML = icon("x");
  rm.title = t("apps.remove");
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
  const look = groupAppearance(item);
  if (look.color) { el.style.setProperty("--group-color", look.color); el.style.setProperty("--group-ink", look.ink); el.classList.add("tinted"); }
  setTileLabel(el, item.name || t("group.new"));

  const grid = document.createElement("span");
  grid.className = "group-grid";
  const setMiniImg = (mini, src) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    mini.appendChild(img);
  };
  const setMiniLetter = (mini, child) => {
    const look = pinFallback(child);
    mini.classList.add("fallback");
    mini.style.setProperty("--fb-color", look.color);
    mini.style.setProperty("--fb-deep", look.deep);
    mini.style.setProperty("--fb-ink", look.ink);
    if (look.glyph) mini.innerHTML = icon(look.glyph);
    else mini.textContent = look.letter;
  };
  const kids = (item.children || []).slice(0, 4);
  for (const child of kids) {
    const mini = document.createElement("span");
    mini.className = "group-mini";
    if (child.kind === "widget") {
      // A grouped widget previews as its emoji (it only goes live inside the group).
      mini.innerHTML = WIDGET_GLYPHS[child.widget] ? icon(WIDGET_GLYPHS[child.widget]) : emo(WIDGET_ICONS[child.widget] || "puzzle", 18);
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
  if (!kids.length) grid.innerHTML = icon("grid");
  if (look.glyph) {
    // A glyph makes the group a solid badge in its colour.
    el.classList.add("badge-group");
    grid.innerHTML = libGlyphSVG(look.glyph);
  } else if (item.icon) {
    const fallback = [...grid.childNodes];
    const cover = document.createElement("img"); cover.className = "group-cover"; cover.alt = "";
    cover.addEventListener("error", () => grid.replaceChildren(...fallback), { once: true });
    cover.src = isLibIcon(item.icon) ? resolveLibIcon(item.icon) : item.icon;
    grid.replaceChildren(cover);
  }
  el.appendChild(grid);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.name || t("group.new");
  el.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "badge";
  el.appendChild(badge);

  const rm = document.createElement("button");
  rm.className = "rm";
  rm.innerHTML = icon("x");
  rm.title = t("apps.remove");
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
  setTileLabel(el, t("trash.name"));
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
  setTileLabel(tile, count > 0 ? `${t("trash.name")} · ${count}` : t("trash.name"));
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

function widgetLabel(type) {
  return widgetDisplayName(type, t);
}

function widgetTile(item, { inFlyout = false } = {}) {
  const type = canonicalWidget(item.widget || "clock") || "clock";
  const st = item.style || {};
  const el = document.createElement("button");
  el.className = "tile widget" + (inFlyout ? " in-flyout" : "");
  el.dataset.id = item.id;
  el.dataset.widget = type;
  el.dataset.span = String(st.span || "auto");
  el.style.setProperty("--widget-width", `${widgetWidth(type, baseSize(), cfg.spacing ?? 6, st)}px`);
  el.dataset.variant = st.variant || "glass";
  if (type === "media" && st.scrollVolume) el.dataset.scrollVolume = "1";
  if (st.color) el.style.setProperty("--w-accent", st.color);
  else if (RING_DEFAULTS[type]) {
    el.style.setProperty("--w-accent", RING_DEFAULTS[type]);
    el.dataset.autoAccent = "1"; // no custom color set → the battery ring may still shift to red when low
  } else if (WIDGET_META[type]) {
    el.style.setProperty("--w-accent", WIDGET_META[type].accent);
  }
  if (st.animated) el.classList.add("animated");
  if (st.icon === false) el.classList.add("no-ico");
  el.style.setProperty("--size", `${baseSize()}px`);
  setTileLabel(el, widgetLabel(type));
  if (LIVE_WIDGETS.includes(type)) el.setAttribute("aria-live", "polite");

  const card = document.createElement("span");
  card.className = "w-card";
  if (PREVIEW_WIDGETS.includes(type)) el.classList.add("preview");
  card.innerHTML = widgetCardHTML(type, st);
  el.appendChild(card);

  // On the bar the widget is a full dock tile (removable, draggable, right-click
  // menu). Inside a group flyout it's just a live read-out — the flyout supplies
  // its own take-out/remove and drag-out gestures, so skip the dock wiring.
  if (!inFlyout) {
    const rm = document.createElement("button");
    rm.className = "rm";
    rm.innerHTML = icon("x");
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
  if (["clock", "focus", "calendar", "weather"].includes(type)) tickClocks();
  if (type === "notes") {
    el.querySelector(".w-pv-title").textContent = t("w.notes");
    setPreviewSubText(el, st.note || t("w.notesEmpty"), !st.note);
    setTileLabel(el, widgetLabel("notes"));
  }
  if (type === "clipboard") {
    el.querySelector(".w-pv-title").textContent = t("w.clipboard");
    setPreviewSubText(el, t("clip.empty"), true);
  }
  return el;
}

// Run fn over every cached element of a widget type (no per-tick DOM query).
function eachWidget(type, fn) {
  const list = widgetEls[type];
  if (list) list.forEach(fn);
}

// The poll loop ticks every second so the clock rolls over promptly, but the
// card only shows hours and minutes: 59 of every 60 ticks used to reformat the
// same two strings with Intl and write them straight back into the DOM. Keep
// the 1s cadence (it is what makes the rollover feel immediate) and skip the
// work when the displayed minute has not changed.
let lastClockKey = "";
function tickClocks() {
  if (hiddenState) return; // don't update a tucked-away dock
  const { key, time, date } = clockParts(new Date(), curLang());
  tickProductivity();
  if (key === lastClockKey) return;
  lastClockKey = key;
  eachWidget("clock", (el) => setText(el, date, time));
}

function findWidgetPin(id, items = cfg.pinned) {
  for (const item of items) { if (item.id === id) return item; const child = item.children && findWidgetPin(id, item.children); if (child) return child; }
  return null;
}
const weatherCache = new Map();
function tickProductivity() {
  // Focus shows the running (or just finished) timer, otherwise the next task.
  eachWidget("focus", (el) => {
    const item = findWidgetPin(el.dataset.id); if (!item) return;
    const style = item.style || {};
    const seconds = timerSeconds(style);
    const finished = !!style.endsAt && seconds === 0;
    const summary = tasksSummary(style.tasks);
    if (style.endsAt) setText(el, finished ? t("focus.finished") : summary.next || t("w.focus"), formatTimer(seconds));
    else if (summary.total) setText(el, summary.next || t("focus.allDone"), `${summary.done}/${summary.total}`);
    else setText(el, t("w.focus"), formatTimer(seconds));
    el.classList.toggle("focus-finished", finished);
  });
  eachWidget("calendar", (el) => setText(el, new Date().toLocaleDateString(curLang(), { month: "short", weekday: "short" }), String(new Date().getDate())));
  eachWidget("weather", (el) => {
    const style = findWidgetPin(el.dataset.id)?.style || {};
    if (!Number.isFinite(style.latitude) || !Number.isFinite(style.longitude)) { setText(el, t("focus.noCity"), "—"); return; }
    const key = `${style.latitude},${style.longitude}`;
    let cached = weatherCache.get(key);
    if (!cached || (!cached.pending && Date.now() >= cached.expires)) {
      cached = { pending: true, expires: Date.now() + 600000, value: cached?.value }; weatherCache.set(key, cached);
      const record = cached;
      dockApi.weatherCurrent(style.latitude, style.longitude).then((value) => {
        record.value = value; record.error = false;
      }, () => { record.error = true; record.expires = Date.now() + 60000; }).finally(() => { record.pending = false; if (!hiddenState) tickProductivity(); });
    }
    setText(el, style.city || t("w.weather"), cached.value ? `${Math.round(style.units === "fahrenheit" ? cached.value.temperature_2m * 9 / 5 + 32 : cached.value.temperature_2m)}°` : cached.error ? t("focus.weatherError") : "…");
    setTileLabel(el, `${style.city || t("w.weather")} · Open-Meteo`);
  });
}
let productivityPanel = null;
function closeProductivityPanel() {
  productivityPanel?.dispose?.();
  productivityPanel?.remove(); productivityPanel = null; pinnedReveal = false; reframe(); scheduleHide();
}
function openProductivity(item, tile) {
  closeProductivityPanel();
  const panel = buildProductivityPanel(item, {
    save: async (draft, previous) => {
      // Recovery replaces cfg objects. Resolve the live pin by stable id on
      // every edit, retaining unrelated appearance changes from Settings.
      const live = findPinnedById(draft.id);
      if (!live || live.kind !== "widget" || live.widget !== draft.widget) throw Object.assign(new Error("widget no longer exists"), { code: "WIDGET_UNAVAILABLE" });
      const next = { ...(live.style || {}) };
      for (const key of new Set([...Object.keys(previous || {}), ...Object.keys(draft.style || {})])) {
        if (JSON.stringify(previous?.[key]) === JSON.stringify(draft.style?.[key])) continue;
        if (draft.style?.[key] === undefined) delete next[key]; else next[key] = structuredClone(draft.style[key]);
      }
      live.style = next;
      if (!(await persist({}, { showError: false }))) throw new Error("widget changes could not be saved");
      draft.style = structuredClone(findPinnedById(draft.id)?.style || next);
      tickProductivity();
    }, weatherSearch: dockApi.weatherSearch, close: closeProductivityPanel,
  });
  panel.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape") closeProductivityPanel(); });
  productivityPanel = panel; document.body.appendChild(panel); pinnedReveal = true; applyFrame();
  const place = () => {
    if (!panel.isConnected) return;
    const pos = placeBesideBar({ bar: tile.getBoundingClientRect(), box: { width: panel.offsetWidth, height: panel.offsetHeight }, edge: cfg.edge, viewport: { width: innerWidth, height: innerHeight } });
    panel.style.left = `${pos.left}px`; panel.style.top = `${pos.top}px`; scheduleHitReport();
  };
  const dispose = panel.dispose;
  const observer = new ResizeObserver(() => { if (!panel.isConnected) { observer.disconnect(); return; } applyFrame(); requestAnimationFrame(place); }); observer.observe(panel);
  panel.dispose = () => { dispose?.(); observer.disconnect(); };
  requestAnimationFrame(() => { place(); panel.querySelector(item.widget === "weather" ? "input" : "button")?.focus(); });
}


// System stats (system + battery widgets) — one snapshot fans out to
// every stat card on the bar (from the cached element map).
const pollStats = singleFlight(async () => {
  let s;
  try {
    s = await dockApi.systemStats();
  } catch (_) {
    return;
  }
  if (!s) return;
  const labels = { cpu: "CPU", ram: "RAM", disk: t("w.disk"), net: t("w.net") };
  eachWidget("system", (el) => setSystem(el, s, labels));
  eachWidget("battery", (el) => {
    setWidgetAvailable(el, s.battery >= 0);
    if (s.battery < 0) { setText(el, t("w.battery"), "—"); return; }
    setMetric(el, t("w.battery"), s.battery);
    el.classList.toggle("charging", !!s.charging);
    // A ring left at its default color (never manually re-colored) turns red
    // when running low and unplugged — the same "pay attention" cue Windows
    // itself uses, without overriding a color the user picked on purpose.
    if (el.dataset.autoAccent) {
      el.style.setProperty("--w-accent", !s.charging && s.battery <= 20 ? BATTERY_LOW : RING_DEFAULTS.battery);
    }
  });
});

function setWidgetAvailable(el, available) {
  const item = findWidgetPin(el.dataset.id);
  const hide = !!item?.style?.hideWhenUnavailable && !available;
  if (el.classList.contains("conditionally-hidden") === hide) return;
  el.classList.toggle("conditionally-hidden", hide);
  requestAnimationFrame(() => { fitDock(); reframe(); });
}

// Now-playing card: the system media session (Spotify, browser, …).
const pollMedia = singleFlight(async () => {
  const m = await dockApi.mediaInfo().catch(() => null);
  eachWidget("media", (el) => {
    const art = el.querySelector(".w-art");
    const ico = el.querySelector(".w-ico");
    const toggle = el.querySelector(".w-ctl-toggle");
    setWidgetAvailable(el, !!m);
    if (!m) {
      setText(el, t("w.media"), t("w.mediaIdle"), t("w.media"));
      delete el.dataset.mqTitle;
      el.classList.remove("playing");
      if (art) { art.style.display = "none"; art.removeAttribute("data-src"); }
      if (ico) ico.style.display = "";
      if (toggle) toggle.innerHTML = MEDIA_SVG.play;
      return;
    }
    setMediaText(el, m.artist || t("w.media"), m.title || "—");
    setTileLabel(el, `${m.title} — ${m.artist}`);
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
});

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
const pollVolume = singleFlight(async () => {
  const v = await dockApi.volumeInfo().catch(() => null);
  if (Array.isArray(v)) renderVolume(v[0], !!v[1]);
});
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
  const step = volumeStep(deltaY);
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
    if (badge) badge.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
    setTileLabel(el, widgetLabel("clipboard"));
  });
}
const pollClipboard = singleFlight(async () => {
  const s = await dockApi.clipboardSummary().catch(() => ({ count: 0, preview: null }));
  renderClipboardSummary(s.count, s.preview);
});

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
  const hasClock = widgetPresent(["clock", "focus"]);
  const hasLocal = widgetPresent(["calendar", "weather"]);
  const hasStats = widgetPresent(STAT_WIDGETS);
  const hasMedia = widgetPresent("media");
  const hasVolume = widgetPresent("volume") || anyPinnedWidget((item) => item.widget === "media" && !!item.style?.scrollVolume);
  const hasClipboard = widgetPresent("clipboard");
  // Nothing live pinned → no timer at all (zero idle cost).
  if (!hasClock && !hasLocal && !hasStats && !hasMedia && !hasVolume && !hasClipboard) return;
  // First paint immediately so cards aren't blank until the first tick, then
  // schedule each poll a full interval out (no wasteful double-poll at start).
  if (hasClock || hasLocal) tickClocks();
  if (hasStats) pollStats();
  if (hasMedia) pollMedia();
  if (hasVolume) pollVolume();
  if (hasClipboard) pollClipboard();
  const t0 = Date.now();
  pollDue = { stats: t0 + 2400, media: t0 + 3000, volume: t0 + 4000, clipboard: t0 + 4000 };
  // Base cadence: 1 s only when a clock needs the second/minute rollover;
  // otherwise 1.5 s is plenty and lighter.
  const base = hasClock ? 1000 : hasStats || hasMedia || hasVolume || hasClipboard ? 1500 : 60000;
  widgetPollTimer = setInterval(() => {
    if (hiddenState) return; // don't poll a tucked-away dock
    const now = Date.now();
    if (hasClock || hasLocal) tickClocks();
    if (hasStats && now >= pollDue.stats) { pollDue.stats = now + 2400; pollStats(); }
    if (hasMedia && now >= pollDue.media) { pollDue.media = now + recoveryInterval(nativeSupport, "media", 3000); pollMedia(); }
    if (hasVolume && now >= pollDue.volume) { pollDue.volume = now + recoveryInterval(nativeSupport, "volume", 4000); pollVolume(); }
    if (hasClipboard && now >= pollDue.clipboard) { pollDue.clipboard = now + 4000; pollClipboard(); }
  }, base);
}
// Nudge a specific poll right away (e.g. after a transport/volume button).
function refreshMedia() { pollDue.media = Date.now() + recoveryInterval(nativeSupport, "media", 3000); if (!hiddenState) pollMedia(); }
function refreshVolume() { pollDue.volume = Date.now() + recoveryInterval(nativeSupport, "volume", 4000); if (!hiddenState) pollVolume(); }
function refreshClipboard() { pollDue.clipboard = 0; if (!hiddenState) pollClipboard(); }

async function addWidget(type, { showError = true } = {}) {
  cfg.pinned.push({ id: uid(), name: widgetLabel(type), path: "", args: [], kind: "widget", widget: type });
  if (!(await persist({}, { showError }))) return false;
  await render();
  reframe();
  return true;
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
  if (uri) {
    iconCache.set(item.path, uri);
    while (iconCache.size > 256) iconCache.delete(iconCache.keys().next().value);
  }
  return uri;
}

// Notes use a serialized autosave and keep their draft visible on failure.
let noteEditor = null;
async function closeNoteEditor() {
  const editor = noteEditor;
  if (!editor) return true;
  if (!(await editor.flush())) return false;
  if (noteEditor !== editor) return true;
  editor.dispose(); editor.remove(); noteEditor = null;
  pinnedReveal = false; reframe(); scheduleHide();
  return true;
}
async function editNote(item) {
  if (!(await closeNoteEditor())) return;
  closeProductivityPanel();
  const tile = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
  if (!tile) return;
  const panel = document.createElement("section");
  panel.className = "note-editor note-workspace"; panel.tabIndex = -1;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", t("w.notes"));
  const head = document.createElement("div"); head.className = "productivity-head";
  const title = document.createElement("strong"); title.textContent = t("w.notes");
  const close = document.createElement("button"); close.type = "button"; close.textContent = t("stack.close"); close.className = "productivity-button";
  close.addEventListener("click", closeNoteEditor); head.append(title, close);
  const ta = document.createElement("textarea"); ta.className = "note-input";
  ta.value = item.style?.note || ""; ta.placeholder = t("w.notesEmpty"); ta.setAttribute("aria-label", t("w.notes")); ta.maxLength = 20000;
  const footer = document.createElement("div"); footer.className = "note-save-state";
  const status = document.createElement("span"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.textContent = t("status.saved");
  const retry = document.createElement("button"); retry.type = "button"; retry.className = "productivity-button"; retry.textContent = t("focus.retry"); retry.hidden = true;
  let recoveryPending = true;
  let retryLoad = null;
  const saver = createDraftSaver(async (text) => {
    // Journal first: a failed configuration write still leaves a recoverable
    // encrypted local copy. Clear only the matching text after durable save.
    await dockApi.writeNoteDraft(item.id, text);
    const current = findWidgetPin(item.id);
    if (!current || current.widget !== "notes") return false;
    current.style = { ...(current.style || {}), note: text };
    if (!(await persist({}, { showError: false }))) return false;
    eachWidget("notes", (el) => {
      if (el.dataset.id !== item.id) return;
      setPreviewSubText(el, text || t("w.notesEmpty"), !text);
      setTileLabel(el, widgetLabel("notes"));
    });
    await dockApi.clearNoteDraft(item.id, text);
    return true;
  }, (state) => { status.textContent = t(state === "error" ? "status.saveError" : `status.${state}`); retry.hidden = state !== "error"; });
  panel.flush = () => recoveryPending ? Promise.resolve(true) : saver.flush(); panel.dispose = saver.cancelTimer;
  retry.addEventListener("click", () => { if (retryLoad) retryLoad(); else { ta.focus(); saver.flush(); } }); footer.append(status, retry); panel.append(head, ta, footer);
  ta.disabled = true;
  const loadRecovery = async () => {
    retry.hidden = true; status.textContent = t("overhaul.loading");
    try {
      const recovered = await dockApi.readNoteDraft(item.id);
      if (noteEditor !== panel) return;
      if (recovered != null && recovered !== ta.value) {
        const recovery = document.createElement("div"); recovery.className = "note-recovery";
        recovery.setAttribute("role", "status");
        const message = document.createElement("p"); message.textContent = t("notes.recoveryFound"); recovery.append(message);
        const preview = document.createElement("div"); preview.className = "note-recovery-preview"; preview.textContent = recovered || t("w.notesEmpty"); recovery.append(preview);
        const restore = document.createElement("button"); restore.type = "button"; restore.className = "productivity-button"; restore.textContent = t("notes.restoreDraft");
        const discard = document.createElement("button"); discard.type = "button"; discard.className = "productivity-button"; discard.textContent = t("notes.discardDraft");
        const resume = () => { recovery.remove(); recoveryPending = false; retryLoad = null; ta.disabled = false; ta.focus(); status.textContent = t("status.saved"); };
        restore.addEventListener("click", () => { ta.value = recovered; resume(); saver.change(recovered); });
        discard.addEventListener("click", async () => {
          restore.disabled = discard.disabled = true;
          try { await dockApi.clearNoteDraft(item.id, recovered); if (noteEditor === panel) resume(); }
          catch { status.textContent = t("status.saveError"); restore.disabled = discard.disabled = false; }
        });
        recovery.append(restore, discard); panel.insertBefore(recovery, ta);
        status.textContent = t("notes.recoveryFound"); retryLoad = null; restore.focus();
      } else {
        if (recovered != null) await dockApi.clearNoteDraft(item.id, recovered);
        if (noteEditor !== panel) return;
        recoveryPending = false; retryLoad = null; ta.disabled = false; status.textContent = t("status.saved"); ta.focus();
      }
    } catch {
      if (noteEditor !== panel) return;
      status.textContent = t("status.saveError"); retry.hidden = false; retryLoad = loadRecovery;
    }
  };
  ta.addEventListener("input", () => saver.change(ta.value));
  panel.addEventListener("keydown", async (event) => {
    event.stopPropagation();
    if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) { event.preventDefault(); await closeNoteEditor(); }
  });
  panel.addEventListener("focusout", (event) => {
    if (event.relatedTarget && panel.contains(event.relatedTarget)) return;
    // Only close after focus has really moved out; a native dialog can blur it.
    requestAnimationFrame(() => { if (noteEditor === panel && !panel.contains(document.activeElement)) closeNoteEditor(); });
  });
  document.body.appendChild(panel); noteEditor = panel; pinnedReveal = true; applyFrame();
  loadRecovery();
  const place = () => {
    if (!panel.isConnected) return;
    const { left, top } = placeBesideBar({ bar: tile.getBoundingClientRect(), box: { width: panel.offsetWidth, height: panel.offsetHeight }, edge: cfg.edge, viewport: { width: innerWidth, height: innerHeight }, pad: 6 });
    panel.style.left = `${left}px`; panel.style.top = `${top}px`; scheduleHitReport();
  };
  const observer = new ResizeObserver(() => { applyFrame(); requestAnimationFrame(place); }); observer.observe(panel);
  panel.dispose = () => { saver.cancelTimer(); observer.disconnect(); };
  requestAnimationFrame(() => { place(); if (ta.disabled) panel.focus(); else ta.focus(); });
}

// ─────────────────────────── Launch ───────────────────────────

function launch(el, item) {
  if (item.kind === "action") { if (item.action === "settings") dockApi.openSettings(); return; }
  // Widgets aren't launchers — except the media card, where a click is
  // play/pause. Others do nothing on click.
  if (item.kind === "widget") {
    if (item.widget === "media") dockApi.mediaToggle().then(refreshMedia, () => {});
    if (item.widget === "volume") dockApi.volumeMute().then(refreshVolume, () => {});
    if (item.widget === "notes") editNote(item);
    if (item.widget === "clipboard") toggleClipboardStack(el);
    if (["clock", "focus", "calendar", "weather"].includes(item.widget)) openProductivity(item, el);
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
  // Launcher + switcher: when "focus if running" is on (the default)
  // and the app already has a window, bring it to the front instead of
  // launching a new instance. With several windows, let the user pick one.
  const hwnd = el.dataset.hwnd;
  const switching = cfg.focusIfRunning !== false && el.dataset.running === "true" && hwnd;
  const wins = switching ? windowsFor(item) : [];
  // A tucked-away dock (Alt+N while hidden) can't show a picker: go to the first.
  if (wins.length > 1 && !hiddenState) { openWindowPicker(el, item, wins); return; }
  // Launching/switching means the user is done with the dock for now — release
  // any pinned reveal so smart-hide can tuck it back into the notch.
  pinnedReveal = false;
  scheduleHide();
  // The app's only window: bring it forward, or minimize it if it is
  // already in front (a second click, as on the taskbar).
  if (switching) {
    dockApi.toggleWindow(Number(hwnd));
    return;
  }
  markLaunching(el);
  dockApi.launch(item.path, item.args || []);
}

/** Brief launch feedback: the icon pops and the indicator pulses until the
   app shows a window (or a few seconds pass), so a slow cold start never
   looks like a missed click. */
function markLaunching(el) {
  el.classList.remove("launching");
  void el.offsetWidth; // restart the animation on a repeated click
  el.classList.add("launching");
  clearTimeout(el._launchTimer);
  el._launchTimer = setTimeout(() => el.classList.remove("launching"), 4000);
}

/** Several windows of one app: list them beside the tile, in the order
   Windows reports them, with a way to open another one. */
function openWindowPicker(el, item, wins) {
  hideTip();
  ctxMenu.innerHTML = "";
  ++menuGeneration;
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  addMenuHead(menuPinTitle(item), t("m.windows").replace("{n}", String(wins.length)));
  sep();
  for (const w of wins.slice(0, 10)) {
    add("app", w.title || menuPinTitle(item), () => dockApi.focusWindow(Number(w.hwnd)));
  }
  sep();
  add("plus", t("m.newWindow"), () => { markLaunching(el); dockApi.launch(item.path, item.args || []); });
  const r = el.getBoundingClientRect();
  // After the click that opened it has finished bubbling: a window click
  // closes any open menu.
  setTimeout(() => placeMenu({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }), 0);
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

async function addPaths(paths, forceKind, atIndex = null, { showError = true } = {}) {
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
  if (!(await persist({}, { showError }))) return false;
  await render();
  reframe();
  return true;
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
    if (t.dataset.widget) t.style.setProperty("--widget-width", `${widgetWidth(t.dataset.widget, size, cfg.spacing ?? 6, findWidgetPin(t.dataset.id)?.style || {})}px`);
    t.style.transform = "";
    t.style.zIndex = "";
    t.classList.remove("focus");
  });
}

function resetMagnify() {
  // Drop "live" mode first so restoring the transform transition lets the tiles
  // ease smoothly back to rest instead of snapping.
  dockEl.classList.remove("mag-live");
  dockEl.querySelectorAll(".tile").forEach((t) => {
    t.style.transform = "";
    t.style.zIndex = "";
    t.classList.remove("focus");
  });
  magFocus = null;
  // Resting hit-rects — don't leave the inflated mag union clickable.
  lastHitSig = "";
  scheduleHitReport();
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

// Booki magnify — Apple/Cool Dock style wave: tiles scale + lift toward the
// screen interior AND nudge along the main axis so neighbours make room
// instead of stacking. Geometry is cached; this loop only writes transforms.
function magnify(clientX, clientY) {
  if (cfg.magnification === false || (cfg.magnifyStyle || "spring") === "off") return;
  if (dockEl.classList.contains("dragging") || editMode) return;
  // In scroll (overflow) mode the bar clips its ends, so a scaled tile would be
  // cut off — skip magnify; the name still shows via tooltip on hover.
  if (document.body.classList.contains("dock-overflow")) return;
  if (!magCache) buildMagCache();
  // Follow the pointer 1:1 this frame (no CSS transition lag) — the settle when
  // you leave still eases. This is what makes it feel crisp at high refresh.
  // Guarded: re-adding a class that is already there still queues a mutation
  // record, and this runs every frame — that single write was waking the
  // observer below once per frame, which scheduled a full hit-rect report that
  // raced the one magnify schedules itself.
  if (!dockEl.classList.contains("mag-live")) dockEl.classList.add("mag-live");
  const base = baseSize();
  // Reduced motion reaches magnify here, not through CSS: the wave is written
  // as an inline transform every frame, which the global override cannot touch,
  // so the setting used to do nothing at all to the dock's largest animation.
  // What goes is the decoration — neighbours rippling outward, tiles lifting
  // off the bar. What stays is a small scale on the tile under the pointer,
  // because that is not ornament: it is how you know what you are about to
  // click, and removing it would make the dock harder to use, not calmer.
  const calm = reduceMotion();
  const maxScale = calm ? Math.min(1.12, Math.max(1, cfg.zoom || 1.25)) : Math.max(1, cfg.zoom || 1.25);
  const spread = calm ? base * 0.6 : base * 2.0;
  const vertical = isVertical();
  const mainAxis = vertical ? "Y" : "X";
  const liftAxis = vertical ? "X" : "Y";
  const liftSign = (vertical ? cfg.edge === "left" : cfg.edge === "top") ? 1 : -1;
  const dr = magDockRect;
  const pointer = vertical ? clientY - dr.top : clientX - dr.left;
  let best = null;
  let bestInf = 0;
  for (const item of magCache) {
    const delta = item.center - pointer;
    const influence = item.noMag ? 0 : Math.max(0, 1 - (Math.abs(delta) / spread) ** 2);
    const scale = item.noMag ? 1 : 1 + (maxScale - 1) * influence;
    // Lift toward the screen interior (translate BEFORE scale so it stays a
    // constant px amount). Neighbours also push along the bar — the wave.
    // Rail-origin scale does most of the "lift"; keep translate modest.
    const lift = calm ? 0 : Math.round(influence * 5);
    const liftTf = lift ? `translate${liftAxis}(${liftSign * lift}px) ` : "";
    const push = item.noMag || calm ? 0 : Math.sign(delta || 1) * influence * base * 0.22;
    const pushTf = push ? `translate${mainAxis}(${push.toFixed(1)}px) ` : "";
    item.el.style.zIndex = influence > 0.02 ? String(Math.round(10 + influence * 90)) : "";
    item.el.style.transform = `${pushTf}${liftTf}scale(${scale.toFixed(3)})`;
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
  // Hit-rects must track the wave — style mutations are ignored while mag-live,
  // so schedule from this rAF instead of waiting for the MutationObserver.
  scheduleMagHitRects();
}

let magHitTimer = 0;
function scheduleMagHitRects() {
  if (magHitTimer) return;
  magHitTimer = requestAnimationFrame(() => {
    magHitTimer = 0;
    if (!dockEl.classList.contains("mag-live")) {
      reportHitRects();
      return;
    }
    reportHitRectsLive();
  });
}

/** Hit-test using transformed tile bounds while magnify is live. */
function reportHitRectsLive() {
  reportDockMaterial();
  if (!dockApi.setHitRects) return;
  try {
    // Derive the region from the bar's RESTING rect plus the most the wave can
    // ever add, instead of measuring every tile.
    //
    // This used to walk all the tiles and getBoundingClientRect() each one,
    // from inside the magnify rAF — a forced layout right after writing their
    // transforms, then an IPC call, every frame. On a 144Hz screen with a full
    // bar that is ~2200 rect reads and 144 backend calls a second for as long
    // as the cursor rests on the dock.
    //
    // The bound is exact: magnify scales a tile by at most `zoom` about the
    // rail, lifts it 5px perpendicular and pushes neighbours base*0.22 along
    // the bar. A pad covering all three is a superset of the real union — and,
    // unlike the union, it does not change as the wave travels, so the
    // signature check below collapses the whole gesture into one call.
    const dr = magDockRect || dockEl.getBoundingClientRect();
    const base = baseSize();
    const grow = Math.max(0, (Math.max(1, cfg.zoom || 1.25) - 1) * base);
    const pad = Math.ceil(grow + base * 0.22 + 6);
    const rect = [
      Math.floor(dr.left - pad),
      Math.floor(dr.top - pad),
      Math.ceil(dr.width + pad * 2),
      Math.ceil(dr.height + pad * 2),
    ];
    const sig = `mag:${rect.map(Math.round).join(",")}`;
    if (sig === lastHitSig) return;
    lastHitSig = sig;
    dockApi.setHitRects([rect], false).catch(() => {});
  } catch (_) {
    /* best-effort */
  }
}

// Show the changelog the first time the app opens after an update.
async function checkChangelog() {
  try {
    // Don't open Settings "What's new" during first-run tips.
    if (!cfg.onboarded) return;
    const v = await dockApi.appVersion();
    if (v && cfg.seenVersion !== v) {
      cfg.seenVersion = v;
      if (!(await persist())) return;
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
        dismissPop(pop, () => {
          document.body.classList.remove("pop-open");
          reframe();
        });
        cfg.onboarded = true;
        cfg.settingsIntroSeen = true;
        await persist();
        pinnedReveal = false;
        scheduleHide();
        checkChangelog();
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
  if (tile.classList.contains("widget")) dockApi.openSettingsTab("widgets");
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

async function endEdgeMove(commit) {
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
    await dockApi.setDockEdge(target);
    await persist({ edge: target });
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
window.addEventListener("pointerup", () => { if (edgeMove) endEdgeMove(true).catch(() => {}); });
window.addEventListener("pointercancel", () => { if (edgeMove) endEdgeMove(false).catch(() => {}); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && edgeMove) endEdgeMove(false).catch(() => {});
});

// Mouse wheel over a widget → cycle its visual style (a fun, fast tweak).
let wheelSaveTimer = null;
dockEl.addEventListener(
  "wheel",
  (e) => {
    // In overflow (scroll) mode the wheel always pans the bar so crowded docks
    // stay reachable. Hold Alt to keep widget-specific wheel gestures.
    if (document.body.classList.contains("dock-overflow") && !e.altKey) {
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
    wheelSaveTimer = setTimeout(() => { persist(); }, 350);
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
  const toolbar = document.createElement("div"); toolbar.className = "edit-toolbar";
  const label = document.createElement("span"); label.textContent = t("overhaul.editing");
  const done = document.createElement("button"); done.type = "button"; done.textContent = t("w.done"); done.addEventListener("click", exitEdit);
  toolbar.append(label, done); document.body.appendChild(toolbar);
  pinnedReveal = true; applyFrame();
  requestAnimationFrame(() => {
    const pos = placeBesideBar({ bar: dockEl.getBoundingClientRect(), box: { width: toolbar.offsetWidth, height: toolbar.offsetHeight }, edge: cfg.edge, viewport: { width: innerWidth, height: innerHeight } });
    toolbar.style.left = `${pos.left}px`; toolbar.style.top = `${pos.top}px`; scheduleHitReport();
  });
  setAllSizes(baseSize());
}
function exitEdit() {
  if (!editMode) return;
  editMode = false;
  document.body.classList.remove("edit");
  document.querySelector(".edit-toolbar")?.remove();
  pinnedReveal = false; reframe();
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
  placeHint(null);
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
    placeHint(/\.lnk$/i.test(press.item.path || "") ? t("shortcut.unpinHint") : t("m.remove"), press.el);
    return; // no reordering/merging while aiming outside the bar
  }

  const sibs = [...dockEl.querySelectorAll(".tile[data-id]")].filter((s) => s !== press.el);

  // Hovering the CENTER of another tile → group (merge) intent. Apps and widgets
  // can both be grouped now (widgets go live only inside the group). Separators,
  // the trash tile and groups-into-groups never form a group.
  const canMerge = canMergeKind(press.item.kind);
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
    if (Date.now() - mergeArm > 260) {
      centerTarget.classList.add("merge-target");
      const into = cfg.pinned.find((p) => p.id === centerTarget.dataset.id);
      placeHint(
        into?.kind === "group" ? t("drop.addTo").replace("{name}", menuPinTitle(into)) : t("drag.makeGroup"),
        centerTarget
      );
    }
    return; // aiming at the bullseye → hold for a merge, don't reorder
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
  placeHint(null);
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
      cfg.pinned.sort((a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0));
      if (!(await persist())) return;
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

/* Keyboard activation.
 *
 * Every tile is a real <button>, so it takes focus and Tab walks the bar
 * correctly — but launching was wired only to pointerdown/pointerup. Enter and
 * Space synthesise a click with no pointer events behind it, so nothing
 * happened: you could tab through the entire dock without being able to open a
 * single thing. Handled here rather than on each tile so it covers whatever
 * render() built, including tiles inside an open group.
 */
dockEl.addEventListener("keydown", (e) => {
  const tile = closestSel(e.target, ".tile");
  if (!tile || !tile.dataset.id) return;
  const item = findPinnedById(tile.dataset.id);
  if (!item || item.kind === "separator") return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault(); // Space would otherwise scroll the bar
    if (editMode) exitEdit();
    else launch(tile, item);
    return;
  }
  // The menu key and Shift+F10 are what a keyboard user presses for a context
  // menu; without them the right-click actions (rename, remove, change icon)
  // are unreachable without a mouse.
  if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
    e.preventDefault();
    const r = tile.getBoundingClientRect();
    openMenu(
      { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, preventDefault() {}, stopPropagation() {} },
      item
    );
  }
});

// Merge a dragged pin onto a target → create a group (or add to one).
async function createGroup(draggedId, targetId) {
  const next = mergePins(cfg.pinned, draggedId, targetId, t("group.new"));
  if (next === cfg.pinned) return;
  cfg.pinned = next;
  exitEdit();
  if (!(await persist())) return;
  await render();
  reframe();
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
  const gi = cfg.pinned.findIndex((p) => p.id === item.id);
  if (gi < 0) return;
  const fallback = pinNameFallback(item);
  const next = String(name || "").trim() || fallback;
  cfg.pinned[gi].name = commit ? next : name;
  item.name = cfg.pinned[gi].name;
  const tile = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
  if (tile) {
    setTileLabel(tile, commit ? next : (name || fallback));
    const lab = tile.querySelector(".label");
    if (lab) lab.textContent = commit ? next : (name || fallback);
  }
  const stackInput = stackEl?.querySelector?.(".stack-rename");
  if (stackInput && stackItemId === item.id && document.activeElement !== stackInput) {
    stackInput.value = commit ? next : (name || "");
  }
  clearTimeout(renameTimer);
  if (commit) {
    cfg.pinned[gi].name = next;
    item.name = next;
    persist();
  } else {
    renameTimer = setTimeout(() => {
      const i = cfg.pinned.findIndex((p) => p.id === item.id);
      if (i >= 0) {
        cfg.pinned[i].name = String(cfg.pinned[i].name || "").trim() || fallback;
        persist();
      }
    }, 400);
  }
}
function renameGroup(group, name, opts) {
  renamePinnedItem(group, name, opts);
}
/** Inline rename popover from the dock context menu (apps, folders, groups…). */
function promptRename(item) {
  if (!item || item.kind === "separator") return;
  pinnedReveal = true;
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
    pinnedReveal = false;
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
  trashPop = pop;
  placePop(pop);
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

// Dissolve a folder: spill its children back to the dock at its position.
async function ungroup(group) {
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const rest = cfg.pinned[gi].children || [];
  cfg.pinned.splice(gi, 1, ...rest);
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
}

// Move one member back to the dock and reopen its preserved group.
async function takeOutChild(group, childId) {
  const { pinned, reopenId } = takeOutOfGroup(cfg.pinned, group.id, childId);
  cfg.pinned = pinned;
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
  if (reopenId) {
    const tileEl = dockEl.querySelector(`.tile[data-id="${reopenId}"]`);
    const it = cfg.pinned.find((p) => p.id === reopenId);
    if (tileEl && it) openStack(tileEl, it);
  }
}

/** Reorder a child inside its group and reopen the flyout. */
async function reorderGroupChild(group, childId, beforeId) {
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const kids = [...(cfg.pinned[gi].children || [])];
  const from = kids.findIndex((c) => c.id === childId);
  if (from < 0) return;
  const [moved] = kids.splice(from, 1);
  let to = beforeId ? kids.findIndex((c) => c.id === beforeId) : kids.length;
  if (to < 0) to = kids.length;
  kids.splice(to, 0, moved);
  cfg.pinned[gi].children = kids;
  // Keep flyout open across persist so smart-hide can't tuck mid-reorder.
  pinnedReveal = true;
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
  const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
  const it = cfg.pinned.find((p) => p.id === group.id);
  if (el && it) await openStack(el, it);
  pinnedReveal = false;
}

// Let a flyout child be dragged to reorder inside the panel, or dragged out to
// return it to the dock. Pointer-based (no native drag → no stray files).
function wireStackDragOut(cell, group, child) {
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
      return;
    }
    clearDropHint();
    st.beforeId = null;
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
    if (s.out) {
      if (s.clone) {
        const c = s.clone;
        c.classList.add("poof");
        setTimeout(() => c.remove(), 280);
      }
      await takeOutChild(group, child.id);
    } else if ("beforeId" in s && s.beforeId !== child.id) {
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

// Exit edit mode by clicking empty space or pressing Escape.
window.addEventListener("pointerdown", (e) => {
  if (editMode && !closestSel(e.target, ".tile, .edit-toolbar")) exitEdit();
  // Clicking anywhere outside the trash confirmation cancels it (never delete
  // on an ambiguous gesture).
  if (trashPop && !closestSel(e.target, ".trash-pop")) {
    closeTrashPop();
    pinnedReveal = false;
    scheduleHide();
  }
});

// ───────────────────────── Context menu ─────────────────────────

function confirmShortcutOut(item) {
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
  trashPop = pop;
  placePop(pop);
}

async function relocateShortcut(item, toDesktop) {
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
    trashPop = pop;
    placePop(pop);
    return false;
  }
}

function menuPinTitle(item) {
  if (!item) return "Booki";
  if (item.kind === "separator") return t("m.separator");
  if (item.kind === "trash") return t("trash.name");
  if (item.kind === "widget") return widgetLabel(item.widget);
  if (item.kind === "action" && item.name === "Booki") return t("m.settings");
  return item.name || baseName(item.path || "") || t("m.pin");
}

function menuKindLabel(item) {
  if (!item) return t("m.system");
  if (item.kind === "action") return t("m.settings");
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

function openMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  const generation = ++menuGeneration;
  addMenuHead(menuPinTitle(item), menuKindLabel(item));

  // Like the macOS dock: an app's open windows come first (the likeliest
  // reason to right-click a running app is to pick one of them), then what
  // you can do with it, then how it sits on the dock, then removal. Sections
  // are separated, not titled.
  const wins = item.kind === "app" || item.kind === "group" ? windowsFor(item) : [];
  if (wins.length) {
    for (const w of wins.slice(0, 6)) {
      add("app", w.title || menuPinTitle(item), () => dockApi.focusWindow(Number(w.hwnd)));
    }
    sep();
  }

  if (item.kind === "action") add("settings", t("m.open"), () => dockApi.openSettings());
  if (item.kind === "app") {
    if (wins.length) add("plus", t("m.newWindow"), () => dockApi.launch(item.path, item.args || []));
    else add("app", t("m.open"), () => dockApi.launch(item.path, item.args || []));
  } else if (item.kind === "folder" || item.kind === "group") {
    add("folder", t("m.open"), () => {
      // Always open (never toggle-close) — right-click → Open should reveal.
      const tileEl = dockEl.querySelector(`.tile[data-id="${item.id}"]`);
      if (tileEl) openStack(tileEl, item);
    });
  } else if (item.kind === "trash") {
    add("trash", t("m.open"), () => dockApi.launch("shell:RecycleBinFolder", []));
    add("trash", t("trash.empty"), () => confirmTrash([], true), "danger");
  }
  if (item.kind === "widget") { add("sliders", t("w.styleTitle"), () => dockApi.openSettingsTab("widgets")); if (["clock", "focus", "calendar", "weather"].includes(item.widget)) add("app", t("m.open"), () => openProductivity(item, dockEl.querySelector(`.tile[data-id="${item.id}"]`))); }
  if (item.kind === "folder") add("external", t("stack.openExplorer"), () => dockApi.launch(item.path, []));
  if (isTauri && item.kind === "app" && /\.lnk$/i.test(item.path || "")) {
    add("folder", t("shortcut.store"), () => relocateShortcut(item, false));
    add("external", t("shortcut.desktop"), () => relocateShortcut(item, true));
  }
  if (item.kind === "app" && item.path) add("folder", t("m.showInExplorer"), () => dockApi.openLocation(item.path));
  if (wins.length) {
    add("x", t(wins.length > 1 ? "m.closeAll" : "m.closeWindow"), async () => {
      for (const w of wins) await dockApi.closeWindow(Number(w.hwnd)).catch(() => {});
    });
  }

  // Files this app opened through Booki, then the system's recent files
  // (filled asynchronously so opening the menu stays instant).
  let recentsSlot = null;
  if (item.kind === "app") {
    if ((item.recents || []).length) {
      sep();
      item.recents.slice(0, 6).forEach((rp) => add("external", baseName(rp), () => dockApi.launch(item.path, [rp])));
    }
    recentsSlot = document.createElement("div");
    recentsSlot.className = "ctx-recents";
    ctxMenu.appendChild(recentsSlot);
  }

  if (item.kind !== "separator" && item.kind !== "trash") {
    sep();
    add("pencil", t("apps.rename"), () => promptRename(item));
    // A custom icon only makes sense for apps/folders (groups show a mini-grid,
    // widgets show their card).
    if (item.kind === "app" || item.kind === "folder") {
      add("palette", t("m.changeIcon"), () => changeIcon(item));
      if (item.icon) add("x", t("m.removeIcon"), () => clearIcon(item));
    }
    if (item.kind === "group") add("grid", t("group.ungroup"), () => ungroup(item));
  }
  sep();
  add("plus", t("add.open"), () => openAddPanel(dockEl));
  add("grid", t("m.addSep"), () => addSeparatorAfter(item.id));
  sep();
  add("settings", t("m.settings"), () => dockApi.openSettingsTab("dock"));
  sep();
  add(
    "trash",
    t("m.remove"),
    () => {
      if (item.kind === "group" && (item.children || []).length > 0) confirmRemoveGroup(item);
      else removeItem(item.id);
    },
    "danger"
  );

  placeMenu(e);
  if (recentsSlot) fillRecentFiles(recentsSlot, e, item, generation);
}

/** Two-step confirm before deleting a whole group (children would go with it). */
function confirmRemoveGroup(item) {
  pinnedReveal = true;
  const n = (item.children || []).length;
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  const name = esc(item.name || t("group.new"));
  pop.innerHTML =
    `${icon("trash")}<span class="tp-col"><span class="tp-text">${t("group.removeAsk").replace("{name}", name).replace("{n}", String(n))}</span>` +
    `<span class="tp-sub">${t("group.removeSub")}</span></span>`;
  const mkBtn = (cls, label, fn) => {
    const b = document.createElement("button");
    b.className = `tp-btn ${cls}`;
    b.textContent = label;
    b.addEventListener("click", fn);
    pop.appendChild(b);
  };
  mkBtn("danger", t("apps.remove"), async () => {
    closeTrashPop();
    await removeItem(item.id);
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

// Recent files for THIS app only (matched by file association in the backend)
// dropped into the pin's context menu. Runs after the menu is already on
// screen; re-places it once the items are in. Nothing relevant -> no section.
async function fillRecentFiles(slot, e, item, generation) {
  let recents = [];
  try {
    recents = await dockApi.recentFilesFor(item.path, 6);
  } catch (_) {
    return;
  }
  if (!recents?.length || !slot.isConnected || generation !== menuGeneration || ctxMenu.classList.contains("hidden")) return;
  const head = document.createElement("div");
  head.className = "menu-label";
  head.textContent = t("m.recent");
  slot.appendChild(head);
  recents.forEach((r) => {
    const b = document.createElement("button");
    b.innerHTML = `${icon("external")}<span>${esc(r.name)}</span>`;
    b.title = r.name;
    b.setAttribute("role", "menuitem");
    b.tabIndex = -1;
    b.addEventListener("click", async () => {
      closeMenu();
      await dockApi.launch(r.path, []);
    });
    slot.appendChild(b);
  });
  const s = document.createElement("div");
  s.className = "sep";
  slot.appendChild(s);
  placeMenu(e, false); // preserve keyboard selection while recents arrive
}

// Right-click on empty dock area / hint → add + profiles + settings.
function openBackgroundMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const generation = ++menuGeneration;
  ctxMenu.replaceChildren();
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  addMenuHead("Booki", t("m.dockMenu"));
  add("plus", t("add.open"), () => openAddPanel(dockEl));
  add("search", t("launcher.menu"), openLauncher);
  const profilesSlot = document.createElement("div");
  ctxMenu.append(profilesSlot);
  sep();
  add("grid", t("overhaul.editing"), enterEdit);
  add("settings", t("m.settings"), () => dockApi.openSettingsTab("dock"));
  for (const el of dockEl.querySelectorAll(".conditionally-hidden")) {
    const item = findWidgetPin(el.dataset.id);
    if (item) add("eye", widgetLabel(item.widget), async () => { item.style = { ...item.style, hideWhenUnavailable: false }; if (!(await persist())) return; await render(); reframe(); });
  }
  placeMenu(e);
  dockApi.profileList().then((profiles) => {
    if (!Array.isArray(profiles) || !profiles.length || generation !== menuGeneration || ctxMenu.classList.contains("hidden")) return;
    const actions = menuActions(profilesSlot, closeMenu);
    actions.sep();
    for (const name of profiles.slice(0, 6)) actions.add(name === cfg.lastProfile ? "check" : "sparkles", name, async () => {
      const fresh = await dockApi.profileApply(name);
      cfg = fresh; await ensureLang(cfg.language); maybeSyncCtxMenu(); applyAll(); await render(); reframe();
    });
    placeMenu(e, false);
  }).catch(() => {});
}

function openFileMenu(e, item, parent, openFolder) {
  e.preventDefault(); e.stopPropagation(); ++menuGeneration;
  ctxMenu.replaceChildren();
  addMenuHead(item.name, item.is_dir || item.kind === "folder" ? t("m.folder") : t("m.app"));
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  add("external", t("m.open"), () => { if (item.is_dir && openFolder) return openFolder(); if (item.kind === "action") return dockApi.openSettings(); return dockApi.launch(item.path, item.args || []); });
  if (item.path) {
    add("copy", t("stack.copyPath"), () => dockApi.copyText(item.path));
    add("folder", t("stack.showInExplorer"), () => dockApi.openLocation(item.path));
    if (!parent && !item.is_dir) add("app", t("stack.openWith"), () => dockApi.openWith(item.path));
  }
  if (parent) add("take-out", t("group.takeOut"), () => takeOutChild(parent, item.id));
  sep(); add("settings", t("m.settings"), () => dockApi.openSettingsTab("dock"));
  placeMenu(e);
}

let menuGeneration = 0;
let menuReturnFocus = null;
// The context menu lives beside the bar (like the folder flyout): the window is
// grown to fit it, so it can never be cut off by the dock window's bounds.
function placeMenu(e, focus = true) {
  if (focus) menuReturnFocus = document.activeElement;
  const cx = e.clientX;
  const cy = e.clientY;
  // Measure invisibly, grow the window FIRST, then reveal in its final spot —
  // one paint, no flicker from the window resizing under an already-visible menu.
  ctxMenu.classList.add("measuring");
  ctxMenu.classList.remove("hidden");
  document.body.classList.add("menu-open");
  applyFrame();
  const put = () => {
    const { left, top } = placeBesideBar({
      bar: dockEl.getBoundingClientRect(),
      box: { width: ctxMenu.offsetWidth, height: ctxMenu.offsetHeight },
      edge: cfg.edge,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      along: isVertical() ? cy : cx,
    });
    ctxMenu.style.left = `${left}px`;
    ctxMenu.style.top = `${top}px`;
    // Scale the menu out from the point that opened it (the cursor/tile), not
    // its own center — keeps the spatial link between trigger and content.
    const o = transformOrigin(ctxMenu.getBoundingClientRect(), cx, cy);
    ctxMenu.style.transformOrigin = `${o.x}px ${o.y}px`;
  };
  put();
  // The window resizes asynchronously after applyFrame(); reposition again the
  // moment it actually settles (via the resize hook) AND on a short fallback, so
  // the menu can never end up clipped by a window that grew a beat too late.
  pendingReplace = put;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      put();
      ctxMenu.classList.remove("measuring");
      if (focus && !ctxMenu.classList.contains("hidden")) menuItems(ctxMenu)[0]?.focus();
    });
  });
}
function closeMenu() {
  ++menuGeneration;
  if (ctxMenu.classList.contains("hidden")) return;
  ctxMenu.classList.add("hidden");
  document.body.classList.remove("menu-open");
  pendingReplace = null;
  if (ctxMenu.contains(document.activeElement)) menuReturnFocus?.focus?.();
  reframe();
}

// When the dock window finishes resizing (async, after applyFrame), re-place the
// overlay that's currently open so it can't be left clipped by a slow resize.
let pendingReplace = null;
// Right-click on the bar's empty space (tiles stopPropagation their own menu).
dockEl.addEventListener("contextmenu", openBackgroundMenu);
document.addEventListener("contextmenu", (e) => {
  if (isTextEditor(e.target)) return;
  e.preventDefault();
  if (closestSel(e.target, "#ctx-menu")) return;
  const item = closestSel(e.target, "#stack") && findPinnedById(stackItemId);
  if (item) openMenu(e, item); else openBackgroundMenu(e);
});
ctxMenu.addEventListener("keydown", (e) => {
  if (moveMenuFocus(e, ctxMenu)) e.stopPropagation();
  if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); closeMenu(); }
});
window.addEventListener("click", closeMenu);
window.addEventListener("blur", () => {
  closeMenu();
  closeStack();
  // Focus moved to another app → release a pinned reveal so the dock can tuck
  // back into the notch instead of lingering on top of whatever the user opened.
  if (pinnedReveal) {
    pinnedReveal = false;
    scheduleHide();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Escape while renaming a group: revert handled on the input; don't close
    // the whole flyout if the rename field still has focus.
    if (document.activeElement && document.activeElement.classList.contains("stack-rename")) {
      return;
    }
    closeMenu();
    exitEdit();
    closeStack();
    cancelDrag();
    closeTrashPop();
    closeProductivityPanel();
  }
});

async function changeIcon(item) {
  const path = await pickImageFile();
  if (!path) return;
  const uri = (await dockApi.imageDataUri(path)) || path;
  item.icon = uri;
  iconCache.delete(item.path);
  if (!(await persist())) return;
  await render();
}
async function clearIcon(item) {
  item.icon = null;
  iconCache.delete(item.path);
  if (!(await persist())) return;
  await render();
}
async function addSeparatorAfter(id) {
  const i = cfg.pinned.findIndex((a) => a.id === id);
  const at = i < 0 ? cfg.pinned.length : i + 1;
  cfg.pinned.splice(at, 0, { id: uid(), name: "", path: "", args: [], kind: "separator" });
  if (!(await persist())) return;
  await render();
  reframe();
}
async function removeItem(id) {
  const index = cfg.pinned.findIndex((a) => a.id === id);
  const removed = index >= 0 ? cfg.pinned[index] : null;
  if (!removed) return;
  // Play a quick fade+scale-out on the tile before the re-render swaps it away.
  const el = dockEl.querySelector(`.tile[data-id="${id}"]`);
  if (el && !reduceMotion()) {
    el.classList.add("tile-out");
    await new Promise((r) => setTimeout(r, 170));
  }
  cfg.pinned = cfg.pinned.filter((a) => a.id !== id);
  if (!(await persist())) return;
  await render();
  reframe();
  showUndoToast(removed, index);
}

// ─────────────────── Window frame (magnify headroom) ───────────────────

// Widgets change size when their data arrives (music title, network rates…) —
// watch the bar's real layout size and re-fit the window whenever it moves, so
// nothing ever gets cut off at the window edge.
if (typeof ResizeObserver !== "undefined") {
  let lastRoW = 0;
  let lastRoH = 0;
  new ResizeObserver(() => {
    placeUpdatePill();
    placeUndoToast();
    const w = dockEl.offsetWidth;
    const h = dockEl.offsetHeight;
    // Ignore 1–3px widget text jitter — only reframe when the bar really grew.
    if (Math.abs(w - lastRoW) < 3 && Math.abs(h - lastRoH) < 3) return;
    lastRoW = w;
    lastRoH = h;
    reframe();
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
const PANEL_ROOM = 420;

let lastFull = null;
function edgePadCss() {
  return Math.min(SHADOW_PAD, Math.max(0, Math.min(96, cfg.edgeGap ?? 12)));
}
function computeFrame() {
  const dpr = window.devicePixelRatio || 1;
  // The STAGE: full length along the anchored edge; bar depth + panel headroom
  // across it. It only changes when the bar's depth changes (icon size, labels,
  // compact) or the screen does — never when something opens or closes.
  // Use offsetWidth/Height (layout size) — NOT getBoundingClientRect — so a dock
  // that's currently scaled by the minimize animation doesn't size the window too
  // small (which left the bar looking cut off after revealing, esp. at the top).
  const edgePad = edgePadCss();
  let wCss, hCss;
  if (isVertical()) {
    wCss = dockEl.offsetWidth + edgePad + PANEL_ROOM;
    hCss = availH(isTauri);
  } else {
    wCss = availW(isTauri);
    hCss = dockEl.offsetHeight + edgePad + PANEL_ROOM;
  }
  wCss = Math.min(wCss, availW(isTauri));
  hCss = Math.min(hCss, availH(isTauri));
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

/** Bar-only size for smart-hide occlusion (no PANEL_ROOM flyout headroom). */
function computeHomeFrame() {
  const dpr = window.devicePixelRatio || 1;
  const edgePad = edgePadCss();
  let wCss, hCss;
  if (isVertical()) {
    wCss = dockEl.offsetWidth + edgePad;
    hCss = availH(isTauri);
  } else {
    wCss = availW(isTauri);
    hCss = dockEl.offsetHeight + edgePad;
  }
  wCss = Math.min(wCss, availW(isTauri));
  hCss = Math.min(hCss, availH(isTauri));
  return { w: Math.ceil(wCss * dpr), h: Math.ceil(hCss * dpr) };
}

let lastFrameEdge = null;
function applyFrame() {
  const full = computeFrame();
  const home = computeHomeFrame();
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
  // Stage stays large for flyouts; home rect is bar-sized for smart-hide.
  dockApi.setDockFrame(cfg.edge, full.w, full.h, false, home.w, home.h);
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
let desktopActive = false;
let occluded = false; // last occlusion signal from the backend (smart mode)
let pinnedReveal = false; // user CLICKED the notch → keep the dock open to use it
let fullscreen = false; // dock suppressed for a fullscreen blackout (not raw FS signal)
let draggingFile = false; // an OS file drag is over the dock → keep it open
let manualHide = false; // user swiped the bar away → hover must not bring it back
let blackoutTimer = null;
let occRevealTimer = null; // debounce for the smart-mode auto-reveal
let hiddenBeforeFullscreen = false;
const SMART_REVEAL_DELAY = 1100;

// Fullscreen game/movie/presentation → get completely out of the way: flash a
// brief toast, then hide BOTH the bar and the notch. Restore when it ends.
const FS_TOAST_HOLD_MS = 1500;
const FS_TOAST_FADE_MS = 260;

function hideInFullscreenEnabled() {
  return cfg.hideInFullscreen !== false;
}

function clearFsTimers() {
  clearTimeout(blackoutTimer);
  blackoutTimer = null;
  clearTimeout(occRevealTimer);
  occRevealTimer = null;
  clearTimeout(hideTimer);
  hideTimer = null;
}

function onFullscreenSignal(value) {
  clearFsTimers();
  if (value) {
    // Already blacked out — ignore repeat signals.
    if (fullscreen) return;
    // Opt-out: stay visible. Do NOT set `fullscreen` or pinOpen/tryTuck break.
    if (!hideInFullscreenEnabled()) return;
    fullscreen = true;
    hiddenBeforeFullscreen = hiddenState;
    pinnedReveal = false;
    hiddenState = true;
    stopPolls(); // fullscreen game/movie → go fully idle
    document.body.classList.add("tucked");
    // Already tucked into the notch → skip the toast chip; blackout quietly.
    if (hiddenBeforeFullscreen) {
      blackoutTimer = setTimeout(() => {
        if (fullscreen) dockApi.hideAll();
      }, 320);
      return;
    }
    // Calm two-line status on the notch, then fade into full blackout.
    dockApi.notchToast(t("fs.hiddenTitle"), t("fs.hiddenSub"));
    blackoutTimer = setTimeout(() => {
      if (!fullscreen) return;
      dockApi.notchToastDismiss().catch(() => {});
      blackoutTimer = setTimeout(() => {
        if (fullscreen) dockApi.hideAll();
      }, FS_TOAST_FADE_MS);
    }, FS_TOAST_HOLD_MS);
  } else {
    // Never entered a blackout (hide was off) — nothing to restore.
    if (!fullscreen) return;
    fullscreen = false;
    const wasTucked = hiddenBeforeFullscreen;
    hiddenBeforeFullscreen = false;
    document.body.classList.remove("tucked");
    // clear_fullscreen_blackout must finish before hide/reveal or Rust no-ops.
    void (async () => {
      await dockApi.clearFullscreenBlackout().catch(() => {});
      await dockApi.notchToastDismiss().catch(() => {});
      // Restore the pre-FS visibility for every hide mode, not only smart+click.
      // setupAutoHide() starts edge visible — that would pop a tucked dock open.
      if (wasTucked && !(hideMode() === "smart" && desktopActive && !manualHide)) {
        hiddenState = true;
        stopPolls();
        document.body.classList.add("tucked");
        await dockApi.hideDock(cfg.edge).catch(() => {});
      } else if (hideMode() === "off") {
        hiddenState = false;
        startPolls();
        document.body.classList.add("revealing");
        await dockApi.revealDock().catch(() => {});
        applyFrame();
        setTimeout(() => document.body.classList.remove("revealing"), 380);
      } else {
        hiddenState = false;
        setupAutoHide();
      }
    })();
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
    }, 190); // match genie (~170ms) + a frame
  } else {
    // Show the dock window (and hide the notch), make sure it's sized to the full
    // bar, then slide the bar back in. Force the stage fully interactive during
    // the reveal animation so early clicks aren't lost to stale hit rects.
    document.body.classList.add("revealing");
    dockApi.revealDock();
    applyFrame();
    setTimeout(() => {
      if (!hiddenState) document.body.classList.remove("tucked");
    }, 40);
    setTimeout(() => {
      document.body.classList.remove("revealing");
      reportHitRects();
    }, 380);
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

// Snapshot of everything the visibility policy needs. Built in ONE place so
// every caller below decides from the same inputs — the old code had each of
// reveal(), tryTuck() and onOcclusionSignal() testing a different subset of the
// flags in a different order, which is how a fix for one case kept breaking
// another.
function visibilityState() {
  return {
    mode: hideMode(),
    trigger: cfg.notchTrigger || "click",
    fullscreen,
    previewing,
    occluded,
    desktop: desktopActive,
    manualHide,
    summoned: pinnedReveal,
    draggingFile,
    pointerInside,
  };
}

// Would the current mode want the dock hidden right now (ignoring the user's
// ongoing interaction)?
function wantsHideNow() {
  return wantsHidden(visibilityState());
}

// Anything mid-use that a hide would yank out from under the user.
// Note: pinnedReveal alone is NOT enough — occlusion must still be able to
// tuck a notch-summoned dock once the user is working in another app.
function interacting() {
  return (
    pointerInside || dragging || draggingFile || stackOpen ||
    !!edgeMove || document.body.classList.contains("menu-open") ||
    !!document.querySelector(".trash-pop, .note-editor, .coach, .productivity-panel")
  );
}

// Hide if the user isn't mid-something; otherwise wait — the pointer-out
// handler re-checks when they actually leave.
function tryTuck() {
  if (fullscreen || previewing || !wantsHideNow()) return;
  if (interacting()) return; // deferred: pointer-out / gesture-end re-checks
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
// Open panels that must stay clickable. Tooltips are not listed: they never
// take input, and counting them blocked clicks on whatever sat under them.
const HIT_PANELS =
  ".productivity-panel, .edit-toolbar, .trash-pop, .coach, .note-editor, .undo-toast:not(.hidden), #ctx-menu:not(.hidden), .update-pill:not(.hidden)";

function pointInLiveHitArea(x, y) {
  if (edgeMove || dragging || draggingFile) return true;
  const rects = [
    rectFromElement(dockEl, DOCK_HIT_PAD),
    ...[...dockEl.querySelectorAll(".tile")].map((el) => rectFromElement(el, TILE_HIT_PAD)),
    stackOpen ? rectFromElement(stackEl, PANEL_HIT_PAD) : null,
    ...[...document.querySelectorAll(
      HIT_PANELS
    )].map((el) => rectFromElement(el, PANEL_HIT_PAD)),
  ];
  return rects.some((rect) => pointInRect(x, y, rect));
}
// Real blur behind the bar and whatever panel is open over the desktop.
const MATERIAL_PANELS = "#ctx-menu:not(.hidden), .trash-pop, .coach, .update-pill:not(.hidden)";
function reportDockMaterial() {
  const body = document.body.classList;
  if (hiddenState || body.contains("tucked") || body.contains("edge-swap") || body.contains("booting")) {
    reportMaterial([]);
    return;
  }
  reportMaterial([
    shapeOf(dockEl),
    stackOpen ? shapeOf(stackEl) : null,
    ...[...document.querySelectorAll(MATERIAL_PANELS)].map((el) => shapeOf(el)),
  ]);
}
// Surfaces move under CSS transitions (reveal, tuck, a flyout opening) that
// fire no mutations mid-flight; follow them frame by frame for their length.
const materialObserver = new MutationObserver(() => followFrames(reportDockMaterial));
materialObserver.observe(document.body, { attributes: true, attributeFilter: ["class"], childList: true });
materialObserver.observe(dockEl, { attributes: true, attributeFilter: ["class", "style"] });

// Refresh on motion boundaries too: a transition can outlast the default
// follow window, and native geometry must resume only after it settles.
for (const event of ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"]) {
  document.body.addEventListener(event, (e) => {
    if (e.target.matches?.(`.dock, .stack, ${MATERIAL_PANELS}`)) followFrames(reportDockMaterial);
  });
}


matchMedia("(prefers-reduced-transparency: reduce)").addEventListener("change", () => {
  if (!cfg) return;
  applyAll();
  reportDockMaterial();
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!cfg) return;
  setMaterialTint(materialTint(cfg));
  reportDockMaterial();
});

function reportHitRects() {
  reportDockMaterial();
  if (!dockApi.setHitRects) return;
  // Anything of ours in flight (tile drag, edge-move, edit wobble, an OS file
  // drag over the dock) → the whole stage stays interactive; never yank the
  // window out from under a gesture.
  // During reveal (and a short grace after it) the whole stage must stay
  // interactive so the cursor watcher doesn't flip the window click-through
  // before the frontend has reported fresh hit rects.
  const all = !!(
    edgeMove || dragging || draggingFile || document.body.classList.contains("edit") ||
    document.body.classList.contains("revealing") ||
    document.querySelector(".drag-clone, .stack-drag-clone")
  );
  // While the wave is live the region is the fixed magnify envelope. Measuring
  // transformed tiles here instead produced a different signature than the
  // envelope, so any unrelated mutation made the two ping-pong IPC calls.
  if (!all && !stackOpen && dockEl.classList.contains("mag-live") && !document.querySelector(HIT_PANELS)) {
    reportHitRectsLive();
    return;
  }
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
  // Inflate toward the dock so the pointer doesn't fall through the gap.
  if (stackOpen) add(stackEl, Math.max(PANEL_HIT_PAD, 8));
  for (const el of document.querySelectorAll(
    HIT_PANELS
  ))
    add(el, PANEL_HIT_PAD);
  const sig = hitSignature(rects, all);
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
// Magnify writes transform/z-index every pointer frame — layout slots stay put,
// so ignore style-only mutations on tiles while mag-live is on.
new MutationObserver((mutations) => {
  if (dockEl.classList.contains("mag-live")) {
    const meaningful = mutations.some((m) => {
      if (m.type === "childList") return true;
      const t = m.target;
      const onTile = !!(t && t.classList && t.classList.contains("tile"));
      // A tile's own class/style churn during the wave is the magnify effect
      // itself — the transform, the z-index, and the .focus ring hopping from
      // tile to tile. Reporting on it made this observer race the magnify rAF:
      // each recomputed a different region, so neither one's dedupe held and
      // the dock emitted hit rects twice per frame. magnify() already schedules
      // its own report. Anything NOT on a tile (body edit mode, an opening
      // flyout) still counts.
      if (onTile && (m.attributeName === "class" || m.attributeName === "style")) return false;
      if (m.attributeName === "class" || m.attributeName === "style") return true;
      return false;
    });
    if (!meaningful) return;
  }
  scheduleHitReport();
}).observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["class", "style"],
});
window.addEventListener("resize", scheduleHitReport);
window.addEventListener("resize", placeUndoToast);
setInterval(() => {
  if (!hiddenState) reportHitRects();
}, 5000);

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
  // Fullscreen blackout owns visibility — don't reveal/hide underneath it
  // (config reload / preview end during a game would flash Booki over it).
  if (fullscreen) return;
  clearTimeout(hideTimer);
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
  if ((cfg.notchTrigger || "click") === "click") return; // hover trigger only
  // "The pointer just arrived — with that, does the policy want the bar out?"
  // The chain of early-outs this replaced (fullscreen, manual swipe, mode off,
  // occluded-and-not-summoned) is now one lookup that cannot drift from the
  // other two decision points.
  if (decideVisible({ ...visibilityState(), pointerInside: true }) !== true) return;
  clearTimeout(hideTimer);
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
function onDesktopSignal(value) {
  desktopActive = value;
  if (value) occluded = false;
  // Win+D can hide a native window without changing our JS visibility.
  if (value && !hiddenState && decideVisible(visibilityState()) === true) {
    dockApi.revealDock().catch(() => {});
  }
  onOcclusionSignal(occluded);
}

function onOcclusionSignal(value) {
  occluded = value;
  // Going back to work in an app releases a manual swipe-hide: next time the
  // desktop is clear, normal smart behavior resumes.
  if (value) manualHide = false;
  // These own visibility while they last; occlusion doesn't get a vote.
  if (previewing || fullscreen || draggingFile) return;
  if (hideMode() !== "smart") return;

  const want = decideVisible(visibilityState());
  if (want === null) {
    // Click trigger: the desktop cleared, but a tucked dock waits to be asked.
    clearTimeout(occRevealTimer);
    return;
  }
  if (want) {
    // Back on the desktop → come out, but only once it has STAYED clear for a
    // beat. Switching or moving windows opens transient gaps over the dock's
    // spot, and revealing on those made it pop out "by itself" mid alt-tab.
    clearTimeout(occRevealTimer);
    occRevealTimer = setTimeout(() => {
      if (decideVisible(visibilityState()) !== true) return;
      pinnedReveal = false;
      setHidden(false);
    }, SMART_REVEAL_DELAY);
    return;
  }
  clearTimeout(occRevealTimer); // covered again → drop any pending reveal
  // The policy says hide, but the gate still applies: never yank the bar out
  // from under someone using it. The pointer-out handler re-checks.
  if (pointerInside || interacting()) return;
  pinnedReveal = false;
  setHidden(true);
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

// Soft reveal from notch hover: show the dock without stealing focus or pinning
// it open — it can tuck again once the pointer leaves / smart-hide decides.
// Only act when JS still thinks we're tucked; otherwise reveal_dock's emit
// (also used by setHidden / setupAutoHide) would clear pending hide timers.
function softOpen() {
  if (fullscreen || !hiddenState) return;
  manualHide = false;
  clearTimeout(hideTimer);
  setHidden(false);
  // Soft reveal is not a pin — if smart-hide still wants us gone, arm the grace
  // hide so we don't sit over the app forever (occlusion won't re-fire if true).
  if (wantsHideNow() && !pointerInside) scheduleHide();
}
onSoftReveal(softOpen);

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

// While files are dragged over the dock, a small label says what letting go
// will do — open with, move to, add to, trash, or pin — so a drop is never a
// guess.
const dropHintEl = document.createElement("div");
dropHintEl.className = "drop-hint";
dropHintEl.setAttribute("role", "status");
document.body.appendChild(dropHintEl);
function dropHintText(spot) {
  const item = spot.target && cfg.pinned.find((p) => p.id === spot.target.dataset.id);
  const name = item ? menuPinTitle(item) : "";
  if (item?.kind === "app") return t("drop.openWith").replace("{name}", name);
  if (item?.kind === "folder") return t("drop.moveTo").replace("{name}", name);
  if (item?.kind === "group") return t("drop.addTo").replace("{name}", name);
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
function placeHint(text, anchor) {
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
    left = cfg.edge === "left" ? bar.right + gap : bar.left - w - gap;
  } else {
    left = a.left + a.width / 2 - w / 2;
    top = cfg.edge === "top" ? bar.bottom + gap : bar.top - h - gap;
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

// ─────────────────────── Booki tooltips ───────────────────────
const dockTooltip = createDockTooltip(dockEl, {
  edge: () => cfg.edge,
  blocked: () => editMode || !!dragging || hiddenState || stackOpen || !ctxMenu.classList.contains("hidden"),
  describe: (el) => {
    const pin = cfg.pinned.find(item => item.id === el.dataset.id);
    if (!pin) return null;
    let name = pin.name || el.getAttribute("aria-label");
    let detail = t("hint.launch");
    if (pin.kind === "group") detail = t((pin.children || []).length === 1 ? "hint.groupSingle" : "hint.group").replace("{n}", (pin.children || []).length);
    else if (pin.kind === "folder") detail = t("hint.folder");
    else if (pin.kind === "widget") { name = widgetLabel(pin.widget); detail = t("hint.widget"); }
    else if (pin.kind === "action") { name = el.getAttribute("aria-label"); detail = t("hint.settings"); }
    else if (pin.kind === "trash") detail = t("hint.trash");
    else if (el.dataset.running === "true") {
      const count = windowsFor(pin).length;
      detail = cfg.focusIfRunning === false ? t("hint.running") : count > 1 ? t("hint.pickWindow").replace("{n}", String(count)) : t("hint.switch");
    }
    return { name, detail };
  },
});
function hideTip() { dockTooltip.hide(); }

// ─────────────────────── Trash confirmation ───────────────────────
// A small in-dock popover: nothing is ever deleted without an explicit yes.
// Files go to the Recycle Bin (undoable), never a permanent delete.

let trashPop = null;
// Dismiss a popover along the same path it entered (fade + slight drop), then
// run `done`. Under reduced motion the removal is immediate.
function dismissPop(pop, done) {
  const finish = () => {
    pop.remove();
    if (done) done();
  };
  if (!pop || !pop.isConnected) {
    if (pop) pop.remove();
    if (done) done();
    return;
  }
  if (reduceMotion()) return finish();
  pop.classList.add("closing");
  setTimeout(finish, 180);
}
function closeTrashPop() {
  const pop = trashPop;
  trashPop = null;
  dismissPop(pop, () => {
    // Shrink the window only after the exit finishes, or it would clip it.
    if (!trashPop) {
      document.body.classList.remove("pop-open");
      reframe();
    }
  });
}

// Place a dock popover (trash confirm / first-run tips) NEXT TO the bar — never
// on top of it — and grow the window so nothing gets clipped.
function placePop(pop) {
  pop.classList.add("measuring");
  document.body.appendChild(pop);
  document.body.classList.add("pop-open");
  applyFrame(); // grow the window before anything is visible
  const put = () => {
    // Centre on the BAR, not the window: a slot-aligned dock sits off-centre.
    pop.style.left = pop.style.right = pop.style.top = pop.style.bottom = "";
    pop.style.transform = "";
    const { left, top } = placeBesideBar({
      bar: dockEl.getBoundingClientRect(),
      box: { width: pop.offsetWidth, height: pop.offsetHeight },
      edge: cfg.edge,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      gap: 12,
    });
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  };
  put();
  // Reveal only after the window has grown and the popover sits in place.
  setTimeout(() => {
    requestAnimationFrame(() => {
      put();
      pop.classList.remove("measuring");
    });
  }, 70);
  // The coach swaps its content per step WITHOUT re-calling placePop; since the
  // popover is now hard-positioned (no translate centering), re-run put() on
  // any size change so every step stays centered on the bar and in-viewport.
  if (typeof ResizeObserver !== "undefined") {
    // Disconnect once the popover leaves the document. An observer left
    // watching a detached node keeps it (and its whole subtree) alive, and the
    // dock opens one of these for every trash prompt and coach step.
    const ro = new ResizeObserver(() => {
      if (pop.isConnected) put();
      else ro.disconnect();
    });
    ro.observe(pop);
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
      logMessage("error", `trash: ${err}`);
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
      logMessage("error", `move: ${err}`);
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
      showDropHint(spot);
    },
    onLeave: () => {
      draggingFile = false;
      pinnedReveal = false;
      dropOverlay.classList.remove("active");
      setDropTarget(null);
      setDropGap(null);
      showDropHint(null);
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
      showDropHint(null);
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

// ─────────────────── Running-app indicators ───────────────────

// Windows from the last poll, so a context menu can list an app's windows
// without waiting on another enumeration.
let lastWindows = [];

/** The open windows that belong to a pin (a group collects its children's). */
function windowsFor(pin, wins = lastWindows) {
  if (!pin || pin.kind === "separator" || pin.kind === "trash" || pin.kind === "widget") return [];
  if (pin.kind === "group") {
    const seen = new Set();
    const out = [];
    for (const child of pin.children || []) {
      for (const w of windowsFor(child, wins)) {
        if (seen.has(w.hwnd)) continue;
        seen.add(w.hwnd);
        out.push(w);
      }
    }
    return out;
  }
  // Prefer matching by the owning process's executable (reliable, exact);
  // fall back to a title contains-name match for .lnk/shell pins.
  const path = (pin.path || "").toLowerCase();
  const exeBase = path.endsWith(".exe") ? path.split(/[\\/]/).pop() : "";
  const name = (pin.name || "").toLowerCase();
  let matches = exeBase ? wins.filter((w) => ((w.exe || "").split(/[\\/]/).pop() || "") === exeBase) : [];
  if (!matches.length && name) matches = wins.filter((w) => w.title.toLowerCase().includes(name));
  return matches;
}

let pollTimer = null;
function startRunningPoll() {
  if (!isTauri) return;
  clearInterval(pollTimer); // never stack two running-app polls
  pollTimer = null;
  const tick = singleFlight(async (refreshTrash = true) => {
    // Don't poll while tucked into the notch — saves CPU/IPC when idle.
    if (hiddenState) return;
    // Cheap, no-IPC guard that repositions the dock if the screen changed.
    checkScreenChange();
    // Keep the trash badge in sync with deletions made outside Booki.
    if (refreshTrash && dockEl.querySelector(".tile.trash")) refreshTrashState();
    // Running state powers switching and hints independently of visible dots.
    // Nothing that could be "running" is pinned (only widgets/trash/separators) →
    // skip enumerating every window (which now also resolves each process's exe).
    if (!cfg.pinned.some((p) => p.kind === "app" || p.kind === "folder" || p.kind === "group")) {
      return;
    }
    try {
      const wins = await dockApi.listWindows();
      lastWindows = wins;
      const matchWins = (pin) => windowsFor(pin, wins);
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => {
        const app = cfg.pinned.find((a) => a.id === t.dataset.id);
        if (!app || app.kind === "separator" || app.kind === "trash" || app.kind === "action") return;
        const matches = matchWins(app);
        const badge = t.querySelector(".badge");
        if (matches.length) {
          t.dataset.running = "true";
          t.dataset.hwnd = String(matches[0].hwnd);
          t.classList.remove("launching");
          if (badge) badge.textContent = matches.length > 1 ? String(matches.length) : "";
        } else {
          t.dataset.running = "false";
          delete t.dataset.hwnd;
          if (badge) badge.textContent = "";
        }
      });
      // Mirror running state onto open group flyout cells.
      if (stackOpen && stackItemId) {
        const grp = cfg.pinned.find((p) => p.id === stackItemId);
        if (grp && grp.kind === "group") {
          stackEl.querySelectorAll(".stack-item[data-child-id]").forEach((cell) => {
            const child = (grp.children || []).find((c) => c.id === cell.dataset.childId);
            const matches = matchWins(child);
            cell.dataset.running = matches.length ? "true" : "false";
          });
        }
      }
    } catch (_) {
      /* ignore */
    }
  });
  appPollTick = tick;
  tick();
  pollTimer = setInterval(tick, recoveryInterval(nativeSupport, "windows", 5000));
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
      // Without pointercancel (touch, capture loss, the window hiding under the
      // cursor) this listener stayed attached to window forever, one per
      // cancelled drag. wireStackDragOut already handles it.
      window.removeEventListener("pointercancel", cleanup);
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
    window.addEventListener("pointercancel", cleanup);
  });
}

let stackItemId = null;

/** Open a stack; switching to another group/folder replaces the current one. */
async function toggleStack(tileEl, item) {
  if (stackOpen && stackItemId === item.id) {
    closeStack();
    return;
  }
  if (stackOpen) closeStack();
  await openStack(tileEl, item);
}

async function openStack(tileEl, item) {
  if (stackOpen && stackItemId === item.id) return;
  if (stackOpen) closeStack();
  const isGroup = item.kind === "group";
  const folderNavigation = createFolderNavigation({ path: item.path, name: item.name });
  let navigateFolder = null;
  let folderTitle = null;
  let backButton = null;
  let breadcrumbs = null;
  const renderBreadcrumbs = () => {
    if (!breadcrumbs) return;
    breadcrumbs.replaceChildren();
    const trail = folderNavigation.trail;
    trail.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.name || entry.path;
      button.title = entry.path;
      if (index === trail.length - 1) button.setAttribute("aria-current", "location");
      else button.addEventListener("click", () => navigateFolder?.(folderNavigation.goTo(index), false));
      breadcrumbs.appendChild(button);
    });
    breadcrumbs.lastElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const seq = ++stackSeq;
  stackItemId = item.id;
  stackEl.innerHTML = "";
  stackEl.setAttribute("aria-label", item.name || t("group.new"));
  const head = document.createElement("div");
  head.className = "stack-head";
  const glyph = document.createElement("span");
  glyph.className = "stack-head-icon";
  glyph.innerHTML = icon("folder");
  head.appendChild(glyph);
  if (isGroup) {
    const look = groupAppearance(item);
    if (look.glyph) glyph.innerHTML = libGlyphSVG(look.glyph);
    stackEl.style.setProperty("--group-color", look.color || "");
    stackEl.classList.toggle("tinted", !!look.color);
  } else {
    stackEl.style.removeProperty("--group-color");
    stackEl.classList.remove("tinted");
  }
  if (isGroup) {
    const prevName = item.name || t("group.new");
    const input = document.createElement("input");
    input.className = "stack-rename";
    input.value = item.name || "";
    input.placeholder = t("group.new");
    input.addEventListener("input", () => renameGroup(item, input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        renameGroup(item, input.value, { commit: true });
        input.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        input.value = prevName;
        renameGroup(item, prevName, { commit: true });
        input.blur();
      }
    });
    input.addEventListener("blur", () => renameGroup(item, input.value, { commit: true }));
    head.appendChild(input);
  } else {
    const name = document.createElement("span");
    name.className = "stack-title";
    name.textContent = item.name;
    folderTitle = name;
    backButton = document.createElement("button");
    backButton.className = "stack-close stack-back";
    backButton.title = t("next.backFolder");
    backButton.setAttribute("aria-label", t("next.backFolder"));
    backButton.innerHTML = icon("take-out");
    backButton.disabled = true;
    backButton.addEventListener("click", () => navigateFolder?.(folderNavigation.back(), false));
    head.appendChild(backButton);
    head.appendChild(name);
  }
  if (!isGroup) {
    // The flyout shows a slice of the folder — Explorer is the "see everything
    // / do more" escape hatch, one click away.
    const openDir = document.createElement("button");
    openDir.className = "stack-close stack-opendir";
    openDir.title = t("stack.openExplorer");
    openDir.setAttribute("aria-label", t("stack.openExplorer"));
    openDir.innerHTML = icon("external");
    openDir.addEventListener("click", () => {
      dockApi.launch(folderNavigation.current.path, []);
      closeStack();
    });
    head.appendChild(openDir);
  }
  const close = document.createElement("button");
  close.className = "stack-close";
  close.title = t("stack.close");
  close.setAttribute("aria-label", t("stack.close"));
  close.innerHTML = icon("x");
  close.addEventListener("click", closeStack);
  head.appendChild(close);
  stackEl.appendChild(head);
  if (!isGroup) {
    breadcrumbs = document.createElement("nav");
    breadcrumbs.className = "stack-breadcrumbs";
    breadcrumbs.setAttribute("aria-label", t("m.folder"));
    stackEl.appendChild(breadcrumbs);
    renderBreadcrumbs();
  }
  const grid = document.createElement("div");
  grid.className = "stack-grid";
  const fillGrid = (items) => {
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = `<div class="stack-empty">${t(isGroup ? "stack.emptyGroup" : "stack.empty")}</div>`;
    }
    let cellIdx = 0;
    for (const it of items) {
      // A grouped widget renders as its LIVE read-out (only here, inside the open
      // group — never on the bar). It spans the row so the card gets full width.
      if (isGroup && it.kind === "widget") {
        const wCell = document.createElement("div");
        wCell.className = "stack-item stack-widget";
        wCell.style.setProperty("--i", Math.min(cellIdx++, 6));
        wCell.appendChild(widgetTile(it, { inFlyout: true }));
        wireStackDragOut(wCell, item, it);
        const out = document.createElement("span");
        out.className = "stack-rm";
        out.innerHTML = icon("take-out");
        out.title = t("group.takeOut");
        out.addEventListener("click", (ev) => { ev.stopPropagation(); takeOutChild(item, it.id); });
        wCell.appendChild(out);
        grid.appendChild(wCell);
        continue;
      }
      const cell = document.createElement("button");
      cell.className = "stack-item";
      if (isGroup && it.id) cell.dataset.childId = it.id;
      cell.style.setProperty("--i", Math.min(cellIdx++, 6)); // staggered entry (capped)
      cell.title = it.name;
      cell.addEventListener("contextmenu", (e) => openFileMenu(e, it, isGroup ? item : null, () => navigateFolder?.({ path: it.path, name: it.name })));
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
        if (!isGroup && it.is_dir) { navigateFolder?.({ path: it.path, name: it.name }); return; }
        if (it.kind === "action") dockApi.openSettings();
        else if (it.path) dockApi.launch(it.path, it.args || []);
        closeStack();
      });
      if (isGroup) {
        // Drag a child OUT of the flyout to unpin it (parity with the dock's
        // pull-out-to-remove gesture); hover control pops it back onto the dock.
        wireStackDragOut(cell, item, it);
        const out = document.createElement("span");
        out.className = "stack-rm";
        out.innerHTML = icon("take-out");
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
    // Quick add cells — app and folder — so filling a group is one tap each.
    if (isGroup) {
      const mkAdd = (label, kind) => {
        const addCell = document.createElement("button");
        addCell.className = "stack-item stack-add";
        addCell.title = label;
        const glyph = kind === "folder" ? icon("folder") : "＋";
        addCell.innerHTML =
          `<span class="stack-glyph">${glyph}</span><span class="stack-name">${esc(label)}</span>`;
        addCell.addEventListener("click", (ev) => {
          ev.stopPropagation();
          addToFolderFromDock(item, kind);
        });
        grid.appendChild(addCell);
      };
      mkAdd(t("apps.addToFolder"), "app");
      mkAdd(t("m.addFolder"), "folder");
    } else if (items.length >= 80) {
      // Legacy listing clients may still hand back a capped slice.
      const more = document.createElement("button");
      more.className = "stack-more";
      more.textContent = t("stack.more");
      more.addEventListener("click", () => {
        dockApi.launch(folderNavigation.current.path, []);
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
      c.style.setProperty("--i", Math.min(i, 6));
      c.innerHTML = `<span class="stack-glyph skel"></span><span class="stack-name skel"></span>`;
      grid.appendChild(c);
    }
    let page = 0;
    let request = 0;
    const pageSize = 24;
    let queryTimer = null;
    const toolbar = document.createElement("div"); toolbar.className = "stack-folder-tools";
    const search = document.createElement("input"); search.type = "search"; search.maxLength = 256;
    search.className = "stack-folder-search"; search.placeholder = t("integral.searchFolder"); search.setAttribute("aria-label", t("integral.searchFolder"));
    const order = document.createElement("select"); order.className = "stack-folder-sort"; order.setAttribute("aria-label", t("integral.sortFolder"));
    for (const [value,key] of [["name","integral.sortName"],["name-desc","integral.sortNameDescending"],["modified","integral.sortModified"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = t(key); order.appendChild(option);
    }
    const refresh = document.createElement("button"); refresh.className = "stack-close"; refresh.innerHTML = icon("refresh"); refresh.setAttribute("aria-label",t("apps.refresh")); refresh.title = t("apps.refresh");
    toolbar.append(search,order,refresh); stackEl.appendChild(toolbar);
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); search.focus(); search.select(); }
    };
    stackEl.addEventListener("keydown",shortcut);
    stackDispose = () => { clearTimeout(queryTimer); request++; stackEl.removeEventListener("keydown",shortcut); };
    const pager = document.createElement("div");
    pager.className = "stack-pager";
    const loadPage = async (nextPage) => {
      if (seq !== stackSeq || !stackOpen) return;
      const current = ++request;
      grid.setAttribute("aria-busy","true");
      const previousFocus = pager.contains(document.activeElement) ? document.activeElement?.dataset.pageAction : null;
      const buttonStates = [...pager.querySelectorAll("button")].map((b) => [b, b.dataset.logicalDisabled === "true"]);
      buttonStates.forEach(([b]) => { b.disabled = true; });
      try {
        const rows = await dockApi.listDir(folderNavigation.current.path, nextPage * pageSize, pageSize + 1, search.value.trim(), order.value);
        if (seq !== stackSeq || !stackOpen || current !== request) return;
        page = nextPage;
        fillGrid((rows || []).slice(0, pageSize));
        if (!rows?.length && search.value.trim()) grid.querySelector(".stack-empty").textContent = t("integral.noFolderMatches");
        pager.replaceChildren();
        const button = (key, next, disabled) => {
          const b = document.createElement("button");
          b.className = "stack-more";
          b.textContent = t(key);
          b.disabled = disabled; b.dataset.logicalDisabled = String(disabled); b.dataset.pageAction = key;
          b.addEventListener("click", () => loadPage(next));
          pager.appendChild(b);
        };
        button("stack.previous", page - 1, page === 0);
        const label = document.createElement("span");
        label.textContent = t("stack.page").replace("{n}", String(page + 1));
        label.setAttribute("aria-live", "polite");
        pager.appendChild(label);
        button("stack.next", page + 1, !rows || rows.length <= pageSize);
        grid.appendChild(pager);
        if (previousFocus) {
          const target = [...pager.querySelectorAll("button")].find(button => button.dataset.pageAction === previousFocus && !button.disabled) || pager.querySelector("button:not(:disabled)");
          target?.focus({preventScroll:true});
        }
        grid.parentElement.scrollTop = 0;
        applyFrame();
        if (pendingReplace) requestAnimationFrame(pendingReplace);
      } catch (_) {
        if (seq !== stackSeq || !stackOpen || current !== request) return;
        buttonStates.forEach(([b, disabled]) => { b.disabled = disabled; });
        const retainPage = pager.isConnected;
        if (!retainPage) grid.replaceChildren();
        grid.querySelector('.stack-load-error')?.remove();
        const failure = document.createElement("div");
        failure.className = "stack-load-error";
        const message = document.createElement("p");
        message.className = "stack-empty";
        message.setAttribute("role", "alert");
        message.textContent = t("overhaul.failed");
        const retry = document.createElement("button");
        retry.className = "stack-more";
        retry.textContent = t("apps.refresh");
        retry.addEventListener("click", () => loadPage(nextPage));
        failure.append(message, retry);
        grid.prepend(failure);
        applyFrame();
      } finally {
        if (current === request && seq === stackSeq && stackOpen) grid.setAttribute("aria-busy","false");
      }
    };
    search.addEventListener("input", () => { request++; clearTimeout(queryTimer); queryTimer = setTimeout(() => loadPage(0),150); });
    search.addEventListener("keydown", event => {
      if (event.key === "Escape" && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ""; clearTimeout(queryTimer); loadPage(0); }
    });
    order.addEventListener("change", () => { clearTimeout(queryTimer); loadPage(0); });
    refresh.addEventListener("click", () => { clearTimeout(queryTimer); loadPage(0); });
    navigateFolder = (entry, push = true) => {
      if (!entry) return;
      clearTimeout(queryTimer); search.value = "";
      if (push) folderNavigation.enter(entry);
      folderTitle.textContent = folderNavigation.current.name;
      folderTitle.title = folderNavigation.current.path;
      backButton.disabled = !folderNavigation.canGoBack;
      renderBreadcrumbs();
      grid.replaceChildren();
      const loading = document.createElement("p");
      loading.className = "stack-empty";
      loading.setAttribute("role", "status");
      loading.textContent = t("overhaul.loading");
      grid.appendChild(loading);
      loadPage(0);
    };
    queueMicrotask(() => loadPage(0));
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
    requestAnimationFrame(() => {
      stackEl.classList.add("open", "just-opened");
      clearTimeout(stackEl._justOpenedTimer);
      stackEl._justOpenedTimer = setTimeout(() => stackEl.classList.remove("just-opened"), 220);
    });

  });
}

// Anchor #stack to a tile's real POSITION (not its size — that ignores the
// anchored-side padding and sits the flyout ON TOP of the bar's first row).
// Shared by the folder/group flyout and the clipboard-history flyout below.
function placeStackNear(tileEl) {
  const bar = dockEl.getBoundingClientRect();
  const anchor = tileEl.getBoundingClientRect();
  const gap = 6;
  const pad = 8;
  const edge = cfg.edge || "bottom";
  const availableHeight = isVertical() ? window.innerHeight - pad * 2
    : edge === "top" ? window.innerHeight - bar.bottom - gap - pad : bar.top - gap - pad;
  const availableWidth = !isVertical() ? window.innerWidth - pad * 2
    : edge === "left" ? window.innerWidth - bar.right - gap - pad : bar.left - gap - pad;
  // Leave the header/close action visible and scroll the contents. On a
  // small stage the old fixed-height panel started above the viewport.
  stackEl.style.maxHeight = `${Math.max(1, Math.min(window.innerHeight - pad * 2, Math.max(160, availableHeight)))}px`;
  stackEl.style.maxWidth = `${Math.max(1, Math.min(window.innerWidth - pad * 2, Math.max(240, availableWidth)))}px`;
  const box = { width: stackEl.offsetWidth, height: stackEl.offsetHeight };
  const { left, top } = placeBesideBar({
    bar, box, edge, viewport: { width: window.innerWidth, height: window.innerHeight },
    along: isVertical() ? anchor.top + anchor.height / 2 : anchor.left + anchor.width / 2,
    gap, pad,
  });
  stackEl.style.right = stackEl.style.bottom = "";
  stackEl.style.left = `${left}px`;
  stackEl.style.top = `${top}px`;
  const origin = transformOrigin({ left, top, ...box }, anchor.left + anchor.width / 2, anchor.top + anchor.height / 2);
  stackEl.style.transformOrigin = `${origin.x}px ${origin.y}px`;
}

// The add panel shares the flyout with folders and the clipboard, so it gets
// the same placement, hit regions and open/close motion.
function flattenPinned(items) {
  return (items || []).flatMap((it) => [it, ...flattenPinned(it.children)]);
}
function openAddPanel(anchorEl = dockEl, tab = "apps") {
  if (stackOpen) closeStack();
  stackItemId = "__add";
  stackEl.classList.add("add-mode");
  stackEl.setAttribute("aria-label", t("add.title"));
  const place = () => placeStackNear(anchorEl?.isConnected ? anchorEl : dockEl);
  const panel = buildAddPanel(stackEl, {
    t,
    tab,
    pinned: () => flattenPinned(cfg.pinned),
    listWindows: () => dockApi.listWindows(),
    listInstalled: () => dockApi.listInstalledApps(),
    listFrequent: () => cfg.usageRecommendationsEnabled === false ? Promise.resolve([]) : dockApi.frequentApps(50).then((apps) => apps.filter((a) => !(cfg.ignoredAppSuggestions || []).includes(a.path.replaceAll("\\", "/").toLowerCase()))),
    identities: (paths) => dockApi.appIdentities(paths),
    appIcon: (path) => dockApi.appIcon(path),
    invalidateIcons: () => dockApi.invalidateIcons(),
    widgetLabel,
    widgetPresent,
    addPath: async (path) => { if (!(await addPaths([path], undefined, null, { showError: false }))) throw new Error("app save failed"); },
    addWidget: async (type) => { if (!(await addWidget(type, { showError: false }))) throw new Error("widget save failed"); },
    browseFile: () => { closeStack(); onAddApp(); },
    browseFolder: () => { closeStack(); onAddFolder(); },
    close: closeStack,
    relayout: () => requestAnimationFrame(place),
  });
  stackDispose = panel.dispose;
  stackRefreshPins = panel.refreshPins;
  stackOpen = true;
  document.body.classList.add("stack-open");
  applyFrame();
  pendingReplace = place;
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(() => {
      stackEl.classList.add("open", "just-opened");
      clearTimeout(stackEl._justOpenedTimer);
      stackEl._justOpenedTimer = setTimeout(() => stackEl.classList.remove("just-opened"), 220);
      panel.focus();
    });
  });
}

/** The quick launcher (global shortcut, or "Search apps" in the dock menu):
   type to open an app, a pinned folder or switch to an open window. */
function openLauncher() {
  if (stackOpen && stackItemId === "__launcher") { closeStack(); return; }
  if (stackOpen) closeStack();
  closeMenu();
  stackItemId = "__launcher";
  stackEl.classList.add("add-mode", "launcher-mode");
  stackEl.setAttribute("aria-label", t("launcher.title"));
  const place = () => placeStackNear(dockEl);
  const panel = buildLauncher(stackEl, {
    t,
    pinned: () => cfg.pinned,
    switchesToOpen: cfg.focusIfRunning !== false,
    listWindows: () => dockApi.listWindows(),
    listInstalled: () => dockApi.listInstalledApps(),
    listFrequent: () => cfg.usageRecommendationsEnabled === false ? Promise.resolve([]) : dockApi.frequentApps(12),
    appIcon: (path) => dockApi.appIcon(path),
    open: (entry) => {
      closeStack();
      pinnedReveal = false;
      scheduleHide();
      if (entry.kind === "window" || (entry.hwnd && cfg.focusIfRunning !== false)) dockApi.focusWindow(Number(entry.hwnd));
      else dockApi.launch(entry.path, entry.args || []);
    },
    close: closeStack,
    relayout: () => requestAnimationFrame(place),
  });
  stackDispose = panel.dispose;
  stackOpen = true;
  document.body.classList.add("stack-open");
  applyFrame();
  pendingReplace = place;
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(() => {
      stackEl.classList.add("open", "just-opened");
      clearTimeout(stackEl._justOpenedTimer);
      stackEl._justOpenedTimer = setTimeout(() => stackEl.classList.remove("just-opened"), 220);
      panel.focus();
    });
  });
}

let stackCloseTimer = null;
let stackDispose = null;
let stackRefreshPins = null;
function closeStack() {
  if (!stackOpen) return;
  stackOpen = false;
  stackDispose?.();
  stackDispose = null;
  stackRefreshPins = null;
  stackItemId = null;
  pendingReplace = null;
  document.body.classList.remove("stack-open");
  stackEl.classList.remove("open", "just-opened", "add-mode", "launcher-mode");
  cacheWidgetEls();
  startPolls();
  clearTimeout(stackCloseTimer);
  stackCloseTimer = setTimeout(reframe, 180);
  // After closing, allow smart-hide to re-evaluate (flyout was blocking tuck).
  scheduleHide();
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
  stackEl.setAttribute("aria-label", t("w.clipboard"));
  const head = document.createElement("div");
  head.className = "stack-head";
  const glyph = document.createElement("span");
  glyph.className = "stack-head-icon";
  glyph.innerHTML = icon("clipboard");
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
    requestAnimationFrame(() => {
      stackEl.classList.add("open", "just-opened");
      clearTimeout(stackEl._justOpenedTimer);
      stackEl._justOpenedTimer = setTimeout(() => stackEl.classList.remove("just-opened"), 220);
    });
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
    row.tabIndex = 0;
    row.style.setProperty("--i", Math.min(i, 6));
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
    act("star", entry.favorite ? t("clip.unfavorite") : t("clip.favorite"), async () => {
      await dockApi.clipboardFavorite(entry.id, !entry.favorite);
      await renderClipboardList(grid, foot);
    });
    act(entry.private ? "lock" : "eye-off", entry.private ? t("clip.makePersistent") : t("clip.private"), async () => {
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

// Add an app or folder into a group from its open flyout, then reopen it so
// you can keep adding several in a row.
async function addToFolderFromDock(group, preferKind = "app") {
  const path = preferKind === "folder" ? await pickFolder() : await pickAppFile();
  if (!path) return;
  const gi = cfg.pinned.findIndex((p) => p.id === group.id);
  if (gi < 0) return;
  const kind =
    preferKind === "folder"
      ? "folder"
      : await kindForPath(path, (p) => dockApi.isDir(p));
  cfg.pinned[gi].children = [
    ...(cfg.pinned[gi].children || []),
    { id: uid(), name: baseName(path), path, args: [], kind },
  ];
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
  const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
  const it = cfg.pinned.find((p) => p.id === group.id);
  if (el && it) openStack(el, it);
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
  pill.style.left = pill.style.right = pill.style.top = pill.style.bottom = "";
  const { left, top } = placeBesideBar({
    bar: dockEl.getBoundingClientRect(),
    box: { width: pill.offsetWidth, height: pill.offsetHeight },
    edge: cfg.edge || "bottom",
    viewport: { width: window.innerWidth, height: window.innerHeight },
    gap: 8,
  });
  pill.style.left = `${left}px`;
  pill.style.top = `${top}px`;
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
