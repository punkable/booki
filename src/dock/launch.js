/* What a click on a tile does: launch, switch windows, or open the tile's panel. */

import { dock as dockApi } from "../api.js";
import { t } from "../i18n.js";
import { menuActions } from "./context-menu.js";
import { S } from "./state.js";
import { menuPinTitle } from "./helpers.js";
import { ctxMenu } from "./dom.js";
import { scheduleHide } from "./autohide.js";
import { addMenuHead, placeMenu, closeMenu } from "./menu-core.js";
import { windowsFor, clearAttention } from "./running-windows.js";
import { openProductivity, openSystemPanel, editNote } from "./widget-editors.js";
import { toggleStack } from "./stack.js";
import { refreshMedia, refreshVolume } from "./live-widgets.js";
import { toggleClipboardStack } from "./clipboard-stack.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireLaunch(fns) { Object.assign(deps, fns); }

// ─────────────────────────── Launch ───────────────────────────

/** Taskbar modifiers on a click: Shift opens a new instance, Ctrl+Shift runs
   the app as administrator. */
export function launchModifiers(e) {
  const shift = !!e?.shiftKey, ctrl = !!(e?.ctrlKey || e?.metaKey);
  return { admin: shift && ctrl, newInstance: shift && !ctrl };
}

export function launch(el, item, mods = {}) {
  if (item.kind === "action") { if (item.action === "settings") dockApi.openSettings(); return; }
  // Widgets: the media card plays/pauses and the volume card mutes on a
  // click, like the keys on a keyboard; their panel is on right-click or a
  // long press. The other live cards open their panel.
  if (item.kind === "widget") {
    if (item.widget === "media") { dockApi.mediaToggle().catch(() => {}).finally(refreshMedia); return; }
    if (item.widget === "volume") {
      dockApi.volumeInfo().then((v) => Array.isArray(v) && dockApi.masterVolumeSet(v[0], !v[1])).catch(() => {}).finally(refreshVolume);
      return;
    }
    if (["devices", "system", "ai", "battery", "collector"].includes(item.widget)) openSystemPanel(item, el);
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
  deps.hideTip();
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
