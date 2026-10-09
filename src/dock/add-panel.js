/* The add panel: the one place to put things on the dock.
 *
 * Before this, adding meant a bare file picker from the context menu, a row of
 * widget chips in another menu, and Start-menu suggestions that only existed
 * inside Settings. The panel brings them together in the dock's own flyout:
 * a search box, the apps you have open right now (the likeliest thing you
 * want to pin), every installed app, and the widget gallery. Items already on
 * the dock are marked instead of offered twice, and the panel stays open so
 * several things can be added in one go.
 *
 * The matching and candidate logic is exported and pure, so it is tested
 * without a browser; buildAddPanel() only draws and wires events. Everything
 * that touches config or the backend arrives through `deps`.
 */
import { icon } from "../icons.js";
import { WIDGET_ORDER, WIDGET_GLYPHS } from "../widgets-meta.js";

/** Most rows drawn at once; typing narrows the list long before this matters. */
const MAX_ROWS = 80;

import { matchScore, appKey, pinnedKeys, candidateSections, appCategory } from "./app-candidates.js";
export { norm, matchScore, baseTitle, pinnedKeys, runningCandidates, installedCandidates, frequentCandidates, rank } from "./app-candidates.js";


/**
 * Draw the panel into `root` (the flyout element) and wire it.
 * @param {HTMLElement} root
 * @param {object} deps
 * @param {(key: string) => string} deps.t
 * @param {() => object[]} deps.pinned            current pinned items
 * @param {() => Promise<object[]>} deps.listWindows
 * @param {() => Promise<object[]>} deps.listInstalled
 * @param {() => Promise<object[]>} deps.listFrequent   most used apps, most used first
 * @param {() => void} [deps.invalidateIcons]     retry failed extraction on refresh
 * @param {(path: string) => Promise<string|null>} deps.appIcon
 * @param {(type: string) => string} deps.widgetLabel
 * @param {(type: string) => boolean} deps.widgetPresent
 * @param {(path: string) => Promise<void>} deps.addPath
 * @param {(type: string) => Promise<void>} deps.addWidget
 * @param {() => void} deps.browseFile
 * @param {() => void} deps.browseFolder
 * @param {() => void} deps.close
 * @param {() => void} deps.relayout             re-place the flyout after its size changed
 * @param {"apps"|"widgets"} [deps.tab]
 */
