/* Panels opened from a widget tile: the productivity panel and the note editor. */

import { dock as dockApi } from "../api.js";
import { setTileLabel } from "./tooltip.js";
import { toggleClipboardStack } from "./clipboard-stack.js";
import { buildWidgetHub } from "./widget-hub.js";
import { buildSystemPanel } from "./system-panel.js";
import { buildProductivityPanel } from "./productivity-panel.js";
import { createDraftSaver } from "./draft-saver.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { placeBesideBar } from "./placement.js";
import { setPreviewSubText } from "./widget-view.js";
import { S } from "./state.js";
import { findPinnedById, widgetLabel, findWidgetPin } from "./helpers.js";
import { dockEl, liveDockRect } from "./dom.js";
import { scheduleHitReport } from "./hit-regions.js";
import { reframe, applyFrame } from "./frame.js";
import { eachWidget, tickProductivity, cacheWidgetEls, syncPolls } from "./live-widgets.js";
import { scheduleHide } from "./autohide.js";
import { persist } from "./config-sync.js";
import { closeStack } from "./stack.js";
import { closeMenu } from "./menu-core.js";

export function closeProductivityPanel() {
  // Give keyboard focus back to the tile that opened the panel.
  const panel = S.productivityPanel;
  if (panel?._opener?.isConnected && panel.contains(document.activeElement)) panel._opener.focus();
  panel?.dispose?.();
  S.productivityPanel = null; S.pinnedReveal = false;
  cacheWidgetEls(); syncPolls();
  if (!panel) { reframe(); scheduleHide(); return; }
  // Leave the way a folder flyout leaves, then shrink the window.
  dismissFlyout(panel, () => { reframe(); scheduleHide(); });
}
/** Fade a flyout out along its entry path, then remove it. */
function dismissFlyout(panel, done) {
  panel.classList.remove("is-open"); panel.classList.add("is-closing");
  // Gone for keyboards and screen readers at once; only its fade remains.
  panel.inert = true; panel.setAttribute("aria-hidden", "true");
  scheduleHitReport(); // its native blur goes before the fade, not after
  setTimeout(() => { panel.remove(); done?.(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 170);
}
/** True when a pointer event landed on the open widget panel or the tile that opened it. */
export function insideWidgetPanel(target) {
  const panel = S.productivityPanel;
  return !!panel && (panel.contains(target) || !!panel._opener?.contains?.(target));
}
/** One route for using a widget, from the bar, a group or the widget hub. */
export function openWidget(item, tile = dockEl) {
  if (["clock", "calendar", "weather", "focus"].includes(item.widget)) return openProductivity(item, tile);
  if (item.widget === "notes") return editNote(item);
  if (item.widget === "clipboard") {
    closeProductivityPanel();
    if (S.stackItemId) closeStack();
    return toggleClipboardStack(tile, item.id);
  }
  return openSystemPanel(item, tile);
}
export function openProductivity(item, tile) {
  if (!item.url && S.productivityPanel && S.productivityPanel._opener === tile && S.productivityPanel._itemId === item.id) { closeProductivityPanel(); return; }
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
  mountWidgetPanel(item, tile, panel);
}
export function openSystemPanel(item, tile) {
  // A second click on the tile that opened the panel closes it, as with a folder.
  if (!item.url && S.productivityPanel && S.productivityPanel._opener === tile && S.productivityPanel._itemId === item.id) { closeProductivityPanel(); return; }
  closeProductivityPanel();
  mountWidgetPanel(item, tile, buildSystemPanel(item, { close: closeProductivityPanel }));
}
export function openWidgetHub() {
  closeProductivityPanel();
  const item = { id: "__widgets", widget: "hub" };
  const open = (pin) => openWidget(pin, dockEl);
  mountWidgetPanel(item, dockEl, buildWidgetHub(S.cfg.pinned, { open, close: closeProductivityPanel, settings: () => dockApi.openSettingsTab("widgets") }));
}
function placeWidgetPanel(panel, tile) {
  const bar = liveDockRect(), anchor = tile.getBoundingClientRect(), edge = S.cfg.edge || "bottom", gap = 10, pad = 8;
  const vertical = edge === "left" || edge === "right";
  const height = vertical ? innerHeight - pad * 2 : edge === "top" ? innerHeight - bar.bottom - gap - pad : bar.top - gap - pad;
  const width = !vertical ? innerWidth - pad * 2 : edge === "left" ? innerWidth - bar.right - gap - pad : bar.left - gap - pad;
  panel.style.maxHeight = `${Math.max(1, height)}px`; panel.style.maxWidth = `${Math.max(1, width)}px`;
  const pos = placeBesideBar({ bar, box: { width: panel.offsetWidth, height: panel.offsetHeight }, edge, viewport: { width: innerWidth, height: innerHeight }, along: vertical ? anchor.top + anchor.height / 2 : anchor.left + anchor.width / 2, inside: bar, gap, pad });
  panel.style.left = `${pos.left}px`; panel.style.top = `${pos.top}px`; scheduleHitReport();
}
function mountWidgetPanel(item, tile, panel) {
  // One flyout at a time: a widget panel replaces an open folder or menu.
  closeStack(); closeMenu();
  panel._opener = tile; panel._itemId = item.id; panel.tabIndex = -1;
  if (item.id !== "__widgets") {
    const settings = document.createElement("button"); settings.type = "button"; settings.className = "stack-close widget-settings-action";
    settings.innerHTML = icon("settings");
    const label = t("widgetFlow.configureNamed").replace("{name}", () => widgetLabel(item.widget));
    settings.title = label; settings.setAttribute("aria-label", label);
    settings.addEventListener("click", () => dockApi.openWidgetSettings(item.id));
    const head = panel.querySelector(".productivity-head"); head?.insertBefore(settings, head.lastElementChild);
  }
  panel.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape") closeProductivityPanel(); });
  S.productivityPanel = panel; document.body.appendChild(panel); S.pinnedReveal = true; cacheWidgetEls(); syncPolls(); applyFrame();
  const place = () => {
    if (!panel.isConnected) return;
    placeWidgetPanel(panel, tile);
  };
  const dispose = panel.dispose;
  const observer = new ResizeObserver(() => { if (!panel.isConnected) { observer.disconnect(); return; } applyFrame(); requestAnimationFrame(place); }); observer.observe(panel);
  panel.dispose = () => { dispose?.(); observer.disconnect(); };
  requestAnimationFrame(() => { place(); panel.classList.add("is-open"); const search = item.widget === "weather" ? panel.querySelector("input") : null; if (search?.offsetParent) search.focus(); else panel.focus({ preventScroll: true }); });
}

// Notes use a serialized autosave and keep their draft visible on failure.
let noteEditor = null;
async function closeNoteEditor() {
  const editor = noteEditor;
  if (!editor) return true;
  if (!(await editor.flush())) return false;
  if (noteEditor !== editor) return true;
  editor.dispose(); noteEditor = null;
  S.pinnedReveal = false;
  dismissFlyout(editor, () => { reframe(); scheduleHide(); });
  return true;
}
export async function editNote(item) {
  if (!(await closeNoteEditor())) return;
  closeProductivityPanel(); closeStack(); closeMenu();
  const tile = dockEl.querySelector(`.tile[data-id="${item.id}"]`) || dockEl;
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
    // The note's widget is gone: the text is safe in the draft; let it close.
    if (!current || current.widget !== "notes") return true;
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
    placeWidgetPanel(panel, tile);
  };
  const observer = new ResizeObserver(() => { applyFrame(); requestAnimationFrame(place); }); observer.observe(panel);
  panel.dispose = () => { saver.cancelTimer(); observer.disconnect(); };
  requestAnimationFrame(() => { place(); panel.classList.add("is-open"); if (ta.disabled) panel.focus(); else ta.focus(); });
}
