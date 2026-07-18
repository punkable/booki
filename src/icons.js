/* Lucide-style SVG icons — 24×24 viewBox, 1.5px stroke, currentColor.
   App chrome / actions. User-selectable pin glyphs live in icon-library.js.
   Usage: icon("settings"). */

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
export const iconSearch = () =>
  S(`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`);
export const iconSliders = () =>
  S(`<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`);
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
export const iconCopy = () =>
  S(`<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`);
export const iconSparkles = () =>
  S(`<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z"/>`);
export const iconStar = () =>
  S(`<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2 7.5 14 3 9.6l6.2-.9Z"/>`);
export const iconShield = () =>
  S(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9.5 12.5 11 14l3.5-4"/>`);
export const iconEye = () =>
  S(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`);
export const iconEyeOff = () =>
  S(`<path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.1 4.1"/><path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-3.1 4.4"/><path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 8 10 8a10.5 10.5 0 0 0 4.1-.8"/>`);
export const iconLock = () =>
  S(`<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`);
export const iconSun = () =>
  S(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`);
export const iconMoon = () =>
  S(`<path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"/>`);
export const iconClock = () =>
  S(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`);
export const iconZap = () =>
  S(`<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>`);
export const iconAlert = () =>
  S(`<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>`);

const iconMap = {
  plus: iconPlus,
  trash: iconTrash,
  settings: iconSettings,
  x: iconX,
  grid: iconGrid,
  list: iconList,
  search: iconSearch,
  sliders: iconSliders,
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
  copy: iconCopy,
  sparkles: iconSparkles,
  star: iconStar,
  shield: iconShield,
  eye: iconEye,
  "eye-off": iconEyeOff,
  lock: iconLock,
  sun: iconSun,
  moon: iconMoon,
  clock: iconClock,
  zap: iconZap,
  alert: iconAlert,
  "alert-triangle": iconAlert,
};

export function icon(name) {
  const fn = iconMap[name];
  if (!fn) {
    if (typeof console !== "undefined") console.warn(`[booki] unknown icon: ${name}`);
    return iconAppWindow();
  }
  return fn();
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(iconMap, name);
}
