/* The context menus: a pin's, the empty bar's and a flyout file's. */

import { dock as dockApi, isTauri } from "../api.js";
import { icon } from "../icons.js";
import { t, ensureLang } from "../i18n.js";
import { menuActions } from "./context-menu.js";
import { S } from "./state.js";
import { widgetLabel, findWidgetPin, baseName, menuPinTitle } from "./helpers.js";
import { dockEl, ctxMenu, stackEl } from "./dom.js";
import { reframe } from "./frame.js";
import { addMenuHead, placeMenu, closeMenu, resetMenu, addMenuSection, openMenuSection } from "./menu-core.js";
import { render, refreshGroupTile } from "./render.js";
import { windowsFor } from "./running-windows.js";
import { confirmTrash } from "./popovers.js";
import { maybeSyncCtxMenu, applyAll, persist } from "./config-sync.js";
import { FINISH_PRESETS, resolveGlassTint, resolveSurfaceStyle, surfaceAlpha } from "../surface.js";
import { groupAppearance } from "../group-style.js";
import { libGlyphSVG } from "../icon-library.js";
import { buildGroupCustomizer } from "./group-customizer.js";
import { paintedLook } from "../system-look.js";
import { openProductivity, openSystemPanel } from "./widget-editors.js";
import {
  promptRename,
  relocateShortcut,
  confirmRemoveGroup,
  changeIcon,
  clearIcon,
  addSeparatorAfter,
  removeItem,
} from "./pin-ops.js";
import { openWidgetHub } from "./widget-editors.js";
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
  resetMenu();
  if (item.kind === "group") item = S.cfg.pinned.find((pin) => pin.id === item.id) || item;
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  addMenuHead(menuPinTitle(item), item.kind === "separator" ? "" : menuKindLabel(item));

  // Like the macOS dock: an app's open windows come first (the likeliest
  // reason to right-click a running app is to pick one of them), then what
  // you can do with it, then how it sits on the dock, then removal. Sections
  // are separated, not titled.
  const wins = item.kind === "app" || item.kind === "group" ? windowsFor(item) : [];
  if (wins.length === 1) add("app", wins[0].title || menuPinTitle(item), () => dockApi.focusWindow(Number(wins[0].hwnd)));
  if (wins.length > 1) addMenuSection(ctxMenu, "app", t("m.windows").replace("{n}", String(wins.length)), () => openMenuSection(e, t("m.windows").replace("{n}", String(wins.length)), () => openMenu(e, item), ({ add, sep }) => {
    for (const w of wins) add("app", w.title || menuPinTitle(item), () => dockApi.focusWindow(Number(w.hwnd)));
    sep(); add("x", t("m.closeAll"), async () => { for (const w of wins) await dockApi.closeWindow(Number(w.hwnd)).catch(() => {}); });
  }));
  if (wins.length) sep();

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
    if (item.kind === "group") addMenuSection(ctxMenu, "pencil", t("refine.customize"), () => openGroupLook(e, item), "dialog");
  } else if (item.kind === "trash") {
    add("trash", t("m.open"), () => dockApi.launch("shell:RecycleBinFolder", []));
    add("trash", t("trash.empty"), () => confirmTrash([], true), "danger");
  }
  if (item.kind === "widget") { if (["media", "volume"].includes(item.widget)) add("sliders", t("m.details"), () => openSystemPanel(item, dockEl.querySelector(`.tile[data-id="${item.id}"]`))); add("sliders", t("m.settings"), () => dockApi.openWidgetSettings(item.id)); if (["clock", "focus", "calendar", "weather"].includes(item.widget)) add("app", t("m.open"), () => openProductivity(item, dockEl.querySelector(`.tile[data-id="${item.id}"]`))); }
  if (item.kind === "folder") add("external", t("stack.openExplorer"), () => dockApi.launch(item.path, []));
  if (item.kind === "app" && item.path) add("folder", t("m.showInExplorer"), () => dockApi.openLocation(item.path));
  if (wins.length === 1) add("x", t("m.closeWindow"), () => dockApi.closeWindow(Number(wins[0].hwnd)));
  if (item.kind === "app") addMenuSection(ctxMenu, "external", t("m.recent"), () => openRecents(e, item));
  if (item.kind === "app" || item.kind === "folder") addMenuSection(ctxMenu, "pencil", t("refine.customize"), () => openMenuSection(e, menuPinTitle(item), () => openMenu(e, item), ({ add }) => {
    add("pencil", `${t("apps.rename")}…`, () => promptRename(item));
    add("image", t("m.changeIcon"), () => changeIcon(item));
    if (item.icon) add("undo", t("m.removeIcon"), () => clearIcon(item));
  }));
  if (item.kind !== "separator") addMenuSection(ctxMenu, "grid", t("refine.organize"), () => openMenuSection(e, t("refine.organize"), () => openMenu(e, item), ({ add }) => {
    add("minus", t("m.addSep"), () => addSeparatorAfter(item.id));
    if (item.kind === "group") add("ungroup", t("group.ungroup"), () => ungroup(item));
    if (isTauri && item.kind === "app" && /\.lnk$/i.test(item.path || "")) {
      add("folder", t("shortcut.store"), () => relocateShortcut(item, false));
      add("external", t("shortcut.desktop"), () => relocateShortcut(item, true));
    }
  }));
  // Adding things lives on the background menu and the empty hint; a pin's
  // menu stays about that pin.
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

}

