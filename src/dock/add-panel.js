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

/** Lowercase, accents stripped: "Música" matches "musica". */
export function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** 3 = name starts with the query, 2 = a word does, 1 = contains it, 0 = no match. */
export function matchScore(name, query) {
  const q = norm(query).trim();
  if (!q) return 1;
  const n = norm(name);
  if (n.startsWith(q)) return 3;
  if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}

/** File name without folder or extension. */
export function baseTitle(path) {
  const file = String(path || "").split(/[\\/]/).pop() || "";
  return file.replace(/\.(exe|lnk|url|appref-ms)$/i, "");
}

/** Keys that identify something already on the dock: full paths and names. */
export function pinnedKeys(pinned) {
  const keys = new Set();
  const walk = (items) => {
    for (const it of items || []) {
      if (it.path) keys.add(norm(it.path));
      if (it.name) keys.add(norm(it.name));
      if (it.path) keys.add(norm(baseTitle(it.path)));
      if (it.children) walk(it.children);
    }
  };
  walk(pinned);
  return keys;
}

export function isPinned(keys, path, name) {
  return keys.has(norm(path)) || keys.has(norm(name)) || keys.has(norm(baseTitle(path)));
}

/** Windows that are open now, one per executable, minus Booki and the shell. */
export function runningCandidates(windows, keys) {
  const seen = new Set();
  const out = [];
  for (const w of windows || []) {
    const exe = String(w.exe || "");
    if (!exe) continue;
    const id = norm(exe);
    if (seen.has(id)) continue;
    seen.add(id);
    const title = baseTitle(exe);
    if (/^(booki|explorer|applicationframehost|searchhost|shellexperiencehost|textinputhost)$/i.test(title)) continue;
    out.push({ name: prettyName(title), path: exe, pinned: isPinned(keys, exe, title) });
  }
  return out.sort((a, b) => Number(a.pinned) - Number(b.pinned) || a.name.localeCompare(b.name));
}

/** "chrome" → "Chrome"; names that already carry capitals are left alone. */
function prettyName(title) {
  return title && title === title.toLowerCase() ? title[0].toUpperCase() + title.slice(1) : title;
}

/** Most used apps not on the dock yet, in usage order (pinned ones dropped). */
export function frequentCandidates(used, keys, max = 6) {
  return (used || [])
    .map((u) => ({ name: u.name, path: u.path, pinned: isPinned(keys, u.path, u.name) }))
    .filter((c) => c.path && !c.pinned)
    .slice(0, max);
}

