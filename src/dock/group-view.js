import { icon } from "../icons.js";
import { widgetDisplayName } from "../widgets-meta.js";
import { t } from "../i18n.js";
import { S } from "./state.js";
import { persist } from "./config-sync.js";
import { scheduleHitReport } from "./hit-regions.js";

const sessions = new Map();
export const GROUP_VIEWS = ["list", "small", "medium", "large"];
const norm = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
export function filterGroup(children, query) { const q = norm(query).trim(); return children.filter((item) => norm([item.name, item.widget ? widgetDisplayName(item.widget, t) : "", item.path].filter(Boolean).join(" ")).includes(q)); }

/* Filtering hides existing cells, retaining widget listeners and sensor polls.
   Ctrl+wheel changes density, like Explorer; ordinary wheel stays scrolling. */
export function enhanceGroupView(stack, grid, item) {
  const toolbar = document.createElement("div"); toolbar.className = "group-toolbar";
  const search = document.createElement("input"); search.type = "search"; search.maxLength = 256;
  const previous = sessions.get(item.id);
  search.value = previous?.query || "";
  search.placeholder = t("refine.searchGroup"); search.setAttribute("aria-label", t("refine.searchGroup"));
  // A Fluent drop-down drawn inside the group, not a native <select>: Windows
  // draws a native list outside the dock window, at its own width, and
  // picking from it took focus away and closed the group being edited.
  const select = document.createElement("button"); select.type = "button"; select.className = "group-view-button";
  select.setAttribute("aria-haspopup", "listbox"); select.setAttribute("aria-expanded", "false");
  select.setAttribute("aria-label", t("refine.groupView")); select.title = t("refine.viewHint");
  const selectText = document.createElement("span"); selectText.className = "group-view-value";
  const chevron = document.createElement("span"); chevron.className = "group-view-chevron"; chevron.innerHTML = icon("chevron-down"); chevron.setAttribute("aria-hidden", "true");
  select.append(selectText, chevron);
  const list = document.createElement("div"); list.className = "group-view-list"; list.setAttribute("role", "listbox"); list.hidden = true;
  list.setAttribute("aria-label", t("refine.groupView"));
  const options = GROUP_VIEWS.map((value) => {
    const option = document.createElement("div"); option.className = "group-view-option"; option.setAttribute("role", "option"); option.tabIndex = -1;
    option.dataset.value = value; option.textContent = t(`refine.${value}`);
    option.addEventListener("click", (event) => { event.stopPropagation(); changed(value); closeList(true); });
    list.append(option); return option;
  });
  const away = (event) => { if (!viewField.contains(event.target) && !list.contains(event.target)) closeList(false); };
  const openList = () => {
    // Lives on the page while open, so a short group can't clip it; placed
    // under its field and exactly as wide.
    const r = viewField.getBoundingClientRect();
    document.body.append(list);
    // Keep the group's own ink and surfaces (a tinted glass adjusts them).
    const look = getComputedStyle(viewField);
    for (const name of ["--ink", "--ink-2", "--layer-strong", "--stroke-flyout", "--hover", "--focus-ring", "--accent", "--bg"]) {
      const value = look.getPropertyValue(name); if (value) list.style.setProperty(name, value);
    }
    list.style.color = look.color;
    list.style.left = `${r.left}px`; list.style.width = `${r.width}px`;
    list.hidden = false;
    const below = r.bottom + 4, height = list.offsetHeight;
    list.style.top = `${below + height <= innerHeight - 8 ? below : Math.max(8, r.top - 4 - height)}px`;
    select.setAttribute("aria-expanded", "true"); scheduleHitReport();
    (options.find((o) => o.dataset.value === view) || options[0]).focus();
    document.addEventListener("pointerdown", away, true);
  };
  function closeList(refocus) {
    if (list.hidden) return;
    list.hidden = true; select.setAttribute("aria-expanded", "false");
    viewField.append(list); scheduleHitReport();
    document.removeEventListener("pointerdown", away, true);
    if (refocus) select.focus();
  }
  select.addEventListener("click", (event) => { event.stopPropagation(); list.hidden ? openList() : closeList(true); });
  select.addEventListener("keydown", (event) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); openList(); } });
  list.addEventListener("keydown", (event) => {
    const at = options.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) { event.preventDefault(); options[(at + step + options.length) % options.length].focus(); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); options[event.key === "Home" ? 0 : options.length - 1].focus(); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (at >= 0) { changed(options[at].dataset.value); closeList(true); } }
    else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); closeList(true); }
    else return;
    event.stopPropagation(); // Escape closes the list, not the group
  });
  let view = GROUP_VIEWS.includes(item.style?.groupView) ? item.style.groupView : "medium";
  let savedView = view;
  let timer;
  const setView = (next) => {
    view = next; grid.dataset.view = next; selectText.textContent = t(`refine.${next}`);
    for (const o of options) o.setAttribute("aria-selected", String(o.dataset.value === next));
  };
  const save = async () => {
    if (view === savedView) return;
    const live = S.cfg.pinned.find((pin) => pin.id === item.id);
    if (!live) return;
    const next = view;
    live.style = { ...live.style, groupView: next };
    if (await persist()) savedView = next;
    else if (view === next) setView(savedView);
  };
  const changed = (next) => { setView(next); clearTimeout(timer); timer = setTimeout(save, 350); };
  setView(view);
  const empty = document.createElement("p"); empty.className = "stack-empty group-no-matches"; empty.textContent = t("refine.noMatches"); empty.hidden = true;
  grid.append(empty);
  const applySearch = () => {
    const ids = new Set(filterGroup(item.children || [], search.value).map((child) => child.id));
    for (const cell of grid.children) {
      if (cell === empty || cell.classList.contains("stack-empty")) continue;
      const id = cell.dataset.childId || cell.querySelector("[data-child-id]")?.dataset.childId;
      cell.hidden = !ids.has(id);
    }
    empty.hidden = !search.value || ids.size > 0;
    const originalEmpty = grid.querySelector(".stack-empty:not(.group-no-matches)");
    if (originalEmpty) originalEmpty.hidden = !!search.value;
  };
  search.addEventListener("input", applySearch);
  applySearch();
  if (previous) requestAnimationFrame(() => { if (grid.isConnected) grid.scrollTop = previous.scroll || 0; });
  const keydown = (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); search.focus(); search.select(); }
    if (event.key === "Escape" && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ""; applySearch(); }
  };
  stack.addEventListener("keydown", keydown);
  grid.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.matches("input, textarea, select") || event.target.closest(".w-controls")) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const cells = [...grid.querySelectorAll(".stack-item")].filter((cell) => cell.offsetParent !== null);
    const current = event.target.closest(".stack-item");
    let index = cells.indexOf(current);
    if (!cells.length) return;
    event.preventDefault();
    if (index < 0 || event.key === "Home") index = 0;
    else if (event.key === "End") index = cells.length - 1;
    else if (["ArrowLeft", "ArrowRight"].includes(event.key) || view === "list") index += ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    else {
      const origin = current.getBoundingClientRect();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      let score = Infinity;
      cells.forEach((cell, candidate) => {
        const rect = cell.getBoundingClientRect();
        const delta = (rect.top - origin.top) * direction;
        const distance = delta * 4 + Math.abs(rect.left - origin.left);
        if (delta > 1 && distance < score) { index = candidate; score = distance; }
      });
    }
    const target = cells[Math.max(0, Math.min(cells.length - 1, index))];
    (target.matches("button") ? target : target.querySelector("button"))?.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  });
  let wheel = 0;
  grid.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault(); event.stopPropagation();
    wheel += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? grid.clientHeight : 1);
    if (Math.abs(wheel) < 60) return;
    const at = Math.max(0, Math.min(GROUP_VIEWS.length - 1, GROUP_VIEWS.indexOf(view) + (wheel < 0 ? 1 : -1)));
    changed(GROUP_VIEWS[at]); wheel = 0;
  }, { passive: false });
  const searchField = document.createElement("label"); searchField.className = "group-search-field";
  const searchIcon = document.createElement("span"); searchIcon.innerHTML = icon("search"); searchIcon.setAttribute("aria-hidden", "true");
  searchField.append(searchIcon, search);
  const viewField = document.createElement("div"); viewField.className = "group-view-field";
  const viewIcon = document.createElement("span"); viewIcon.innerHTML = icon("grid"); viewIcon.setAttribute("aria-hidden", "true");
  viewField.append(viewIcon, select, list);
  toolbar.append(searchField, viewField); stack.insertBefore(toolbar, grid);
  return () => {
    sessions.delete(item.id); sessions.set(item.id, { query: search.value, scroll: grid.scrollTop });
    while (sessions.size > 50) sessions.delete(sessions.keys().next().value);
    clearTimeout(timer); closeList(false); stack.removeEventListener("keydown", keydown); void save();
  };
}
