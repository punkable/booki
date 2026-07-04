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
export const iconList = () =>
  S(`<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>`);
export const iconPower = () =>
  S(`<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>`);
export const iconAppWindow = () =>
  S(`<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4M2 8h20"/>`);
export const iconPalette = () =>
  S(`<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M17 21a2 2 0 0 1-2 2H7a5 5 0 0 1-5-5v-6a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8v2a3 3 0 0 1-3 3h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h1a2 2 0 0 1 2 2Z"/>`);
export const iconChevronDown = () => S(`<path d="m6 9 6 6 6-6"/>`);
export const iconChevronRight = () => S(`<path d="m9 6 6 6-6 6"/>`);
export const iconCheck = () => S(`<path d="M20 6 9 17l-5-5"/>`);
export const iconGrip = () =>
  S(`<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>`);
export const iconFolder = () =>
  S(`<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/>`);
export const iconFolderPlus = () =>
  S(`<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/><path d="M12 11v6M9 14h6"/>`);
export const iconTakeOut = () =>
  S(`<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/>`);
export const iconPencil = () =>
  S(`<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`);
export const iconExternal = () =>
  S(`<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`);
export const iconUngroup = () =>
  S(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M14 7h4M16 5v4"/>`);

export const iconKeyboard = () =>
  S(`<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>`);
export const iconInfo = () =>
  S(`<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`);
export const iconHelp = () =>
  S(`<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>`);
export const iconSparkles = () =>
  S(`<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z"/>`);

const iconMap = {
  plus: iconPlus,
  trash: iconTrash,
  settings: iconSettings,
  x: iconX,
  grid: iconGrid,
  list: iconList,
  power: iconPower,
  app: iconAppWindow,
  palette: iconPalette,
  "chevron-down": iconChevronDown,
  "chevron-right": iconChevronRight,
  check: iconCheck,
  grip: iconGrip,
  folder: iconFolder,
  "folder-plus": iconFolderPlus,
  "take-out": iconTakeOut,
  pencil: iconPencil,
  external: iconExternal,
  ungroup: iconUngroup,
  keyboard: iconKeyboard,
  info: iconInfo,
  help: iconHelp,
  sparkles: iconSparkles,
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
