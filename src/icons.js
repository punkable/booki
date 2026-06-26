/* Lucide-style SVG icons — 24×24 viewBox, 1.5px stroke, currentColor.
   Salvaged from Booki's original icon set. Usage: icon("settings"). */

const S = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const iconPlus = () => S(`<path d="M12 5v14M5 12h14"/>`);
export const iconTrash = () =>
  S(`<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`);
export const iconSettings = () =>
  S(`<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`);
export const iconX = () => S(`<path d="M18 6 6 18M6 6l12 12"/>`);
export const iconGrid = () =>
  S(`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`);
export const iconPower = () =>
  S(`<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>`);
export const iconAppWindow = () =>
  S(`<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4M2 8h20"/>`);
export const iconPalette = () =>
  S(`<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M17 21a2 2 0 0 1-2 2H7a5 5 0 0 1-5-5v-6a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8v2a3 3 0 0 1-3 3h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h1a2 2 0 0 1 2 2Z"/>`);
export const iconChevronDown = () => S(`<path d="m6 9 6 6 6-6"/>`);
export const iconCheck = () => S(`<path d="M20 6 9 17l-5-5"/>`);

const iconMap = {
  plus: iconPlus,
  trash: iconTrash,
  settings: iconSettings,
  x: iconX,
  grid: iconGrid,
  power: iconPower,
  app: iconAppWindow,
  palette: iconPalette,
  "chevron-down": iconChevronDown,
  check: iconCheck,
};

export function icon(name) {
  const fn = iconMap[name] || iconAppWindow;
  return fn();
}

/** Inject icons into any [data-icon] element. */
export function injectIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.getAttribute("data-icon"));
  });
}
