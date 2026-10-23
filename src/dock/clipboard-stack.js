/* The clipboard-history flyout, opened from the clipboard widget. */

import { dock as dockApi, logMessage } from "../api.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { S } from "./state.js";
import { stackEl } from "./dom.js";
import { applyFrame } from "./frame.js";
import { refreshClipboard } from "./live-widgets.js";
import { showErrorToast } from "./undo-toast.js";
import { placeStackNear, closeStack, clearStackTint } from "./stack.js";

// Clipboard-history flyout: the "clipboard" widget's click target. Reuses the
// same #stack panel/positioning as the folder/group flyout (one flyout
// concept, different content) so it inherits the stage-window stability,
// hit-region reporting and open/close transition for free.
let clipStackQuery = "";
let clipRenderSeq = 0;
export async function toggleClipboardStack(tileEl, widgetId = tileEl?.dataset.id) {
  if (S.stackOpen) {
    closeStack();
    return;
  }
  stackEl.innerHTML = "";
  clearStackTint();
  stackEl.classList.add("clipboard-stack");
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
  const settings = document.createElement("button"); settings.type = "button"; settings.className = "stack-close";
  settings.innerHTML = icon("settings"); settings.setAttribute("aria-label", t("widgetFlow.configureNamed").replace("{name}", () => t("w.clipboard")));
  settings.addEventListener("click", () => dockApi.openWidgetSettings(widgetId).catch(() => showErrorToast(t("overhaul.failed"))));
  const help = document.createElement("button"); help.type = "button"; help.className = "stack-close";
  help.innerHTML = icon("info"); help.setAttribute("aria-label", t("clip.howTitle")); help.setAttribute("aria-expanded", "false"); help.setAttribute("aria-controls", "clipboard-guide");
  head.append(help, settings, close);
  stackEl.appendChild(head);

  const guide = document.createElement("div");
  guide.className = "clip-guide"; guide.id = "clipboard-guide"; guide.hidden = true;
  help.addEventListener("click", () => { guide.hidden = !guide.hidden; help.setAttribute("aria-expanded", String(!guide.hidden)); if (S.pendingReplace) requestAnimationFrame(S.pendingReplace); });
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
  search.placeholder = t("clip.search"); search.setAttribute("aria-label", t("clip.search"));
  search.value = clipStackQuery;
  search.addEventListener("input", () => {
    clipStackQuery = search.value;
    clearTimeout(S.clipSearchTimer);
    S.clipSearchTimer = setTimeout(() => renderClipboardList(grid, foot), 80);
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

  S.stackOpen = true;
  document.body.classList.add("stack-open");
  applyFrame();
  const placeStack = () => placeStackNear(tileEl);
  S.pendingReplace = placeStack;

  await renderClipboardList(grid, foot);
  // Closed (second click, Escape, blur) while the list loaded: stay closed.
  if (!S.stackOpen || !stackEl.contains(grid)) return;
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
  if (seq !== clipRenderSeq || !S.stackOpen) return;
  const rawCount = items.length;
  const q = clipStackQuery.trim().toLowerCase();
  if (q) {
    items = items.filter((entry) => (entry.text || "").toLowerCase().includes(q));
  }
  grid.innerHTML = "";
  foot.innerHTML = "";
  grid.classList.toggle("compact", !!S.cfg.clipboardCompact || rawCount > 18);
  if (!S.stackOpen) return; // closed while we were awaiting
  if (!items.length) {
    grid.innerHTML = `<div class="stack-empty">${q ? t("clip.noMatches") : t("clip.empty")}</div>`;
    if (S.pendingReplace) requestAnimationFrame(S.pendingReplace);
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
      // Keys on the button must not also reach the row's copy shortcut.
      b.addEventListener("keydown", (ev) => ev.stopPropagation());
      acts.appendChild(b);
    };
    act("star", entry.favorite ? t("clip.unfavorite") : t("clip.favorite"), () => clipAction(async () => {
      await dockApi.clipboardFavorite(entry.id, !entry.favorite);
      await renderClipboardList(grid, foot);
    }));
    act(entry.private ? "lock" : "eye-off", entry.private ? t("clip.makePersistent") : t("clip.private"), () => clipAction(async () => {
      await dockApi.clipboardPrivate(entry.id, !entry.private);
      await renderClipboardList(grid, foot);
    }));
    act("pencil", t("clip.edit"), () => startClipEdit(row, entry, grid, foot));
    act("trash", t("clip.delete"), () => clipAction(async () => {
      await dockApi.clipboardDelete(entry.id);
      refreshClipboard();
      await renderClipboardList(grid, foot);
    }));
    row.appendChild(acts);

    const copy = () => clipAction(async () => {
      await dockApi.clipboardCopy(entry.text);
      refreshClipboard();
      row.classList.add("copied");
      setTimeout(() => row.classList.remove("copied"), 700);
    }, "overhaul.failed");
    // Clicks inside the edit box place the caret; they must not copy.
    row.addEventListener("click", () => { if (!row.classList.contains("editing")) copy(); });
    row.addEventListener("keydown", (ev) => {
      if (ev.target !== row || (ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault();
      copy();
    });
    grid.appendChild(row);
  });

  const clear = document.createElement("button");
  clear.className = "clip-clear";
  clear.textContent = t("clip.clear");
  clear.addEventListener("click", () => clipAction(async () => {
    await dockApi.clipboardClear();
    refreshClipboard();
    await renderClipboardList(grid, foot);
  }));
  foot.appendChild(clear);
  const meta = document.createElement("div");
  meta.className = "clip-meta";
  meta.textContent = t("clip.countHint").replace("{n}", rawCount);
  foot.appendChild(meta);
  if (S.pendingReplace) requestAnimationFrame(S.pendingReplace);
}

// A clipboard command that fails (history locked, IPC error) says so in the
// toast instead of becoming an unhandled rejection.
async function clipAction(fn, messageKey = "status.saveError") {
  try {
    await fn();
  } catch (error) {
    logMessage("error", `clipboard action failed: ${error}`);
    showErrorToast(t(messageKey));
  }
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
    await clipAction(async () => {
      if (v) { await dockApi.clipboardCopy(v); refreshClipboard(); }
      await renderClipboardList(grid, foot);
    });
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