/** Flatten Start-menu groups into one sorted list without duplicates. */
export function installedCandidates(groups, keys) {
  const seen = new Set();
  const out = [];
  for (const g of groups || []) {
    for (const it of g.items || []) {
      const id = norm(it.name);
      if (!it.path || seen.has(id)) continue;
      seen.add(id);
      out.push({ name: it.name, path: it.path, pinned: isPinned(keys, it.path, it.name) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Filter and rank a candidate list for a query. */
export function rank(list, query) {
  if (!norm(query).trim()) return [...list];
  return list
    .map((c) => ({ c, s: matchScore(c.name, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}

// Icons are extracted by the shell, which is slow enough to notice; keep them
// for the life of the dock window.
const iconCache = new Map();

/**
 * Draw the panel into `root` (the flyout element) and wire it.
 * @param {HTMLElement} root
 * @param {object} deps
 * @param {(key: string) => string} deps.t
 * @param {() => object[]} deps.pinned            current pinned items
 * @param {() => Promise<object[]>} deps.listWindows
 * @param {() => Promise<object[]>} deps.listInstalled
 * @param {() => Promise<object[]>} deps.listFrequent   most used apps, most used first
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
  let rowLimit = MAX_ROWS;

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
  close.innerHTML = icon("x");
  close.addEventListener("click", () => deps.close());
  head.append(searchWrap, close);

  const tabs = el("div", "add-tabs");
  tabs.setAttribute("role", "tablist");
  const tabBtn = (id, label) => {
    const b = el("button", "add-tab");
    b.type = "button";
    b.dataset.tab = id;
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

  const body = el("div", "add-body");
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
    const rows = [...body.querySelectorAll(".add-row:not(.pinned), .add-wcell:not(.pinned)")];
    if (!rows.length) return;
    const cur = rows.findIndex((r) => r.classList.contains("active"));
    const next = rows[(cur + step + rows.length) % rows.length];
    rows.forEach((r) => r.classList.remove("active"));
    next.classList.add("active");
    next.scrollIntoView({ block: "nearest" });
  }

  function draw() {
    for (const b of tabs.children) {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    }
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
    const top = rank(frequent, query);
    const open = rank(running, query);
    const all = rank(installed, query);
    if (!top.length && !open.length && !all.length) {
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
      budget -= open.length;
    }
    if (all.length && budget > 0) {
      body.appendChild(label(t("add.all")));
      for (const c of all.slice(0, budget)) body.appendChild(appRow(c));
    }
    if (top.length + open.length + all.length > rowLimit) {
      const more = el("button", "add-foot-btn"); more.type = "button"; more.textContent = t("overhaul.loadMore");
      more.addEventListener("click", () => { rowLimit += MAX_ROWS; draw(); }); body.appendChild(more);
    }
    loadIcons();
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
        cell.disabled = true;
        try { await deps.addWidget(type); } catch (_) { cell.disabled = false; const error = emptyNote(t("overhaul.failed")); error.setAttribute("role", "alert"); body.prepend(error); return; }
        cell.classList.add("pinned");
        markState(cell, true);
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);
  }

  function appRow(c) {
    const row = el("button", "add-row" + (c.pinned ? " pinned" : ""));
    row.type = "button";
    row.dataset.path = c.path;
    row.innerHTML = `<span class="add-ico"></span><span class="add-name"></span><span class="add-state"></span>`;
    row.querySelector(".add-name").textContent = c.name;
    const ico = row.querySelector(".add-ico");
    const cached = iconCache.get(c.path);
    if (cached) ico.appendChild(img(cached));
    else ico.textContent = (c.name[0] || "?").toUpperCase();
    markState(row, c.pinned);
    row.addEventListener("click", async () => {
      if (c.pinned) return;
      row.disabled = true;
      try { await deps.addPath(c.path); } catch (_) { row.disabled = false; const error = emptyNote(t("overhaul.failed")); error.setAttribute("role", "alert"); body.prepend(error); return; }
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
          if (iconCache.has(path)) continue;
          deps
            .appIcon(path)
            .then((uri) => {
              if (!uri) return;
              iconCache.set(path, uri);
              const ico = e.target.querySelector(".add-ico");
              if (ico) ico.replaceChildren(img(uri));
            })
            .catch(() => {});
        }
      },
      { root: body },
    );
    for (const row of body.querySelectorAll(".add-row[data-path]")) {
      if (!iconCache.has(row.dataset.path)) observer.observe(row);
    }
  }

  async function load() {
    const keys = pinnedKeys(deps.pinned());
    const [wins, groups, used] = await Promise.all([
      deps.listWindows().catch(() => []),
      deps.listInstalled().catch(() => []),
      (deps.listFrequent ? deps.listFrequent() : Promise.resolve([])).catch(() => []),
    ]);
    frequent = frequentCandidates(used, keys);
    // Each app appears once: most used wins, then open now, then the rest.
    const shown = new Set(frequent.map((c) => norm(c.name)));
    running = runningCandidates(wins, keys).filter((c) => !shown.has(norm(c.name)));
    running.forEach((c) => shown.add(norm(c.name)));
    installed = installedCandidates(groups, keys).filter((c) => !shown.has(norm(c.name)));
    loaded = true;
    if (tab === "apps") draw();
  }

  draw();
  load();
  return {
    focus: () => search.focus(),
  };
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function img(src) {
  const i = document.createElement("img");
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
