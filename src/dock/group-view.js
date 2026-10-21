import { t } from "../i18n.js";
import { S } from "./state.js";
import { persist } from "./config-sync.js";

export const GROUP_VIEWS = ["list", "small", "medium", "large"];
const norm = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
export function filterGroup(children, query) { const q = norm(query).trim(); return children.filter((item) => norm(item.name || item.widget || item.path).includes(q)); }

/* Filtering hides existing cells, retaining widget listeners and sensor polls.
   Ctrl+wheel changes density, like Explorer; ordinary wheel stays scrolling. */
export function enhanceGroupView(stack, grid, item) {
  const toolbar = document.createElement("div"); toolbar.className = "group-toolbar";
  const search = document.createElement("input"); search.type = "search"; search.maxLength = 256;
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
    else setView(savedView);
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
  };
  search.addEventListener("input", applySearch);
  const keydown = (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); search.focus(); search.select(); }
    if (event.key === "Escape" && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ""; applySearch(); }
  };
  stack.addEventListener("keydown", keydown);
  let wheel = 0;
  grid.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault(); event.stopPropagation();
    wheel += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? grid.clientHeight : 1);
    if (Math.abs(wheel) < 60) return;
    const at = Math.max(0, Math.min(GROUP_VIEWS.length - 1, GROUP_VIEWS.indexOf(view) + (wheel < 0 ? 1 : -1)));
    changed(GROUP_VIEWS[at]); wheel = 0;
  }, { passive: false });
  toolbar.append(search, select); stack.insertBefore(toolbar, grid);
  return () => { clearTimeout(timer); stack.removeEventListener("keydown", keydown); void save(); };
}
