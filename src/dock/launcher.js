/* The quick launcher: a search box over the dock, opened by a global
 * shortcut, that opens any installed app, pinned item or open window.
 *
 * launcherResults() is pure (tested without a browser); buildLauncher() only
 * draws and wires events. Everything that touches the backend arrives
 * through `deps`, like the add panel it shares its look with.
 */
import { icon } from "../icons.js";
import { pinFallback } from "../pin-fallback.js";
import { baseTitle, matchScore, norm, pathKey } from "./app-candidates.js";

const LIMIT = 8;

/**
 * Ranked results for a query. Each result is
 * `{ kind: "window"|"pin"|"app", name, path, args, hwnd?, folder? }`.
 * An empty query lists what is most likely wanted: pinned items and the apps
 * used most. A typed query searches everything, preferring name prefixes,
 * then open windows, pinned and frequent items. Launchers are listed once per
 * path, and carry `hwnd` when the app already has a window.
 */
export function launcherResults({ pinned = [], installed = [], frequent = [], windows = [] }, query, limit = LIMIT) {
  const q = norm(query).trim();
  const out = new Map();
  const add = (entry, bonus) => {
    const score = q ? Math.max(matchScore(entry.name, q), Math.min(2, matchScore(baseTitle(entry.path), q))) : 1;
    if (!score || !entry.path) return;
    const key = entry.kind === "window" ? `w:${entry.hwnd}` : pathKey(entry.path);
    const total = score * 10 + bonus;
    const prev = out.get(key);
    if (!prev || prev.total < total) out.set(key, { ...entry, total });
  };
  const flat = [];
  const walk = (items) => { for (const item of items || []) { if (item.kind === "group") walk(item.children); else flat.push(item); } };
  walk(pinned);
  for (const item of flat) {
    if (item.kind !== "app" && item.kind !== "folder") continue;
    add({ kind: "pin", name: item.name || baseTitle(item.path), path: item.path, args: item.args || [], folder: item.kind === "folder" }, 4);
  }
  frequent.forEach((app, i) => add({ kind: "app", name: app.name, path: app.path, args: app.args || [] }, 3 - Math.min(2, i / 4)));
  if (q) {
    for (const group of installed) for (const item of group.items || []) {
      if (!item.is_dir) add({ kind: "app", name: item.name, path: item.path, args: item.args || [] }, 0);
    }
    for (const w of windows) {
      if (!w.exe || !w.title) continue;
      add({ kind: "window", name: w.title, path: w.exe, args: [], hwnd: w.hwnd }, 5);
    }
  }
  // An app that is already open carries its first window, so opening it can
  // switch there (when "focus if running" is on) instead of a second copy.
  const openByPath = new Map();
  for (const w of windows) if (w.exe && !openByPath.has(pathKey(w.exe))) openByPath.set(pathKey(w.exe), w.hwnd);
  return [...out.values()]
    .sort((a, b) => b.total - a.total || (q ? a.name.localeCompare(b.name) : 0))
    .slice(0, limit)
    .map(({ total: _total, ...rest }) => {
      if (rest.kind === "window" || rest.folder) return rest;
      const hwnd = openByPath.get(pathKey(rest.path));
      return hwnd ? { ...rest, hwnd } : rest;
    });
}

/**
 * Draw the launcher into `root` and wire it.
 * @param {HTMLElement} root
 * @param {object} deps
 * @param {(key: string) => string} deps.t
 * @param {() => object[]} deps.pinned
 * @param {() => Promise<object[]>} deps.listWindows
 * @param {() => Promise<object[]>} deps.listInstalled
 * @param {() => Promise<object[]>} deps.listFrequent
 * @param {(path: string) => Promise<string|null>} deps.appIcon
 * @param {boolean} deps.switchesToOpen  opening an open app goes to its window
 * @param {(entry: object) => void} deps.open      launch or switch, then close
 * @param {() => void} deps.close
 * @param {() => void} deps.relayout
 */
