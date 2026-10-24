import { icon } from "../icons.js";
import { widgetDisplayName } from "../widgets-meta.js";
import { t } from "../i18n.js";
import { S } from "./state.js";
import { persist } from "./config-sync.js";

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
  const select = document.createElement("select"); select.setAttribute("aria-label", t("refine.groupView")); select.title = t("refine.viewHint");
  GROUP_VIEWS.forEach((value) => select.append(new Option(t(`refine.${value}`), value)));
  let view = GROUP_VIEWS.includes(item.style?.groupView) ? item.style.groupView : "medium";
  let savedView = view;
  let timer;
  const setView = (next) => { view = next; grid.dataset.view = next; select.value = next; };
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
  select.addEventListener("change", () => changed(select.value)); setView(view);
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
  const viewField = document.createElement("label"); viewField.className = "group-view-field";
  const viewIcon = document.createElement("span"); viewIcon.innerHTML = icon("grid"); viewIcon.setAttribute("aria-hidden", "true");
  viewField.append(viewIcon, select);
  toolbar.append(searchField, viewField); stack.insertBefore(toolbar, grid);
  return () => {
    sessions.delete(item.id); sessions.set(item.id, { query: search.value, scroll: grid.scrollTop });
    while (sessions.size > 50) sessions.delete(sessions.keys().next().value);
    clearTimeout(timer); stack.removeEventListener("keydown", keydown); void save();
  };
}