export function buildAddPanel(root, deps) {
  const { t } = deps;
  let tab = deps.tab || "apps";
  let query = "";
  let running = [];
  let installed = [];
  let frequent = [];
  let loaded = false;
  let disposed = false;
  let identities = {};
  let failures = false;
  let rowLimit = MAX_ROWS;
  let utilityLimit = MAX_ROWS;
  let utilitiesOpen = false;
  let loadGeneration = 0;

  root.innerHTML = "";
  const head = el("div", "stack-head add-head");
  const searchWrap = el("label", "add-search");
  searchWrap.innerHTML = icon("search");
  const search = el("input");
  search.type = "search";
  search.placeholder = t("add.search");
  search.setAttribute("aria-label", t("add.search"));
  searchWrap.appendChild(search);
  const close = el("button", "stack-close");
  close.type = "button";
  close.title = t("stack.close");
  close.setAttribute("aria-label", t("stack.close"));
  close.innerHTML = icon("x");
  close.addEventListener("click", () => deps.close());
  const refresh = el("button", "stack-close add-refresh");
  refresh.type = "button";
  refresh.title = t("apps.refresh");
  refresh.setAttribute("aria-label", t("apps.refresh"));
  refresh.innerHTML = icon("refresh");
  refresh.addEventListener("click", () => { deps.invalidateIcons?.(); load(); });
  head.append(searchWrap, refresh, close);

  const tabs = el("div", "add-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", t("dock.emptyAdd"));
  const tabBtn = (id, label) => {
    const b = el("button", "add-tab");
    b.type = "button";
    b.dataset.tab = id;
    b.id = `add-tab-${id}`;
    b.setAttribute("aria-controls", "add-results");
    b.setAttribute("role", "tab");
    b.textContent = label;
    b.addEventListener("click", () => {
      tab = id;
      draw();
      search.focus();
    });
    return b;
  };
  tabs.append(tabBtn("apps", t("add.apps")), tabBtn("widgets", t("m.widgets")));

  tabs.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const buttons = [...tabs.children];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });
  const body = el("div", "add-body");
  body.id = "add-results";
  body.setAttribute("role", "tabpanel");
  const foot = el("div", "add-foot");
  const footBtn = (glyph, label, fn) => {
    const b = el("button", "add-foot-btn");
    b.type = "button";
    b.innerHTML = `${icon(glyph)}<span></span>`;
    b.lastChild.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  foot.append(
    footBtn("folder-plus", t("m.addFolder"), () => deps.browseFolder()),
    footBtn("app", t("add.browse"), () => deps.browseFile()),
  );
  root.append(head, tabs, body, foot);

  search.addEventListener("input", () => {
    query = search.value;
    rowLimit = MAX_ROWS;
    utilityLimit = MAX_ROWS;
    draw();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = body.querySelector(".add-row.active, .add-wcell.active");
      if (active) active.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      deps.close();
    }
  });

  function moveActive(step) {
    const rows = [...body.querySelectorAll(".add-row:not(.pinned), .add-wcell:not(.pinned)")].filter(row => row.checkVisibility());
    if (!rows.length) return;
    const cur = rows.findIndex((r) => r.classList.contains("active"));
    const next = rows[cur < 0 ? (step > 0 ? 0 : rows.length - 1) : (cur + step + rows.length) % rows.length];
    rows.forEach((r) => r.classList.remove("active"));
    next.classList.add("active");
    next.scrollIntoView({ block: "nearest" });
  }

  function draw() {
    if (disposed) return;
    observer?.disconnect();
    for (const b of tabs.children) {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    body.setAttribute("aria-labelledby", `add-tab-${tab}`);
    body.setAttribute("aria-busy", String(!loaded));
    body.innerHTML = "";
    if (tab === "widgets") drawWidgets();
    else drawApps();
    const first = body.querySelector(".add-row:not(.pinned), .add-wcell:not(.pinned)");
    if (first && query.trim()) first.classList.add("active");
    deps.relayout();
  }

  function drawApps() {
    if (!loaded) {
      for (let i = 0; i < 6; i++) body.appendChild(el("div", "add-row add-skel"));
      return;
    }
    const sections = candidateSections({ used: frequent, running, groups: installed }, pinnedKeys(deps.pinned(), identities), query, identities);
    const top = sections.frequent, open = sections.running;
    const all = sections.installed.filter(item => appCategory(item, identities) !== 'utilities');
    const utilities = sections.utilities;
    if (failures) { const note = emptyNote(t("overhaul.partialApps")); note.setAttribute("role", "status"); body.appendChild(note); }
    if (!top.length && !open.length && !all.length && !utilities.length) {
      body.appendChild(emptyNote(t("add.none")));
      return;
    }
    let budget = rowLimit;
    if (top.length) {
      body.appendChild(label(t("add.frequent")));
      for (const c of top) body.appendChild(appRow(c));
      budget -= top.length;
    }
    if (open.length) {
      body.appendChild(label(t("add.running")));
      for (const c of open.slice(0, budget)) body.appendChild(appRow(c));
      budget = Math.max(0, budget - open.length);
    }
    if (all.length && budget > 0) {
      body.appendChild(label(t("add.all")));
      for (const c of all.slice(0, budget)) body.appendChild(appRow(c));
    }
    if (top.length + open.length + all.length > rowLimit) {
      const more = el("button", "add-foot-btn"); more.type = "button"; more.textContent = t("overhaul.loadMore");
      more.addEventListener("click", () => { rowLimit += MAX_ROWS; draw(); }); body.appendChild(more);
    }
    if (utilities.length) {
      const fold = el("details", "add-utilities");
      fold.open = utilitiesOpen || !!query.trim();
      const summary = el("summary"); summary.textContent = `${t("design.systemApps")} · ${utilities.length}`;
      fold.append(summary);
      for (const candidate of utilities.slice(0, utilityLimit)) fold.append(appRow(candidate));
      if (utilities.length > utilityLimit) {
        const more = el("button", "add-foot-btn"); more.type = "button"; more.textContent = t("overhaul.loadMore");
        more.addEventListener("click", () => { utilityLimit += MAX_ROWS; utilitiesOpen = true; draw(); }); fold.append(more);
      }
      fold.addEventListener("toggle", () => {
        if (!fold.isConnected || disposed) return;
        if (!query.trim()) utilitiesOpen = fold.open;
        deps.relayout();
      });
      body.append(fold);
    }
    loadIcons();
  }

  function showSaveError() {
    if (disposed) return;
    body.querySelector(".add-error")?.remove();
    const error = emptyNote(t("overhaul.failed")); error.classList.add("add-error"); error.setAttribute("role", "alert"); body.prepend(error);
    deps.relayout();
  }

  function drawWidgets() {
    const types = WIDGET_ORDER.filter((w) => matchScore(deps.widgetLabel(w), query) > 0);
    if (!types.length) {
      body.appendChild(emptyNote(t("add.none")));
      return;
    }
    const grid = el("div", "add-wgrid");
    for (const type of types) {
      const pinned = deps.widgetPresent(type);
      const cell = el("button", "add-wcell" + (pinned ? " pinned" : ""));
      cell.type = "button";
      cell.innerHTML = `<span class="add-wglyph">${icon(WIDGET_GLYPHS[type] || "sparkles")}</span><span class="add-wname"></span><span class="add-state"></span>`;
      cell.querySelector(".add-wname").textContent = deps.widgetLabel(type);
      markState(cell, pinned);
      cell.addEventListener("click", async () => {
        if (cell.classList.contains("pinned")) return;
        body.querySelector(".add-error")?.remove();
        cell.disabled = true;
        try { await deps.addWidget(type); } catch (_) { cell.disabled = false; showSaveError(); return; }
        if (disposed) return;
        cell.classList.add("pinned");
        markState(cell, true);
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);
  }

  function isAlreadyPinned(c) { return c.pinned || pinnedKeys(deps.pinned(), identities).has(appKey(c, identities)); }

  function appRow(c) {
    const row = el("button", "add-row" + (c.pinned ? " pinned" : ""));
    row.type = "button";
    row.dataset.path = c.path;
    row.innerHTML = `<span class="add-ico"></span><span class="add-name"></span><span class="add-state"></span>`;
    row.querySelector(".add-name").textContent = c.name;
    const ico = row.querySelector(".add-ico");
    ico.textContent = (c.name[0] || "?").toUpperCase();
    markState(row, c.pinned);
    row.addEventListener("click", async () => {
      if (isAlreadyPinned(c)) return;
      body.querySelector(".add-error")?.remove();
      row.disabled = true;
      try { await deps.addPath(c.path); } catch (_) { row.disabled = false; showSaveError(); return; }
      if (disposed) return;
      c.pinned = true;
      row.classList.add("pinned");
      row.classList.remove("active");
      markState(row, true);
    });
    return row;
  }

  function markState(node, pinned) {
    const state = node.querySelector(".add-state");
    state.innerHTML = pinned ? `${icon("check")}<span></span>` : icon("plus");
    if (pinned) state.lastChild.textContent = t("add.added");
    node.setAttribute("aria-disabled", String(!!pinned));
    if (node.classList.contains("add-row")) node.setAttribute("aria-label", `${t(pinned ? "add.added" : "workspace.addApp")}: ${node.querySelector(".add-name").textContent}`);
  }

  // Extract icons only for rows scrolled into view.
  let observer = null;
  function loadIcons() {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          observer.unobserve(e.target);
          const path = e.target.dataset.path;
          deps
            .appIcon(path)
            .then((uri) => {
              if (!uri || disposed || !e.target.isConnected) return;
              const ico = e.target.querySelector(".add-ico");
              if (ico) ico.replaceChildren(img(uri, () => { ico.textContent = (e.target.querySelector(".add-name").textContent[0] || "?").toUpperCase(); }));
            })
            .catch(() => {});
        }
      },
      { root: body },
    );
    for (const row of body.querySelectorAll(".add-row[data-path]")) {
      observer.observe(row);
    }
  }

  async function load() {
    if (disposed) return;
    const request = ++loadGeneration;
    loaded = false;
    refresh.disabled = true;
    if (tab === "apps") draw();
    const results = await Promise.allSettled([deps.listWindows(), deps.listInstalled(), deps.listFrequent ? deps.listFrequent() : Promise.resolve([])]);
    if (disposed || request !== loadGeneration) return;
    const value = (i) => results[i].status === "fulfilled" ? results[i].value || [] : [];
    running = value(0); installed = value(1); frequent = value(2);
    failures = results.some((r) => r.status === "rejected");
    const paths = [...new Set([...running.map((w) => w.exe), ...installed.flatMap((g) => g.items.map((i) => i.path)), ...frequent.map((u) => u.path), ...deps.pinned().map((p) => p.path)].filter(Boolean))];
    if (deps.identities) identities = await deps.identities(paths).then((v) => v || {}).catch(() => ({}));
    if (disposed || request !== loadGeneration) return;
    refresh.disabled = false;
    loaded = true;
    if (tab === "apps") draw();
  }

  draw();
  load();
  return {
    focus: () => { if (!disposed) search.focus(); },
    refreshPins: draw,
    dispose: () => { disposed = true; loadGeneration++; observer?.disconnect(); },
  };
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function img(src, onError) {
  const i = document.createElement("img");
  i.addEventListener("error", onError, { once: true });
  i.src = src;
  i.alt = "";
  i.draggable = false;
  return i;
}
function label(text) {
  const node = el("div", "add-label");
  node.textContent = text;
  return node;
}
function emptyNote(text) {
  const node = el("div", "stack-empty");
  node.textContent = text;
  return node;
}
