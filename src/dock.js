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
  logMessage,
  isTauri,
} from "./api.js";
import { createDockTooltip, setTileLabel } from "./dock/tooltip.js";
import { buildProductivityPanel } from "./dock/productivity-panel.js";
import { createDraftSaver } from "./dock/draft-saver.js";
import { observeSystem } from "./dock/system-observer.js";
import { widgetWidth } from "./dock/layout-model.js";
import { icon } from "./icons.js";
import { emo } from "./emoji.js";
import { isLibIcon, resolveLibIcon, libGlyphSVG } from "./icon-library.js";
import { applyEdge } from "./theme.js";
import { paintedLook } from "./system-look.js";
import { t, ensureLang } from "./i18n.js";
import {
  WIDGET_ICONS,
  WIDGET_GLYPHS,
  WIDGET_VARIANTS,
  PREVIEW_WIDGETS,
  RING_DEFAULTS,
  WIDGET_META,
  canonicalWidget,
} from "./widgets-meta.js";
import { reduceMotion } from "./dock/motion.js";
import { placeBesideBar, transformOrigin } from "./dock/placement.js";
import {
  MEDIA_SVG,
  widgetCardHTML,
  setPreviewSubText,
  refreshPreviewMarquees,
  LIVE_WIDGETS,
} from "./dock/widget-view.js";
import { groupAppearance } from "./group-style.js";
import { pinFallback } from "./pin-fallback.js";
import { canMergeKind, kindForPath, mergePins, placePin, takeOutOfGroup } from "./pins.js";
import { createFolderNavigation } from "./dock/folder-navigation.js";
import { menuActions, moveMenuFocus, isTextEditor } from "./dock/context-menu.js";
import { buildAddPanel } from "./dock/add-panel.js";
import { buildLauncher } from "./dock/launcher.js";
import { materialTint, setMaterialTint, followFrames } from "./material.js";
import { S } from "./dock/state.js";
import {
  iconCache,
  uid,
  isVertical,
  baseSize,
  findPinnedById,
  widgetLabel,
  findWidgetPin,
  syncIcon,
  resolveIcon,
  baseName,
  menuPinTitle,
} from "./dock/helpers.js";
import { dockEl, dockKeys, ctxMenu, dropOverlay, closestSel, esc, stackEl } from "./dock/dom.js";
import {
  pointInLiveHitArea,
  MATERIAL_PANELS,
  reportDockMaterial,
  reportHitRects,
  scheduleHitReport,
} from "./dock/hit-regions.js";
import {
  setAllSizes,
  resetMagnify,
  invalidateMag,
  magnify,
  magPointer,
  edgeAutoScroll,
  stopEdgeScroll,
} from "./dock/magnify.js";
import { fitDock, reframe, applyFrame, checkScreenChange } from "./dock/frame.js";
import {
  cacheWidgetEls,
  eachWidget,
  tickClocks,
  tickProductivity,
  queueVolumeSet,
  adjustVolumeFromWheel,
  widgetPresent,
  onDisplayPower,
  onEnergySaver,
  syncPolls,
  refreshMedia,
  refreshVolume,
  wireLiveWidgets,
} from "./dock/live-widgets.js";
import {
  onFullscreenSignal,
  setHidden,
  wantsHideNow,
  setupAutoHide,
  reveal,
  scheduleHide,
  onDesktopSignal,
  onOcclusionSignal,
  pinOpen,
  softOpen,
} from "./dock/autohide.js";
import { addMenuHead, placeMenu, closeMenu } from "./dock/menu-core.js";
import {
  windowsFor,
  setAttention,
  clearAttention,
  startRunningPoll,
  wireRunningWindows,
} from "./dock/running-windows.js";
import { placeUndoToast, showUndoToast, wireUndoToast } from "./dock/undo-toast.js";
import {
  popButton,
  showConfirmPop,
  dismissPop,
  closeTrashPop,
  placePop,
  confirmTrash,
  confirmMove,
  wirePopovers,
} from "./dock/popovers.js";
import {
  maybeSyncCtxMenu,
  checkAutoProfile,
  reloadConfig,
  applyAll,
  persist,
  wireConfigSync,
} from "./dock/config-sync.js";
import { toggleClipboardStack, wireClipboardStack } from "./dock/clipboard-stack.js";
import { placeUpdatePill, checkUpdates } from "./dock/updates.js";

