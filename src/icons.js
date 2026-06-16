/* Lucide-style SVG icons — 20×20, 1.5px stroke, round caps/joins, currentColor */
/* Each icon is a function that returns an SVG string. Usage: iconBookmark() */

const S = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const iconBookmark = () => S(`<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>`);
export const iconFolder = () => S(`<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`);
export const iconSearch = () => S(`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`);
export const iconPlus = () => S(`<path d="M12 5v14M5 12h14"/>`);
export const iconStar = () => S(`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`);
export const iconTrash = () => S(`<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`);
export const iconEdit = () => S(`<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>`);
export const iconSave = () => S(`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>`);
export const iconRefresh = () => S(`<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>`);
export const iconSettings = () => S(`<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`);
export const iconWand = () => S(`<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M10 6 8.8 4.8M15 9l-6 6"/><path d="M2 18.5 5.5 15 9 18.5 5.5 22Z"/>`);
export const iconWrench = () => S(`<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`);
export const iconExport = () => S(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>`);
export const iconImport = () => S(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>`);
export const iconCloud = () => S(`<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`);
export const iconSync = () => S(`<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5"/>`);
export const iconQR = () => S(`<rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/><path d="M11 3h2M13 11h-2M11 15h2M11 19h2M19 11h2M3 11h2M15 19h2M19 15h2"/>`);
export const iconCheck = () => S(`<path d="M20 6 9 17l-5-5"/>`);
export const iconX = () => S(`<path d="M18 6 6 18M6 6l12 12"/>`);
export const iconChevronLeft = () => S(`<path d="m15 18-6-6 6-6"/>`);
export const iconChevronRight = () => S(`<path d="m9 18 6-6-6-6"/>`);
export const iconChevronDown = () => S(`<path d="m6 9 6 6 6-6"/>`);
export const iconExternalLink = () => S(`<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>`);
export const iconTag = () => S(`<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>`);
export const iconLayoutGrid = () => S(`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`);
export const iconGlobe = () => S(`<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`);
export const iconCopy = () => S(`<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`);
export const iconDownload = () => S(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`);
export const iconPalette = () => S(`<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M17 21a2 2 0 0 1-2 2H7a5 5 0 0 1-5-5v-6a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8v2a3 3 0 0 1-3 3h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h1a2 2 0 0 1 2 2Z"/>`);
export const iconTab = () => S(`<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="10" y1="4" x2="10" y2="10"/>`);
export const iconLink = () => S(`<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`);
export const iconAlertCircle = () => S(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`);
export const iconHeart = () => S(`<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`);
export const iconClock = () => S(`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`);
export const iconFilter = () => S(`<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`);

/* Map for easy lookup by name */
const iconMap = {
  bookmark: iconBookmark, folder: iconFolder, search: iconSearch,
  plus: iconPlus, star: iconStar, trash: iconTrash, edit: iconEdit,
  save: iconSave, refresh: iconRefresh, settings: iconSettings,
  wand: iconWand, wrench: iconWrench, export: iconExport, import: iconImport,
  cloud: iconCloud, sync: iconSync, qr: iconQR, check: iconCheck,
  x: iconX, "chevron-left": iconChevronLeft, "chevron-right": iconChevronRight,
  "chevron-down": iconChevronDown, external: iconExternalLink,
  tag: iconTag, grid: iconLayoutGrid, globe: iconGlobe, copy: iconCopy,
  download: iconDownload, link: iconLink, "alert-circle": iconAlertCircle,
  heart: iconHeart, clock: iconClock, filter: iconFilter,
  palette: iconPalette, tab: iconTab
};

export function icon(name) {
  const fn = iconMap[name] || iconBookmark;
  return fn();
}