// Load long lists only after opening their secondary view, never into the root.
function openRecents(e, item) {
  openMenuSection(e, t("m.recent"), () => openMenu(e, item), () => {});
  const generation = S.menuGeneration;
  const loading = document.createElement("p"); loading.className = "menu-label"; loading.textContent = t("overhaul.loading"); ctxMenu.append(loading);
  placeMenu(e, false);
  Promise.allSettled([dockApi.recentFilesFor(item.path, 20), dockApi.appRecentItems(item.path)]).then(([own, jump]) => {
    if (generation !== S.menuGeneration || ctxMenu.classList.contains("hidden")) return;
    loading.remove();
    const seen = new Set();
    const recents = [...(item.recents || []).map((path) => ({ name: baseName(path), path, throughApp: true })), ...(jump.status === "fulfilled" ? jump.value || [] : []), ...(own.status === "fulfilled" ? own.value || [] : [])]
      .filter((row) => row?.path && !seen.has(row.path.toLowerCase()) && seen.add(row.path.toLowerCase()));
    const { add } = menuActions(ctxMenu, closeMenu);
    recents.forEach((row) => add("external", row.name || baseName(row.path), () => row.throughApp ? dockApi.launch(item.path, [row.path]) : dockApi.launch(row.path, [])));
    if (!recents.length) { const empty = document.createElement("p"); empty.className = "menu-label"; empty.textContent = t("refine.noRecent"); ctxMenu.append(empty); }
    placeMenu(e, false);
  });
}

// Right-click on empty dock area / hint (or on the notch, which opens the
// dock first): common actions stay direct; long lists and appearance open
// secondary views with an explicit Back action.
export function openBackgroundMenu(e) {
  e.preventDefault(); e.stopPropagation(); resetMenu();
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  addMenuHead("Booki", t("m.dockMenu"));
  add("plus", t("add.open"), () => openAddPanel(dockEl));
  add("search", t("launcher.menu"), openLauncher);
  add("grid", t("refine.hub"), openWidgetHub);
  add("volume", t("refine.audio"), () => openSystemPanel({ id: "__audio", widget: "volume" }, dockEl));
  sep();
  addMenuSection(ctxMenu, "pencil", t("refine.organize"), () => openMenuSection(e, t("refine.organize"), () => openBackgroundMenu(e), ({ add }) => {
    add("grid", t("workspace.library"), () => dockApi.openSettingsTab("apps"));
    add("pencil", t("overhaul.editing"), enterEdit);
    for (const el of dockEl.querySelectorAll(".conditionally-hidden")) {
      const item = findWidgetPin(el.dataset.id);
      if (item) add("eye", widgetLabel(item.widget), async () => { item.style = { ...item.style, hideWhenUnavailable: false }; if (!(await persist())) return; await render(); reframe(); });
    }
  }));
  addMenuSection(ctxMenu, "sliders", t("m.style"), () => openMenuSection(e, t("m.style"), () => openBackgroundMenu(e), () => addStyleRow()));
  addMenuSection(ctxMenu, "sparkles", t("prof.title"), () => openProfiles(e));
  sep(); add("settings", t("m.settings"), () => dockApi.openSettingsTab("home"));
  placeMenu(e);
}
function openProfiles(e) {
  openMenuSection(e, t("prof.title"), () => openBackgroundMenu(e), ({ add }) => add("settings", t("m.settings"), () => dockApi.openSettingsTab("system")));
  const generation = S.menuGeneration;
  const status = document.createElement("p"); status.className = "menu-label"; status.textContent = t("overhaul.loading"); ctxMenu.append(status); placeMenu(e, false);
  dockApi.profileList().then((profiles) => {
    if (generation !== S.menuGeneration || ctxMenu.classList.contains("hidden")) return;
    status.remove();
    const { add } = menuActions(ctxMenu, closeMenu);
    for (const name of Array.isArray(profiles) ? profiles : []) add(name === S.cfg.lastProfile ? "check" : "sparkles", name, async () => {
      const fresh = await dockApi.profileApply(name); S.cfg = fresh; await ensureLang(S.cfg.language); maybeSyncCtxMenu(); applyAll(); await render(); reframe();
    });
    if (!profiles?.length) { status.textContent = t("design.profileEmpty"); ctxMenu.append(status); }
    placeMenu(e, false);
  }).catch(() => {
    if (generation !== S.menuGeneration || ctxMenu.classList.contains("hidden")) return;
    status.textContent = t("overhaul.failed");
    menuActions(ctxMenu, () => {}).add("undo", t("focus.retry"), () => openProfiles(e)); placeMenu(e, false);
  });
}

