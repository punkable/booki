/* The #stack flyout beside the bar: folder and group contents, the add panel and
   the quick launcher. */

import { dock as dockApi } from "../api.js";
import { icon } from "../icons.js";
import { emo } from "../emoji.js";
import { libGlyphSVG } from "../icon-library.js";
import { t } from "../i18n.js";
import { placeBesideBar, transformOrigin } from "./placement.js";
import { groupAppearance } from "../group-style.js";
import { createFolderNavigation } from "./folder-navigation.js";
import { buildAddPanel } from "./add-panel.js";
import { buildLauncher } from "./launcher.js";
import { S } from "./state.js";
import { isVertical, widgetLabel, syncIcon, resolveIcon, menuPinTitle } from "./helpers.js";
import { dockEl, esc, stackEl } from "./dom.js";
import { reframe, applyFrame } from "./frame.js";
import { cacheWidgetEls, widgetPresent, syncPolls } from "./live-widgets.js";
import { scheduleHide } from "./autohide.js";
import { closeMenu } from "./menu-core.js";
import { widgetTile } from "./render.js";
import { closeProductivityPanel } from "./widget-editors.js";
import { addWidget, onAddApp, onAddFolder, addPaths, renameGroup } from "./pin-ops.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireStack(fns) { Object.assign(deps, fns); }

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
export async function toggleStack(tileEl, item) {
  if (S.stackOpen && S.stackItemId === item.id) {
    closeStack();
    return;
  }
  if (S.stackOpen) closeStack();
  await openStack(tileEl, item);
}

export async function openStack(tileEl, item) {
  if (S.stackOpen && S.stackItemId === item.id) return;
  if (S.stackOpen) closeStack();
  if (S.productivityPanel) closeProductivityPanel();
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
    clearStackTint();
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
    // Adding lives in the header, as quiet icon buttons, so the grid holds
    // only the group's own apps and nothing competes with them.
    for (const [glyphName, label, kind] of [["plus", t("apps.addToFolder"), "app"], ["folder-plus", t("m.addFolder"), "folder"]]) {
      const add = document.createElement("button");
      add.type = "button"; add.className = "stack-close stack-head-add";
      add.innerHTML = icon(glyphName); add.title = label; add.setAttribute("aria-label", label);
      add.addEventListener("click", (ev) => { ev.stopPropagation(); deps.addToFolderFromDock(item, kind); });
      head.appendChild(add);
    }
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
        deps.wireStackDragOut(wCell, item, it);
        wCell.appendChild(deps.takeOutButton(item, it));
        grid.appendChild(wCell);
        continue;
      }
      const cell = document.createElement("button");
      let holder = null; // wrapper that also holds the take-out button
      cell.className = "stack-item";
      if (isGroup && it.id) cell.dataset.childId = it.id;
      cell.style.setProperty("--i", Math.min(cellIdx++, 6)); // staggered entry (capped)
      cell.title = it.name;
      cell.addEventListener("contextmenu", (e) => deps.openFileMenu(e, it, isGroup ? item : null, () => navigateFolder?.({ path: it.path, name: it.name })));
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
      cell.title = it.name || "";
      // Booki's own Settings pin reads and looks like Settings inside a group,
      // not like a folder called "Booki".
      const settingsPin = isGroup && it.kind === "action" && !it.icon;
      if (isGroup && it.kind === "action") {
        const title = menuPinTitle(it);
        cell.title = title;
        cell.querySelector(".stack-name").textContent = title;
      }
      if (settingsPin) cell.querySelector(".stack-glyph, img").outerHTML = `<span class="stack-glyph action-glyph">${icon("settings")}</span>`;
      else if (!now) {
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
        deps.wireStackDragOut(cell, item, it);
        // The take-out control is a real button, so it sits beside the cell
        // button (a button inside a button is invalid and unreachable by Tab).
        holder = document.createElement("div");
        holder.className = "stack-cell";
        holder.append(cell, deps.takeOutButton(item, it));
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
    if (!isGroup && items.length >= 80) {
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
export function placeStackNear(tileEl) {
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
/** Drop a group's colour so the next flyout (clipboard, add, launcher)
    doesn't inherit it. */
export function clearStackTint() {
  stackEl.style.removeProperty("--group-color");
  stackEl.classList.remove("tinted");
}

export function openAddPanel(anchorEl = dockEl, tab = "apps") {
  if (S.stackOpen) closeStack();
  clearStackTint();
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
export function openLauncher() {
  if (S.stackOpen && S.stackItemId === "__launcher") { closeStack(); return; }
  if (S.stackOpen) closeStack();
  closeMenu();
  clearStackTint();
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
export function closeStack() {
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
