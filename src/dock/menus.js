/* The context menus: a pin's, the empty bar's and a flyout file's. */

import { dock as dockApi, isTauri } from "../api.js";
import { icon } from "../icons.js";
import { t, ensureLang } from "../i18n.js";
import { menuActions } from "./context-menu.js";
import { S } from "./state.js";
import { widgetLabel, findWidgetPin, baseName, menuPinTitle } from "./helpers.js";
import { dockEl, ctxMenu, esc } from "./dom.js";
import { reframe } from "./frame.js";
import { addMenuHead, placeMenu, closeMenu } from "./menu-core.js";
import { render } from "./render.js";
import { windowsFor } from "./running-windows.js";
import { confirmTrash } from "./popovers.js";
import { maybeSyncCtxMenu, applyAll, persist } from "./config-sync.js";
import { FINISH_PRESETS, resolveGlassTint, resolveSurfaceStyle, surfaceAlpha } from "../surface.js";
import { paintedLook } from "../system-look.js";
import { openProductivity } from "./widget-editors.js";
import {
  promptRename,
  relocateShortcut,
  confirmRemoveGroup,
  changeIcon,
  clearIcon,
  addSeparatorAfter,
  removeItem,
} from "./pin-ops.js";
import { openStack, openAddPanel, openLauncher } from "./stack.js";
import { enterEdit } from "./edit-reorder.js";
import { ungroup, takeOutChild } from "./group-ops.js";

// ───────────────────────── Context menu ─────────────────────────

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

export function openMenu(e, item) {
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
    // A widget's tile always shows its own label, so renaming it would do nothing.
    if (item.kind !== "widget") add("pencil", t("apps.rename"), () => promptRename(item));
    // A custom icon only makes sense for apps/folders (groups show a mini-grid,
    // widgets show their card).
    if (item.kind === "app" || item.kind === "folder") {
      add("image", t("m.changeIcon"), () => changeIcon(item));
      if (item.icon) add("x", t("m.removeIcon"), () => clearIcon(item));
    }
    if (item.kind === "group") add("grid", t("group.ungroup"), () => ungroup(item));
  }
  sep();
  add("plus", t("add.open"), () => openAddPanel(dockEl));
  add("minus", t("m.addSep"), () => addSeparatorAfter(item.id));
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

// Recent files for THIS app only (matched by file association in the backend)
// dropped into the pin's context menu. Runs after the menu is already on
// screen; re-places it once the items are in. Nothing relevant -> no section.
async function fillRecentFiles(slot, e, item, generation) {
  // Files opened through Booki plus the app's own Windows Jump List.
  const [own, jump] = await Promise.allSettled([dockApi.recentFilesFor(item.path, 6), dockApi.appRecentItems(item.path)]);
  const seen = new Set();
  const recents = [...(jump.status === "fulfilled" ? jump.value || [] : []), ...(own.status === "fulfilled" ? own.value || [] : [])]
    .filter((r) => r?.path && !seen.has(r.path.toLowerCase()) && seen.add(r.path.toLowerCase()))
    .slice(0, 8);
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

// Right-click on empty dock area / hint (or on the notch, which opens the
// dock first): add, find and organise, the dock's style in one click, then
// Settings.
export function openBackgroundMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const generation = ++S.menuGeneration;
  ctxMenu.replaceChildren();
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  addMenuHead("Booki", t("m.dockMenu"));
  add("plus", t("add.open"), () => openAddPanel(dockEl));
  add("search", t("launcher.menu"), openLauncher);
  add("grid", t("workspace.library"), () => dockApi.openSettingsTab("apps"));
  const profilesSlot = document.createElement("div");
  ctxMenu.append(profilesSlot);
  sep();
  addStyleRow();
  sep();
  add("pencil", t("overhaul.editing"), enterEdit);
  add("palette", t("m.appearance"), () => dockApi.openSettingsTab("dock"));
  add("settings", t("m.settings"), () => dockApi.openSettingsTab("home"));
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

/** The four styles as small samples, so changing the dock's look is one
 * click from the dock itself. Each sample is painted with that style's real
 * fill for the current theme and colours. */
function addStyleRow() {
  const label = document.createElement("div");
  label.className = "menu-label";
  label.textContent = t("m.style");
  const row = document.createElement("div");
  row.className = "menu-styles";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", t("m.style"));
  const current = resolveSurfaceStyle(S.cfg);
  for (const { id, patch } of FINISH_PRESETS) {
    const look = paintedLook({ ...S.cfg, ...patch, reduceTransparency: false });
    const tint = resolveGlassTint(look) || "var(--surface-tint)";
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(current === id));
    button.dataset.style = id;
    const sample = document.createElement("i");
    sample.style.setProperty("--sample-fill", `color-mix(in srgb, ${tint} ${Math.round(surfaceAlpha(look) * 100)}%, transparent)`);
    const name = document.createElement("span");
    name.textContent = t(`finish.${id}`);
    button.append(sample, name);
    button.addEventListener("click", async () => {
      closeMenu();
      if (current === id) return;
      S.cfg = { ...S.cfg, ...patch };
      applyAll();
      await persist(patch);
    });
    row.append(button);
  }
  ctxMenu.append(label, row);
}

export function openFileMenu(e, item, parent, openFolder) {
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