/** One compact editor for name, icon and colour; palettes start collapsed. */
export function openGroupLook(e, item) {
  e.preventDefault(); e.stopPropagation(); resetMenu();
  item = S.cfg.pinned.find((pin) => pin.id === item.id && pin.kind === "group");
  if (!item) { closeMenu(); return; }
  ctxMenu.classList.add("group-customizer"); ctxMenu.setAttribute("role", "dialog"); ctxMenu.setAttribute("aria-label", t("refine.customizeGroup"));
  const form = buildGroupCustomizer(item, {
    close: () => {
      const restore = ctxMenu.contains(document.activeElement);
      closeMenu();
      // Recovery can replace the original opener. Return to the live group.
      if (restore) {
        const opener = S.stackItemId === item.id ? stackEl?.querySelector(".stack-head-icon") : [...dockEl.children].find((tile) => tile.dataset.id === item.id);
        opener?.focus({ preventScroll: true });
      }
    },
    measure: () => { if (form.isConnected && !ctxMenu.classList.contains("hidden")) placeMenu(e, false); },
    save: async (draft, original) => {
      const live = S.cfg.pinned.find((pin) => pin.id === item.id && pin.kind === "group");
      if (!live) return false;
      if (["name", "color", "glyph"].every((key) => draft[key] === original[key])) return true;
      if (draft.name !== original.name) live.name = draft.name;
      const style = { ...(live.style || {}) };
      for (const key of ["color", "glyph"]) if (draft[key] !== original[key]) { if (draft[key]) style[key] = draft[key]; else delete style[key]; }
      if (Object.keys(style).length) live.style = style; else delete live.style;
      if (!(await persist({}, { showError: false }))) return false;
      const current = S.cfg.pinned.find((pin) => pin.id === item.id);
      if (!current) return true;
      refreshGroupTile(current);
      if (S.stackItemId === item.id && stackEl) {
        const look = groupAppearance(current);
        stackEl.style.setProperty("--group-color", look.color || ""); stackEl.classList.toggle("tinted", !!look.color);
        const glyph = stackEl.querySelector(".stack-head-icon"); if (glyph) glyph.innerHTML = look.glyph ? libGlyphSVG(look.glyph) : icon("folder");
        const input = stackEl.querySelector(".stack-rename"); if (input) input.value = current.name;
        stackEl.setAttribute("aria-label", current.name);
      }
      return true;
    },
  });
  ctxMenu._onEscape = form.dismissPicker; ctxMenu.append(form); placeMenu(e);
}

/** The three styles as small samples, so changing the dock's look is one
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
  resetMenu();
  addMenuHead(item.name, item.is_dir || item.kind === "folder" ? t("m.folder") : t("m.app"));
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  if (item.kind !== "widget") add("external", t("m.open"), () => { if (item.is_dir && openFolder) return openFolder(); if (item.kind === "action") return dockApi.openSettings(); return dockApi.launch(item.path, item.args || []); });
  if (item.path) {
    add("copy", t("stack.copyPath"), () => dockApi.copyText(item.path));
    add("folder", t("stack.showInExplorer"), () => dockApi.openLocation(item.path));
    if (!parent && !item.is_dir) add("app", t("stack.openWith"), () => dockApi.openWith(item.path));
  }
  if (parent) add("take-out", t("group.takeOut"), () => takeOutChild(parent, item.id));
  sep(); add("settings", t("m.settings"), () => item.kind === "widget" ? dockApi.openWidgetSettings(item.id) : dockApi.openSettingsTab("dock"));
  placeMenu(e);
}

// Right-click on a card inside a widget panel: that card's own actions, not
// the dock's menu.
export function openPanelItemMenu(e, card) {
  e.preventDefault();
  e.stopPropagation();
  ++S.menuGeneration;
  resetMenu();
  const { add, sep } = menuActions(ctxMenu, closeMenu);
  const name = card.querySelector("strong")?.textContent || "";
  const value = card.querySelector(".reading-card-value")?.textContent || "";
  addMenuHead(name, value);
  const buttons = [...card.querySelectorAll("button:not([disabled])")];
  for (const b of buttons) add("plus", b.textContent.trim(), () => b.click());
  if (buttons.length) sep();
  add("copy", t("ab.copy"), () => navigator.clipboard?.writeText([name, value].filter(Boolean).join(" · ")).catch(() => {}));
  placeMenu(e);
}