export function buildLauncher(root, deps) {
  const { t } = deps;
  let data = { pinned: deps.pinned(), installed: [], frequent: [], windows: [] };
  let results = [];
  let active = 0;
  let disposed = false;

  root.innerHTML = "";
  const head = el("div", "stack-head add-head");
  const searchWrap = el("label", "add-search");
  searchWrap.innerHTML = icon("search");
  const search = el("input");
  search.type = "search";
  search.placeholder = t("launcher.placeholder");
  search.setAttribute("aria-label", t("launcher.placeholder"));
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-expanded", "true");
  search.setAttribute("aria-controls", "launcher-results");
  search.autocomplete = "off";
  searchWrap.appendChild(search);
  const close = el("button", "stack-close");
  close.type = "button";
  close.title = t("stack.close");
  close.setAttribute("aria-label", t("stack.close"));
  close.innerHTML = icon("x");
  close.addEventListener("click", () => deps.close());
  head.append(searchWrap, close);

  const body = el("div", "add-body launcher-body");
  body.id = "launcher-results";
  body.setAttribute("role", "listbox");
  body.setAttribute("aria-label", t("launcher.title"));
  const hint = el("div", "launcher-hint");
  hint.textContent = t("launcher.hint");
  root.append(head, body, hint);

  search.addEventListener("input", draw);
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      markActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) deps.open(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      deps.close();
    }
  });

  function markActive() {
    [...body.children].forEach((row, i) => {
      row.classList.toggle("active", i === active);
      row.setAttribute("aria-selected", String(i === active));
      if (i === active) { row.scrollIntoView({ block: "nearest" }); search.setAttribute("aria-activedescendant", row.id); }
    });
  }

  function draw() {
    if (disposed) return;
    results = launcherResults(data, search.value);
    active = 0;
    body.innerHTML = "";
    if (!results.length) {
      const note = el("div", "stack-empty");
      note.textContent = search.value.trim() ? t("add.none") : t("launcher.empty");
      body.appendChild(note);
      search.removeAttribute("aria-activedescendant");
    }
    results.forEach((entry, i) => body.appendChild(row(entry, i)));
    markActive();
    deps.relayout();
  }

  function row(entry, i) {
    const node = el("div", "add-row launcher-row");
    node.id = `launcher-row-${i}`;
    node.setAttribute("role", "option");
    node.innerHTML = `<span class="add-ico"></span><span class="add-name"></span><span class="launcher-kind"></span>`;
    node.querySelector(".add-name").textContent = entry.name;
    node.querySelector(".launcher-kind").textContent = t(entry.kind === "window" || (entry.hwnd && deps.switchesToOpen) ? "launcher.switch" : entry.folder ? "launcher.folder" : "launcher.open");
    const ico = node.querySelector(".add-ico");
    const look = pinFallback({ name: entry.name, path: entry.path, kind: entry.folder ? "folder" : "app" });
    ico.classList.add("launcher-fallback");
    ico.style.setProperty("--fb-deep", look.deep);
    ico.style.setProperty("--fb-ink", look.ink);
    ico.textContent = look.letter;
    if (look.glyph) ico.innerHTML = icon(look.glyph);
    if (!entry.folder) {
      deps.appIcon(entry.path).then((uri) => {
        if (!uri || disposed || !node.isConnected) return;
        const img = document.createElement("img");
        img.alt = ""; img.draggable = false; img.src = uri;
        img.addEventListener("error", () => img.remove(), { once: true });
        ico.replaceChildren(img);
      }).catch(() => {});
    }
    node.addEventListener("pointerdown", (e) => e.preventDefault()); // keep focus in the search box
    node.addEventListener("click", () => deps.open(entry));
    node.addEventListener("pointermove", () => { if (active !== i) { active = i; markActive(); } });
    return node;
  }

  async function load() {
    const [windows, installed, frequent] = await Promise.allSettled([deps.listWindows(), deps.listInstalled(), deps.listFrequent()]);
    if (disposed) return;
    const value = (r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);
    data = { pinned: deps.pinned(), windows: value(windows), installed: value(installed), frequent: value(frequent) };
    draw();
  }

  draw();
  load();
  return {
    focus: () => { if (!disposed) search.focus(); },
    dispose: () => { disposed = true; },
  };
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
