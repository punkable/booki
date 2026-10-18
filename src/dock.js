/* Booki Dock — tile rendering, magnify-on-hover (overflowing the bar),
   pointer reordering, desktop file-drop, auto-hide and live settings.

   This file boots the dock and wires the page-level listeners; the features
   live in ./dock/*.js, with shared mutable state in ./dock/state.js. */

import "./dock/error-log.js";
import {
  config as configApi,
  dock as dockApi,
  onConfigChanged,
  onOcclusion,
  onDesktop,
  onReveal,
  onNotchMenu,
  onSoftReveal,
  onFullscreen,
  onToggleDock,
  onLauncher,
  onLaunchIndex,
  onHotEdge,
  logMessage,
  isTauri,
} from "./api.js";
import { createDockTooltip } from "./dock/tooltip.js";
import { observeSystem } from "./dock/system-observer.js";
import { paintedLook } from "./system-look.js";
import { t, ensureLang } from "./i18n.js";
import { WIDGET_VARIANTS } from "./widgets-meta.js";
import { refreshPreviewMarquees } from "./dock/widget-view.js";
import { moveMenuFocus, isTextEditor } from "./dock/context-menu.js";
import { materialTint, setMaterialTint, followFrames } from "./material.js";
import { S } from "./dock/state.js";
import { isVertical, findPinnedById, widgetLabel } from "./dock/helpers.js";
import { dockEl, ctxMenu, closestSel } from "./dock/dom.js";
import {
  pointInLiveHitArea,
  MATERIAL_PANELS,
  reportDockMaterial,
  reportHitRects,
  scheduleHitReport,
} from "./dock/hit-regions.js";
import {
  resetMagnify,
  invalidateMag,
  magnify,
  magPointer,
  edgeAutoScroll,
  stopEdgeScroll,
} from "./dock/magnify.js";
import { reframe, checkScreenChange } from "./dock/frame.js";
import {
  queueVolumeSet,
  adjustVolumeFromWheel,
  onDisplayPower,
  onEnergySaver,
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
import { closeMenu } from "./dock/menu-core.js";
import { render, wireRender } from "./dock/render.js";
import { windowsFor, setAttention, startRunningPoll } from "./dock/running-windows.js";
import { placeUndoToast, wireUndoToast } from "./dock/undo-toast.js";
import { closeTrashPop } from "./dock/popovers.js";
import {
  maybeSyncCtxMenu,
  checkAutoProfile,
  reloadConfig,
  applyAll,
  persist,
  wireConfigSync,
} from "./dock/config-sync.js";
import { closeProductivityPanel, insideWidgetPanel } from "./dock/widget-editors.js";
import { removeItem } from "./dock/pin-ops.js";
import { openAddPanel, openLauncher, closeStack, wireStack } from "./dock/stack.js";
import { launchModifiers, launch, wireLaunch } from "./dock/launch.js";
import { setupFileDrop } from "./dock/file-drop.js";
import { exitEdit, onPointerDown, cancelDrag } from "./dock/edit-reorder.js";
import { takeOutButton, wireStackDragOut, addToFolderFromDock } from "./dock/group-ops.js";
import { openMenu, openBackgroundMenu, openFileMenu } from "./dock/menus.js";
import { checkChangelog, maybeOnboard } from "./dock/onboarding.js";
import { updateEdgePreview, enterEdgeMove, endEdgeMove } from "./dock/edge-move.js";
import { placeUpdatePill, checkUpdates } from "./dock/updates.js";


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
    // At sign-in Windows is starting everything at once: the dock is up, but
    // registry writes, the network update check and What's new wait until the
    // rush is over. A normal launch only waits for first paint.
    const atLogin = await dockApi.launchedAtLogin();
    setTimeout(maybeSyncCtxMenu, atLogin ? 30000 : 2500);
    setTimeout(checkUpdates, atLogin ? 90000 : 4000);
    // First-run tips first; changelog only after the user is past onboarding.
    setTimeout(() => {
      if (!S.cfg.onboarded) maybeOnboard();
      else checkChangelog();
    }, atLogin ? 20000 : 800);
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
  // The remove badge is mouse-only (it sits inside the tile button), so in
  // edit mode Delete or Backspace removes the focused tile; the undo toast
  // brings it back.
  if (S.editMode && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    removeItem(item.id);
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
  if (S.productivityPanel) closeProductivityPanel();
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
    if (e.target.matches?.(`.dock, .stack, ${MATERIAL_PANELS}`)) followFrames(reportDockMaterial, 700);
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

// Right-click on the notch: it already brought the dock back (pinned open);
// once the bar is in place, open the dock's own menu over its middle.
onNotchMenu(() => setTimeout(() => {
  const bar = dockEl.getBoundingClientRect();
  const x = bar.left + bar.width / 2;
  const y = bar.top + bar.height / 2;
  openBackgroundMenu({ clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
}, 160));

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

// ─────────────────────── Booki tooltips ───────────────────────
const dockTooltip = createDockTooltip(dockEl, {
  edge: () => S.cfg.edge,
  blocked: () => S.editMode || !!S.dragging || S.hiddenState || S.stackOpen || !!document.querySelector(".productivity-panel") || !ctxMenu.classList.contains("hidden"),
  describe: (el) => {
    const pin = S.cfg.pinned.find(item => item.id === el.dataset.id);
    if (!pin) return null;
    // A Windows tooltip: the name, and a second line only when it adds
    // something the tile can't show (text it cuts off, several windows).
    let name = pin.name || el.getAttribute("aria-label");
    let detail = "";
    if (pin.kind === "widget") { name = widgetLabel(pin.widget); detail = clippedText(el, name); }
    else if (pin.kind === "action" || pin.kind === "trash") name = el.getAttribute("aria-label") || name;
    else if (el.dataset.running === "true" && S.cfg.focusIfRunning !== false) {
      const count = windowsFor(pin).length;
      if (count > 1) detail = t("hint.pickWindow").replace("{n}", String(count));
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

// Every flyout dismisses the same way: a press anywhere outside it, Escape, or
// switching to another app closes it. The context menu sits outside #stack;
// its items act on the open flyout, so pressing it never counts as outside.
window.addEventListener("pointerdown", (e) => {
  if (closestSel(e.target, "#ctx-menu")) return;
  if (S.stackOpen && !closestSel(e.target, "#stack") && !closestSel(e.target, ".tile")) closeStack();
  if (S.productivityPanel && !insideWidgetPanel(e.target)) closeProductivityPanel();
  if (S.trashPop && !S.trashPop.contains(e.target)) { closeTrashPop(); S.pinnedReveal = false; scheduleHide(); }
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
wireRender({ onPointerDown, openMenu, openBackgroundMenu, removeItem, openAddPanel });
wireUndoToast({ persist });
wireConfigSync({ hideTip, closeStack, cancelDrag });
wireStack({ takeOutButton, wireStackDragOut, openFileMenu, addToFolderFromDock });
wireLaunch({ hideTip });

boot();
