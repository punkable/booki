/* A WinUI 3 ComboBox drop-down for a native <select>.

   The <select> stays the real control: its value, change events, keyboard
   arrows and accessibility are untouched. Only opening it changes: instead
   of the system's flat list, a rounded acrylic list opens with the chosen
   item marked by an accent pill, keyboard navigation and a short fade.
   Works the same in the dock (plain DOM) and in Settings (React). */
const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
let openPop = null;

function closePop(restoreFocus = true) {
  if (!openPop) return;
  const { pop, select, cleanup } = openPop;
  openPop = null;
  cleanup();
  pop.classList.add("is-closing");
  setTimeout(() => pop.remove(), 120);
  if (restoreFocus && select.isConnected) select.focus({ preventScroll: true });
}

function choose(select, value) {
  if (select.value !== value) {
    valueSetter.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  closePop();
}

function openFor(select) {
  if (openPop?.select === select) { closePop(); return; }
  closePop(false);
  const pop = document.createElement("div");
  pop.className = "fluent-select-pop";
  pop.setAttribute("role", "listbox");
  pop.setAttribute("aria-label", select.getAttribute("aria-label") || "");
  const options = [...select.options].filter((o) => !o.hidden);
  const rows = options.map((option) => {
    const row = document.createElement("div");
    row.className = "fluent-select-option";
    row.setAttribute("role", "option");
    row.tabIndex = -1;
    row.dataset.value = option.value;
    row.textContent = option.textContent;
    row.setAttribute("aria-selected", String(option.value === select.value));
    if (option.disabled) row.setAttribute("aria-disabled", "true");
    row.addEventListener("click", () => { if (!option.disabled) choose(select, option.value); });
    row.addEventListener("pointermove", () => row.focus({ preventScroll: true }));
    pop.append(row);
    return row;
  });
  document.body.append(pop);
  // Under the field when there is room, otherwise above; never off screen.
  const r = select.getBoundingClientRect();
  const width = Math.max(r.width, pop.offsetWidth);
  const height = Math.min(pop.scrollHeight, 360);
  const below = innerHeight - r.bottom - 8, above = r.top - 8;
  const top = below >= height || below >= above ? r.bottom + 4 : r.top - height - 4;
  pop.style.minWidth = `${width}px`;
  pop.style.maxHeight = `${Math.max(120, Math.min(360, Math.max(below, above)))}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`;
  pop.style.top = `${Math.max(8, top)}px`;
  pop.classList.toggle("opens-up", top < r.top);
  const current = rows.find((row) => row.getAttribute("aria-selected") === "true") || rows[0];
  current?.focus({ preventScroll: true });
  current?.scrollIntoView({ block: "nearest" });
  const enabled = () => rows.filter((row) => row.getAttribute("aria-disabled") !== "true");
  const onKey = (event) => {
    const list = enabled(), at = list.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      list[Math.max(0, Math.min(list.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); list[event.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); if (document.activeElement?.dataset.value != null) choose(select, document.activeElement.dataset.value);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault(); event.stopPropagation(); closePop();
    }
  };
  const onAway = (event) => { if (!pop.contains(event.target) && event.target !== select) closePop(false); };
  const onResize = () => closePop(false);
  pop.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onAway, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("blur", onResize);
  openPop = { pop, select, cleanup: () => {
    document.removeEventListener("pointerdown", onAway, true);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("blur", onResize);
  } };
}

/** Give `select` the WinUI drop-down. Returns a function that removes it. */
export function attachFluentSelect(select) {
  if (!select || select.dataset.fluent) return () => {};
  select.dataset.fluent = "1";
  const onDown = (event) => {
    if (event.button !== 0 || select.disabled) return;
    event.preventDefault();
    select.focus({ preventScroll: true });
    openFor(select);
  };
  const onKey = (event) => {
    if (select.disabled) return;
    if (event.key === "Enter" || event.key === " " || event.key === "F4" || (event.altKey && event.key === "ArrowDown")) {
      event.preventDefault();
      openFor(select);
    }
  };
  select.addEventListener("mousedown", onDown);
  select.addEventListener("keydown", onKey);
  return () => {
    delete select.dataset.fluent;
    select.removeEventListener("mousedown", onDown);
    select.removeEventListener("keydown", onKey);
    if (openPop?.select === select) closePop(false);
  };
}

/** Every <select> in this window, present and future, opens the WinUI
 *  drop-down: one capturing listener, nothing to wire per control. */
export function enableFluentSelects(root = document) {
  const isSelect = (el) => el instanceof HTMLSelectElement && !el.multiple && !(el.size > 1);
  root.addEventListener("mousedown", (event) => {
    const select = event.target;
    if (!isSelect(select) || event.button !== 0 || select.disabled) return;
    event.preventDefault();
    select.focus({ preventScroll: true });
    openFor(select);
  }, true);
  root.addEventListener("keydown", (event) => {
    const select = event.target;
    if (!isSelect(select) || select.disabled) return;
    if (event.key === "Enter" || event.key === " " || event.key === "F4" || (event.altKey && event.key === "ArrowDown")) {
      event.preventDefault();
      openFor(select);
    }
  }, true);
}