// Surface any runtime error to the app log (diagnostics on the user's machine).
window.addEventListener("error", (e) => logMessage("error", `dock: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  logMessage("error", `dock: unhandled ${e.reason}`)
);

// Kill native HTML5 drag inside the dock window. Icon tiles are <img> elements,
// which the browser lets you drag out as an image — dropping one on the desktop
// made Windows save a stray .png. All our dragging is pointer-event based, and
// incoming file drops from Explorer use Tauri's own channel (not webview
// dragstart), so suppressing this is purely the fix with no downside.
window.addEventListener("dragstart", (e) => e.preventDefault());

// ───────────────────────────── Boot ─────────────────────────────

// Set once the listeners below are registered, so the boot retry after a
// failure later in boot() never registers them a second time.
let booted = false;
async function boot() {
  try {
    S.cfg = await configApi.get();
    await ensureLang(S.cfg.language); // load pt/fr/de before the first paint
    applyAll();
    await render(); // render() starts widget polls when visible
    reframe();
    if (booted) return;
    booted = true;
    setupAutoHide();
    setupFileDrop();
    // Remove booting class to trigger the slide-in animation.
    document.body.classList.remove("booting");
    document.body.classList.add("boot-animate");
    setTimeout(() => document.body.classList.remove("boot-animate"), 500);
    onConfigChanged(() => reloadConfig().catch((error) => logMessage("error", `dock reload failed: ${error}`)));
    checkAutoProfile();
    observeSystem(dockApi, { media: refreshMedia, volume: refreshVolume, windows: () => { if (!S.hiddenState) S.appPollTick?.(false); } }, (support) => {
      const windowsChanged = !!S.nativeSupport.windows !== !!support.windows;
      S.nativeSupport = support;
      if (windowsChanged && !S.hiddenState) startRunningPoll();
    });
    // Display power, Energy Saver and taskbar attention (Windows only; the
    // listeners are inert elsewhere). Resume implies the display is on, so a
    // missed display-on can never leave the polls stopped.
    dockApi.onSystemChange("display-off", () => onDisplayPower(false));
    dockApi.onSystemChange("display-on", () => onDisplayPower(true));
    dockApi.onSystemChange("resume", () => onDisplayPower(true));
    dockApi.onSystemChange("energy-saver", (event) => onEnergySaver(!!event?.payload));
    dockApi.onSystemChange("attention", (event) => setAttention(event?.payload));
    if (isTauri) {
      dockApi.powerStatus().then((s) => { if (s) { onEnergySaver(!!s.energySaver); onDisplayPower(s.displayOn !== false); } }).catch(() => {});
      dockApi.attentionWindows().then(setAttention).catch(() => {});
    }
    onOcclusion(onOcclusionSignal);
    onDesktop(onDesktopSignal);
    onFullscreen(onFullscreenSignal);
    // Tray / global hotkey: tuck or summon through the same hide/reveal path
    // the notch uses so JS hiddenState stays in sync with the native windows.
    onToggleDock(() => {
      if (S.fullscreen) return;
      if (S.hiddenState) pinOpen();
      else setHidden(true);
    });
    // Quick launcher shortcut: summon the dock if tucked, then open the search.
    onLauncher(() => {
      if (S.fullscreen) return;
      if (S.hiddenState) pinOpen();
      openLauncher();
    });
    // Position hotkeys (modifier+1…9): launch the Nth item on the bar.
    onLaunchIndex((i) => {
      const items = S.cfg.pinned.filter((p) => p.kind !== "separator");
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
      if (!S.cfg.onboarded) maybeOnboard();
      else checkChangelog();
    }, 800);
    logMessage("info", `dock booted ok (pinned=${S.cfg.pinned.length})`);
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

let autoProfileResize = null;
window.addEventListener("resize", () => {
  if (!S.cfg?.profileRules?.enabled) return;
  clearTimeout(autoProfileResize);
  autoProfileResize = setTimeout(checkAutoProfile, 1500);
});

// ──────────────────────────── Render ────────────────────────────

// Remember which ids were on the bar last render, so only genuinely NEW tiles
// animate in (not every tile on an unrelated re-render).
let lastRenderIds = new Set();
let renderGeneration = 0;

async function render() {
  const generation = ++renderGeneration;
  const snapshot = S.cfg;
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
  if (generation !== renderGeneration || S.cfg !== snapshot) return;
  // Fade+scale in only the tiles that weren't on the bar before.
  const prevIds = lastRenderIds;
  for (const el of tiles) {
    const id = el.dataset && el.dataset.id;
    if (id && !prevIds.has(id)) el.classList.add("tile-in");
  }
  dockEl.replaceChildren(...tiles);
  lastRenderIds = new Set(S.cfg.pinned.map((p) => p.id));
  cacheWidgetEls();
  requestAnimationFrame(refreshPreviewMarquees);

  // Empty state opens the same searchable app/widget panel as the dock menu.
  if (!S.cfg.pinned.some((p) => p.kind !== "separator")) {
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
  dockKeys.sync();

  fitDock();
  // Repaint widget values right away so a freshly built card never lingers on
  // its "…" placeholder (e.g. after adding a widget or any structural re-render).
  // syncPolls() paints at once and restarts timers only if the live widget
  // kinds changed; it self-guards while the dock is tucked away.
  if (!S.hiddenState) syncPolls();
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

function widgetTile(item, { inFlyout = false } = {}) {
  const type = canonicalWidget(item.widget || "clock") || "clock";
  const st = item.style || {};
  const el = document.createElement("button");
  el.className = "tile widget" + (inFlyout ? " in-flyout" : "");
  el.dataset.id = item.id;
  el.dataset.widget = type;
  el.dataset.span = String(st.span || "auto");
  el.style.setProperty("--widget-width", `${widgetWidth(type, baseSize(), S.cfg.spacing ?? 6, st)}px`);
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

function closeProductivityPanel() {
  S.productivityPanel?.dispose?.();
  S.productivityPanel?.remove(); S.productivityPanel = null; S.pinnedReveal = false; reframe(); scheduleHide();
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
  S.productivityPanel = panel; document.body.appendChild(panel); S.pinnedReveal = true; applyFrame();
  const place = () => {
    if (!panel.isConnected) return;
    const pos = placeBesideBar({ bar: tile.getBoundingClientRect(), box: { width: panel.offsetWidth, height: panel.offsetHeight }, edge: S.cfg.edge, viewport: { width: innerWidth, height: innerHeight } });
    panel.style.left = `${pos.left}px`; panel.style.top = `${pos.top}px`; scheduleHitReport();
  };
  const dispose = panel.dispose;
  const observer = new ResizeObserver(() => { if (!panel.isConnected) { observer.disconnect(); return; } applyFrame(); requestAnimationFrame(place); }); observer.observe(panel);
  panel.dispose = () => { dispose?.(); observer.disconnect(); };
  requestAnimationFrame(() => { place(); panel.querySelector(item.widget === "weather" ? "input" : "button")?.focus(); });
}

async function addWidget(type, { showError = true } = {}) {
  S.cfg.pinned.push({ id: uid(), name: widgetLabel(type), path: "", args: [], kind: "widget", widget: type });
  if (!(await persist({}, { showError }))) return false;
  await render();
  reframe();
  return true;
}

// Notes use a serialized autosave and keep their draft visible on failure.
let noteEditor = null;
async function closeNoteEditor() {
  const editor = noteEditor;
  if (!editor) return true;
  if (!(await editor.flush())) return false;
  if (noteEditor !== editor) return true;
  editor.dispose(); editor.remove(); noteEditor = null;
  S.pinnedReveal = false; reframe(); scheduleHide();
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
  const close = document.createElement("button"); close.type = "button"; close.className = "stack-close"; close.innerHTML = icon("x"); close.title = t("stack.close"); close.setAttribute("aria-label", t("stack.close"));
  close.addEventListener("click", closeNoteEditor); head.append(title, close);
  const ta = document.createElement("textarea"); ta.className = "note-input";
  ta.value = item.style?.note || ""; ta.placeholder = t("w.notesEmpty"); ta.setAttribute("aria-label", t("w.notes")); ta.maxLength = 20000;
  const footer = document.createElement("div"); footer.className = "note-save-state";
  const status = document.createElement("span"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.textContent = t("status.saved");
  const retry = document.createElement("button"); retry.type = "button"; retry.className = "productivity-button"; retry.textContent = t("focus.retry"); retry.hidden = true;
  let recoveryPending = true;
  let retryLoad = null;
  // Each save writes the whole config, so it waits for a ~1 s pause in typing
  // (the last argument). Closing the editor flushes whatever is still pending.
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
  }, (state) => { status.textContent = t(state === "error" ? "status.saveError" : `status.${state}`); retry.hidden = state !== "error"; }, 1000);
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
  document.body.appendChild(panel); noteEditor = panel; S.pinnedReveal = true; applyFrame();
  loadRecovery();
  const place = () => {
    if (!panel.isConnected) return;
    const { left, top } = placeBesideBar({ bar: tile.getBoundingClientRect(), box: { width: panel.offsetWidth, height: panel.offsetHeight }, edge: S.cfg.edge, viewport: { width: innerWidth, height: innerHeight }, pad: 6 });
    panel.style.left = `${left}px`; panel.style.top = `${top}px`; scheduleHitReport();
  };
  const observer = new ResizeObserver(() => { applyFrame(); requestAnimationFrame(place); }); observer.observe(panel);
  panel.dispose = () => { saver.cancelTimer(); observer.disconnect(); };
  requestAnimationFrame(() => { place(); if (ta.disabled) panel.focus(); else ta.focus(); });
}

// ─────────────────────────── Launch ───────────────────────────

/** Taskbar modifiers on a click: Shift opens a new instance, Ctrl+Shift runs
   the app as administrator. */
function launchModifiers(e) {
  const shift = !!e?.shiftKey, ctrl = !!(e?.ctrlKey || e?.metaKey);
  return { admin: shift && ctrl, newInstance: shift && !ctrl };
}

function launch(el, item, mods = {}) {
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
  clearAttention(el, item); // the user answered whichever window was waiting
  if (mods.admin && item.kind === "app" && item.path) {
    S.pinnedReveal = false;
    scheduleHide();
    markLaunching(el);
    dockApi.launch(item.path, item.args || [], "runas");
    return;
  }
  const hwnd = el.dataset.hwnd;
  const switching = !mods.newInstance && S.cfg.focusIfRunning !== false && el.dataset.running === "true" && hwnd;
  const wins = switching ? windowsFor(item) : [];
  // A tucked-away dock (Alt+N while hidden) can't show a picker: go to the first.
  if (wins.length > 1 && !S.hiddenState) { openWindowPicker(el, item, wins); return; }
  // Launching/switching means the user is done with the dock for now — release
  // any pinned reveal so smart-hide can tuck it back into the notch.
  S.pinnedReveal = false;
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
  ++S.menuGeneration;
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

// Show the changelog the first time the app opens after an update.
async function checkChangelog() {
  try {
    // Don't open Settings "What's new" during first-run tips.
    if (!S.cfg.onboarded) return;
    const v = await dockApi.appVersion();
    if (v && S.cfg.seenVersion !== v) {
      // Patch releases are fixes: record them without opening Settings.
      const feature = (version) => String(version || "").split(".").slice(0, 2).join(".");
      const announce = feature(S.cfg.seenVersion) !== feature(v);
      S.cfg.seenVersion = v;
      if (!(await persist())) return;
      if (announce) dockApi.openChangelog();
    }
  } catch (_) {}
}

// First-run tips: three small coach bubbles, shown once ever.
async function maybeOnboard() {
  if (S.cfg.onboarded) return;
  const steps = [
    { emoji: emo("pointer", 22), text: t("ob.step1") },
    { emoji: emo("card", 22), text: t("ob.step2") },
    { emoji: emo("beaver", 22), text: t("ob.step3") },
  ];
  let i = 0;
  S.pinnedReveal = true; // keep the dock open during the tour
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
        S.cfg.onboarded = true;
        S.cfg.settingsIntroSeen = true;
        await persist();
        S.pinnedReveal = false;
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

// Middle-click works like the taskbar: an app opens a new instance and a
// folder opens a new Explorer window. Ctrl+middle-click opens the location.
dockEl.addEventListener("auxclick", (e) => {
  if (e.button !== 1) return;
  const tile = closestSel(e.target, ".tile");
  if (!tile || !tile.dataset.id) return;
  const item = S.cfg.pinned.find((p) => p.id === tile.dataset.id);
  if (!item || !item.path || (item.kind !== "app" && item.kind !== "folder")) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) dockApi.openLocation(item.path);
  else if (item.kind === "app") launch(tile, item, { newInstance: true });
  else dockApi.launch(item.path, []);
});

// Drag the empty bar to MOVE the dock to another edge — with a live preview so
// you SEE where it will land instead of it teleporting: the window grows to
// cover the screen, four anchor targets light up, and a ghost bar slides to
// whichever edge is nearest the cursor. Release commits; Esc cancels. Nearest-
// edge (not dominant-direction) makes the anchors forgiving, not rigid.
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
  if (!S.edgeMove || !S.edgeMove.ready) return;
  const { W, H } = S.edgeMove;
  const target = edgeMoveTarget(x, y, W, H);
  S.edgeMove.target = target;
  edgeOverlay.querySelectorAll(".edge-zone").forEach((z) =>
    z.classList.toggle("active", z.dataset.edge === target));
  const g = edgeOverlay.querySelector(".edge-ghost");
  const vert = target === "left" || target === "right";
  const len = Math.min(S.edgeMove.barLen, (vert ? H : W) * 0.7);
  const thick = S.edgeMove.barThick;
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
  S.edgeMove.barLen = Math.round(vert ? r.height : r.width) || 320;
  S.edgeMove.barThick = Math.round(vert ? r.width : r.height) || 54;
  buildEdgeOverlay();
  document.body.classList.add("edge-moving");
  let css = null;
  try { css = await dockApi.dockCoverWorkarea(); } catch (_) {}
  if (!S.edgeMove) return; // released/cancelled while the resize was in flight
  S.edgeMove.W = (css && css[0]) || window.innerWidth;
  S.edgeMove.H = (css && css[1]) || window.innerHeight;
  edgeOverlay.classList.remove("hidden");
  S.edgeMove.ready = true;
  updateEdgePreview(S.edgeMove.lastX, S.edgeMove.lastY);
}

async function endEdgeMove(commit) {
  const mv = S.edgeMove;
  S.edgeMove = null;
  if (edgeOverlay) edgeOverlay.classList.add("hidden");
  document.body.classList.remove("edge-moving");
  if (!mv || !mv.active) return; // never grew the window → nothing to restore
  // The OS window was grown to cover the screen, but lastFull still holds the
  // bar-sized frame — so applyFrame() would no-op and leave the window huge.
  // Force it to re-issue the real frame.
  S.lastFull = null;
  const target = mv.target;
  if (commit && target && target !== S.cfg.edge) {
    // Land on the new edge with a pop so the move reads as motion, not a jump.
    S.cfg.edge = target;
    applyEdge(S.cfg);
    dockKeys.sync();
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
  S.edgeMove = {
    x: e.screenX, y: e.screenY, active: false, ready: false,
    lastX: e.clientX, lastY: e.clientY, target: S.cfg.edge,
  };
  try { dockEl.setPointerCapture(e.pointerId); } catch (_) {}
});
window.addEventListener("pointermove", (e) => {
  if (!S.edgeMove) return;
  S.edgeMove.lastX = e.clientX;
  S.edgeMove.lastY = e.clientY;
  if (!S.edgeMove.active) {
    const dx = e.screenX - S.edgeMove.x;
    const dy = e.screenY - S.edgeMove.y;
    if (Math.hypot(dx, dy) < 20) return; // small threshold → forgiving, not rigid
    S.edgeMove.active = true;
    enterEdgeMove();
    return;
  }
  updateEdgePreview(e.clientX, e.clientY);
});
window.addEventListener("pointerup", () => { if (S.edgeMove) endEdgeMove(true).catch(() => {}); });
window.addEventListener("pointercancel", () => { if (S.edgeMove) endEdgeMove(false).catch(() => {}); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.edgeMove) endEdgeMove(false).catch(() => {});
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

dockEl.addEventListener("pointermove", (e) => {
  // Always keep the freshest pointer position; coalesce to one magnify per frame
  // so it runs exactly at the display's refresh (crisp at 60/120/144Hz alike).
  magPointer.x = e.clientX;
  magPointer.y = e.clientY;
  if (S.edgeMove) return; // moving the whole dock to another edge — no magnify
  if (document.body.classList.contains("dock-overflow")) { edgeAutoScroll(); return; }
  if (magnifyRaf) return;
  magnifyRaf = requestAnimationFrame(() => {
    magnifyRaf = 0;
    magnify(magPointer.x, magPointer.y);
  });
});
dockEl.addEventListener("pointerleave", () => { resetMagnify(); stopEdgeScroll(); });

// ─────────── Edit mode (iOS-style long-press) + reorder ───────────

function enterEdit() {
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
function exitEdit() {
  if (!S.editMode) return;
  S.editMode = false;
  document.body.classList.remove("edit");
  document.querySelector(".edit-toolbar")?.remove();
  S.pinnedReveal = false; reframe();
}

function onPointerDown(e, el, item) {
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
function mergeTargetAt(sibs, x, y) {
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
async function cancelDrag() {
  if (!S.press && !S.dragging) return;
  window.removeEventListener("pointermove", onPressMove);
  cancelAnimationFrame(pressMoveRaf);
  pressMoveRaf = 0;
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
    if (S.editMode) exitEdit();
    else launch(tile, item, launchModifiers(e));
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
  const next = mergePins(S.cfg.pinned, draggedId, targetId, t("group.new"));
  if (next === S.cfg.pinned) return;
  S.cfg.pinned = next;
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
function renameGroup(group, name, opts) {
  renamePinnedItem(group, name, opts);
}
/** Inline rename popover from the dock context menu (apps, folders, groups…). */
function promptRename(item) {
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

// Dissolve a folder: spill its children back to the dock at its position.
async function ungroup(group) {
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
async function takeOutChild(group, childId) {
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
  if (!(await persist())) return;
  closeStack();
  await render();
  reframe();
  const el = dockEl.querySelector(`.tile[data-id="${group.id}"]`);
  const it = S.cfg.pinned.find((p) => p.id === group.id);
  if (el && it) await openStack(el, it);
  S.pinnedReveal = false;
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
function takeOutButton(group, child) {
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
    markOutTarget(null);
    if (s.out) {
      if (s.clone) {
        const c = s.clone;
        c.classList.add("poof");
        setTimeout(() => c.remove(), 280);
      }
      if (s.slot) await moveChildTo(group, child, s.slot);
      else await takeOutChild(group, child.id);
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

// Exit edit mode by clicking empty space or pressing Escape.
window.addEventListener("pointerdown", (e) => {
  if (S.editMode && !closestSel(e.target, ".tile, .edit-toolbar")) exitEdit();
  // Clicking anywhere outside the trash confirmation cancels it (never delete
  // on an ambiguous gesture).
  if (S.trashPop && !closestSel(e.target, ".trash-pop")) {
    closeTrashPop();
    S.pinnedReveal = false;
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
  S.trashPop = pop;
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
    S.trashPop = pop;
    placePop(pop);
    return false;
  }
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

function openMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu.innerHTML = "";
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  const generation = ++S.menuGeneration;
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
    if (isTauri && item.path) add("shield", t("m.runAsAdmin"), () => dockApi.launch(item.path, item.args || [], "runas"));
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
  if (!recents?.length || !slot.isConnected || generation !== S.menuGeneration || ctxMenu.classList.contains("hidden")) return;
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
  const generation = ++S.menuGeneration;
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
    if (!Array.isArray(profiles) || !profiles.length || generation !== S.menuGeneration || ctxMenu.classList.contains("hidden")) return;
    const actions = menuActions(profilesSlot, closeMenu);
    actions.sep();
    for (const name of profiles.slice(0, 6)) actions.add(name === S.cfg.lastProfile ? "check" : "sparkles", name, async () => {
      const fresh = await dockApi.profileApply(name);
      S.cfg = fresh; await ensureLang(S.cfg.language); maybeSyncCtxMenu(); applyAll(); await render(); reframe();
    });
    placeMenu(e, false);
  }).catch(() => {});
}

function openFileMenu(e, item, parent, openFolder) {
  e.preventDefault(); e.stopPropagation(); ++S.menuGeneration;
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

// Right-click on the bar's empty space (tiles stopPropagation their own menu).
dockEl.addEventListener("contextmenu", openBackgroundMenu);
document.addEventListener("contextmenu", (e) => {
  if (isTextEditor(e.target)) return;
  e.preventDefault();
  if (closestSel(e.target, "#ctx-menu")) return;
  const item = closestSel(e.target, "#stack") && findPinnedById(S.stackItemId);
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
  if (S.pinnedReveal) {
    S.pinnedReveal = false;
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
    // Closing an absent panel would still release a pinned reveal and tuck the dock away.
    if (S.productivityPanel) closeProductivityPanel();
  }
});

async function changeIcon(item) {
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
async function clearIcon(item) {
  const live = findPinnedById(item.id);
  if (!live) return;
  live.icon = null;
  iconCache.delete(item.path);
  if (!(await persist())) return;
  await render();
}
async function addSeparatorAfter(id) {
  const i = S.cfg.pinned.findIndex((a) => a.id === id);
  const at = i < 0 ? S.cfg.pinned.length : i + 1;
  S.cfg.pinned.splice(at, 0, { id: uid(), name: "", path: "", args: [], kind: "separator" });
  if (!(await persist())) return;
  await render();
  reframe();
}
async function removeItem(id) {
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

let screenChangeTimer = null;
window.addEventListener("resize", () => {
  // The bar's viewport rect (cached for magnify) shifts when the window resizes
  // — re-measure lazily so magnify never maps the pointer against a stale rect.
  invalidateMag();
  requestAnimationFrame(refreshPreviewMarquees);
  // An open menu/flyout grew the window; now that it actually resized, snap it
  // back into place so it's never clipped by the resize lagging behind.
  if (S.pendingReplace) { try { S.pendingReplace(); } catch (_) {} }
  clearTimeout(screenChangeTimer);
  screenChangeTimer = setTimeout(checkScreenChange, 250);
});

// Track pointer presence at the WINDOW level (bar + its transparent pad):
// relatedTarget === null means the pointer truly entered/left the window,
// not just moved between elements inside it.
window.addEventListener("pointerover", (e) => {
  if (e.relatedTarget) return;
  if (!pointInLiveHitArea(e.clientX, e.clientY)) {
    S.pointerInside = false;
    return;
  }
  S.pointerInside = true;
  if (S.pinnedReveal) S.pinTouched = true; // the summon got used
  // A visible dock never counts down while you're on it — any trigger mode.
  if (!S.hiddenState) clearTimeout(S.hideTimer);
});
window.addEventListener("pointerout", (e) => {
  if (e.relatedTarget) return;
  S.pointerInside = false;
  // A used pin ends when you leave — the dock goes back to normal hiding.
  if (S.pinnedReveal && S.pinTouched) S.pinnedReveal = false;
  // Leaving is the moment a wanted hide (edge mode, or smart while covered)
  // actually happens — after the grace delay.
  if (!S.hiddenState && wantsHideNow()) scheduleHide();
});

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
  if (!S.cfg) return;
  applyAll();
  reportDockMaterial();
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!S.cfg) return;
  setMaterialTint(materialTint(paintedLook(S.cfg)));
  reportDockMaterial();
});

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
  if (!S.hiddenState) reportHitRects();
}, 5000);

// The backend cursor watcher is the source of truth for "is the pointer on
// the dock" once the window can go click-through — DOM enter/leave events
// stop arriving the moment the window starts ignoring the mouse.
if (dockApi.onCursorInside)
  dockApi.onCursorInside((v) => {
    if (v === S.pointerInside) return;
    S.pointerInside = v;
    if (v) {
      if (S.displayOff) onDisplayPower(true); // a pointer on the dock means the screen is on
      if (S.pinnedReveal) S.pinTouched = true;
      if (!S.hiddenState) clearTimeout(S.hideTimer);
    } else {
      if (S.pinnedReveal && S.pinTouched) S.pinnedReveal = false;
      if (!S.hiddenState && wantsHideNow()) scheduleHide();
    }
  });

document.body.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerenter", reveal);
dockEl.addEventListener("pointerleave", () => { if (wantsHideNow()) scheduleHide(); });

onReveal(pinOpen);

onSoftReveal(softOpen);

// Hot edge: the cursor was pushed against the dock's screen edge — an explicit
// "come out" gesture, treated exactly like clicking the notch.
onHotEdge(() => {
  if (S.fullscreen || !S.hiddenState) return;
  pinOpen();
});

// Clicking anywhere outside the dock releases a pinned reveal and lets the dock
// tuck back into the notch (when the mode wants it hidden).
window.addEventListener("pointerdown", (e) => {
  if (!S.pinnedReveal) return;
  if (closestSel(e.target, "#dock")) return;
  S.pinnedReveal = false;
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

// ─────────────────────── Booki tooltips ───────────────────────
const dockTooltip = createDockTooltip(dockEl, {
  edge: () => S.cfg.edge,
  blocked: () => S.editMode || !!S.dragging || S.hiddenState || S.stackOpen || !ctxMenu.classList.contains("hidden"),
  describe: (el) => {
    const pin = S.cfg.pinned.find(item => item.id === el.dataset.id);
    if (!pin) return null;
    let name = pin.name || el.getAttribute("aria-label");
    let detail = t("hint.launch");
    if (pin.kind === "group") detail = t((pin.children || []).length === 1 ? "hint.groupSingle" : "hint.group").replace("{n}", (pin.children || []).length);
    else if (pin.kind === "folder") detail = t("hint.folder");
    else if (pin.kind === "widget") { name = widgetLabel(pin.widget); detail = clippedText(el, name) || t("hint.widget"); }
    else if (pin.kind === "action") { name = el.getAttribute("aria-label"); detail = t("hint.settings"); }
    else if (pin.kind === "trash") detail = t("hint.trash");
    else if (el.dataset.running === "true") {
      const count = windowsFor(pin).length;
      detail = S.cfg.focusIfRunning === false ? t("hint.running") : count > 1 ? t("hint.pickWindow").replace("{n}", String(count)) : t("hint.switch");
    }
    return { name, detail };
  },
});
function hideTip() { dockTooltip.hide(); }
/** The full text of a widget's lines that the tile cuts off (an ellipsis
   like "Portapa…", or a scrolling line), so the tooltip can show it. */
function clippedText(el, name) {
  const cut = [...el.querySelectorAll(".w-pv-title, .w-pv-sub")]
    .filter((line) => line.scrollWidth > line.clientWidth + 1)
    // A scrolling line repeats its text for the loop; read one copy.
    .map((line) => (line.querySelector(".mq > span") || line).textContent.trim())
    .filter((text) => text && text !== name);
  const text = [...new Set(cut)].join(" · ");
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

// Open files with an app and remember them as recents (a small jump list).
async function openWith(item, paths) {
  for (const p of paths) dockApi.launch(item.path, [p]);
  const i = S.cfg.pinned.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const cur = S.cfg.pinned[i].recents || [];
    S.cfg.pinned[i].recents = [...paths, ...cur.filter((r) => !paths.includes(r))].slice(0, 8);
    await persist();
  }
}

function setupFileDrop() {
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

// ─────────────────── Folder stacks (flyout) ───────────────────

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

/** Open a stack; switching to another group/folder replaces the current one. */
async function toggleStack(tileEl, item) {
  if (S.stackOpen && S.stackItemId === item.id) {
    closeStack();
    return;
  }
  if (S.stackOpen) closeStack();
  await openStack(tileEl, item);
}

async function openStack(tileEl, item) {
  if (S.stackOpen && S.stackItemId === item.id) return;
  if (S.stackOpen) closeStack();
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
  S.stackItemId = item.id;
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
        wCell.appendChild(takeOutButton(item, it));
        grid.appendChild(wCell);
        continue;
      }
      const cell = document.createElement("button");
      let holder = null; // wrapper that also holds the take-out button
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
        // The take-out control is a real button, so it sits beside the cell
        // button (a button inside a button is invalid and unreachable by Tab).
        holder = document.createElement("div");
        holder.className = "stack-cell";
        holder.append(cell, takeOutButton(item, it));
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
      grid.appendChild(holder || cell);
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
      if (seq !== stackSeq || !S.stackOpen) return;
      const current = ++request;
      grid.setAttribute("aria-busy","true");
      const previousFocus = pager.contains(document.activeElement) ? document.activeElement?.dataset.pageAction : null;
      const buttonStates = [...pager.querySelectorAll("button")].map((b) => [b, b.dataset.logicalDisabled === "true"]);
      buttonStates.forEach(([b]) => { b.disabled = true; });
      try {
        const rows = await dockApi.listDir(folderNavigation.current.path, nextPage * pageSize, pageSize + 1, search.value.trim(), order.value);
        if (seq !== stackSeq || !S.stackOpen || current !== request) return;
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
        if (S.pendingReplace) requestAnimationFrame(S.pendingReplace);
      } catch (_) {
        if (seq !== stackSeq || !S.stackOpen || current !== request) return;
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
        if (current === request && seq === stackSeq && S.stackOpen) grid.setAttribute("aria-busy","false");
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

  S.stackOpen = true;
  document.body.classList.add("stack-open");
  // Pick up any widgets rendered inside the flyout so they poll live while open.
  cacheWidgetEls();
  syncPolls();
  // Grow the window synchronously BEFORE the flyout becomes visible — same
  // pattern as the context menu / popovers, so opening a folder never flashes
  // a clipped panel while the window catches up.
  applyFrame();
  // The stage window never resizes for the flyout, so it can open on the very
  // next frame — position it, then flip to .open so the transition plays.
  const placeStack = () => placeStackNear(tileEl);
  S.pendingReplace = placeStack; // re-place if the window DOES resize (screen change)
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
  const edge = S.cfg.edge || "bottom";
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
  if (S.stackOpen) closeStack();
  S.stackItemId = "__add";
  stackEl.classList.add("add-mode");
  stackEl.setAttribute("aria-label", t("add.title"));
  const place = () => placeStackNear(anchorEl?.isConnected ? anchorEl : dockEl);
  const panel = buildAddPanel(stackEl, {
    t,
    tab,
    pinned: () => flattenPinned(S.cfg.pinned),
    listWindows: () => dockApi.listWindows(),
    listInstalled: () => dockApi.listInstalledApps(),
    listFrequent: () => S.cfg.usageRecommendationsEnabled === false ? Promise.resolve([]) : dockApi.frequentApps(50).then((apps) => apps.filter((a) => !(S.cfg.ignoredAppSuggestions || []).includes(a.path.replaceAll("\\", "/").toLowerCase()))),
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
  S.stackRefreshPins = panel.refreshPins;
  S.stackOpen = true;
  document.body.classList.add("stack-open");
  applyFrame();
  S.pendingReplace = place;
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
  if (S.stackOpen && S.stackItemId === "__launcher") { closeStack(); return; }
  if (S.stackOpen) closeStack();
  closeMenu();
  S.stackItemId = "__launcher";
  stackEl.classList.add("add-mode", "launcher-mode");
  stackEl.setAttribute("aria-label", t("launcher.title"));
  const place = () => placeStackNear(dockEl);
  const panel = buildLauncher(stackEl, {
    t,
    pinned: () => S.cfg.pinned,
    switchesToOpen: S.cfg.focusIfRunning !== false,
    listWindows: () => dockApi.listWindows(),
    listInstalled: () => dockApi.listInstalledApps(),
    listFrequent: () => S.cfg.usageRecommendationsEnabled === false ? Promise.resolve([]) : dockApi.frequentApps(12),
    appIcon: (path) => dockApi.appIcon(path),
    open: (entry) => {
      closeStack();
      S.pinnedReveal = false;
      scheduleHide();
      if (entry.kind === "window" || (entry.hwnd && S.cfg.focusIfRunning !== false)) dockApi.focusWindow(Number(entry.hwnd));
      else dockApi.launch(entry.path, entry.args || []);
    },
    close: closeStack,
    relayout: () => requestAnimationFrame(place),
  });
  stackDispose = panel.dispose;
  S.stackOpen = true;
  document.body.classList.add("stack-open");
  applyFrame();
  S.pendingReplace = place;
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
function closeStack() {
  if (!S.stackOpen) return;
  S.stackOpen = false;
  clearTimeout(S.clipSearchTimer);
  S.clipSearchTimer = null;
  stackDispose?.();
  stackDispose = null;
  S.stackRefreshPins = null;
  S.stackItemId = null;
  S.pendingReplace = null;
  document.body.classList.remove("stack-open");
  stackEl.classList.remove("open", "just-opened", "add-mode", "launcher-mode");
  cacheWidgetEls();
  syncPolls({ repaint: false });
  clearTimeout(stackCloseTimer);
  stackCloseTimer = setTimeout(reframe, 180);
  // After closing, allow smart-hide to re-evaluate (flyout was blocking tuck).
  scheduleHide();
}

// Add an app or folder into a group from its open flyout, then reopen it so
// you can keep adding several in a row.
async function addToFolderFromDock(group, preferKind = "app") {
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
window.addEventListener("pointerdown", (e) => {
  if (S.stackOpen && !closestSel(e.target, "#stack") && !closestSel(e.target, ".tile")) closeStack();
});

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

// Hand each module the calls it makes back into modules that import it
// (see `deps` there).
wireLiveWidgets({ startRunningPoll });
wireRunningWindows({ refreshTrashState });
wireUndoToast({ persist, render });
wirePopovers({ refreshTrashState });
wireConfigSync({ render, hideTip, closeStack });
wireClipboardStack({ placeStackNear, closeStack });

boot();
