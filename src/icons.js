/* Lucide-style SVG icons — 24×24 viewBox, 1.5px stroke, currentColor.
   App chrome / actions. User-selectable pin glyphs live in icon-library.js.
   Usage: icon("settings"). */

const S = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

// Filled brand marks, in the brand's own color when it has one.
const B = (d, fill = "currentColor") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${fill}" aria-hidden="true"><path d="${d}"/></svg>`;

export const iconPlus = () => S(`<path d="M12 5v14M5 12h14"/>`);
export const iconTrash = () =>
  S(`<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`);
export const iconSettings = () =>
  S(`<circle cx="12" cy="12" r="3"/><path d="m9.5 3-.6 2.4-2.2 1.3-2.4-.7-2.5 4.3 1.8 1.7v2.6l-1.8 1.7 2.5 4.3 2.4-.7 2.2 1.3.6 2.4h5l.6-2.4 2.2-1.3 2.4.7 2.5-4.3-1.8-1.7v-2.6l1.8-1.7L19.7 6l-2.4.7-2.2-1.3L14.5 3Z"/>`);
export const iconX = () => S(`<path d="M18 6 6 18M6 6l12 12"/>`);
export const iconGrid = () =>
  S(`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`);
export const iconList = () =>
  S(`<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>`);
export const iconRefresh = () => S(`<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/>`);
export const iconSearch = () =>
  S(`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`);
export const iconSliders = () =>
  S(`<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`);
export const iconPower = () =>
  S(`<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>`);
export const iconImage = () => S(`<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>`);
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
export const iconGlobe = () =>
  S(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`);
export const iconFile = () =>
  S(`<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>`);
export const iconCalendar = () =>
  S(`<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`);
export const iconClock = () =>
  S(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`);
export const iconZap = () =>
  S(`<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>`);
export const iconAlert = () =>
  S(`<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>`);
export const iconMore = () =>
  S(`<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>`);
export const iconActivity = () =>
  S(`<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>`);
export const iconTimer = () =>
  S(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>`);
export const iconMusic = () =>
  S(`<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`);
export const iconClipboard = () =>
  S(`<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>`);
export const iconCpu = () =>
  S(`<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>`);
export const iconMemory = () =>
  S(`<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11v2M10 11v2M14 11v2M18 11v2M6 17v3M18 17v3"/>`);
export const iconDisk = () =>
  S(`<path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/><path d="M6 16h.01M10 16h.01"/>`);
export const iconBattery = () =>
  S(`<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 11v2"/>`);
export const iconVolume = () =>
  S(`<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>`);
export const iconNote = () =>
  S(`<path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z"/><path d="M15 3v6h6M7 13h8M7 17h5"/>`);
// Timer and calendar controls for the dock's panels.
export const iconPlay = () => S(`<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/>`);
export const iconPause = () => S(`<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`);
export const iconChevronLeft = () => S(`<path d="m15 6-6 6 6 6"/>`);
// Weather conditions for the forecast panel.
export const iconCloud = () =>
  S(`<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>`);
export const iconCloudSun = () =>
  S(`<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>`);
export const iconCloudRain = () =>
  S(`<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M16 14v6M8 14v6M12 16v6"/>`);
export const iconCloudDrizzle = () =>
  S(`<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>`);
export const iconCloudSnow = () =>
  S(`<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>`);
export const iconCloudFog = () =>
  S(`<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M16 17H7M17 21H9"/>`);
export const iconCloudLightning = () =>
  S(`<path d="M6 16.3A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 .5 9"/><path d="m13 12-3 5h4l-3 5"/>`);

const iconMap = {
  plus: iconPlus,
  minus: () => S(`<path d="M5 12h14"/>`),
  trash: iconTrash,
  settings: iconSettings,
  undo: () => S(`<path d="M9 4 4 9l5 5"/><path d="M4 9h9a7 7 0 0 1 0 14"/>`),
  x: iconX,
  grid: iconGrid,
  list: iconList,
  search: iconSearch,
  refresh: iconRefresh,
  sliders: iconSliders,
  power: iconPower,
  app: iconAppWindow,
  palette: iconPalette,
  "chevron-down": iconChevronDown,
  "chevron-right": iconChevronRight,
  "arrow-left": () => S(`<path d="m10 5-7 7 7 7M3 12h18"/>`),
  "arrow-right": () => S(`<path d="m14 5 7 7-7 7M3 12h18"/>`),
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
  image: iconImage,
  copy: iconCopy,
  sparkles: iconSparkles,
  globe: iconGlobe,
  file: iconFile,
  star: iconStar,
  shield: iconShield,
  eye: iconEye,
  "eye-off": iconEyeOff,
  lock: iconLock,
  sun: iconSun,
  moon: iconMoon,
  clock: iconClock,
  calendar: iconCalendar,
  zap: iconZap,
  alert: iconAlert,
  "alert-triangle": iconAlert,
  more: iconMore,
  activity: iconActivity,
  timer: iconTimer,
  music: iconMusic,
  clipboard: iconClipboard,
  note: iconNote,
  cpu: iconCpu,
  memory: iconMemory,
  disk: iconDisk,
  battery: iconBattery,
  volume: iconVolume,
  play: iconPlay,
  pause: iconPause,
  "chevron-left": iconChevronLeft,
  cloud: iconCloud,
  "cloud-sun": iconCloudSun,
  "cloud-rain": iconCloudRain,
  "cloud-drizzle": iconCloudDrizzle,
  "cloud-snow": iconCloudSnow,
  "cloud-fog": iconCloudFog,
  "cloud-lightning": iconCloudLightning,
  // Official provider logos for the AI card, from LobeHub Icons 1.95.1
  // (MIT, github.com/lobehub/lobe-icons): Claude in its brand coral, OpenAI
  // in its monochrome mark. The marks remain their owners' trademarks.
  "ai-claude": () => B(`M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z`, "#D97757"),
  "ai-openai": () => B(`M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z`),
  // Device kinds for the Devices card, from Lucide 1.59.0 (ISC).
  headphones: () => S(`<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>`),
  mouse: () => S(`<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 6v4"/>`),
  "device-keyboard": () => S(`<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>`),
  gamepad: () => S(`<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>`),
};

export function icon(name) {
  const fn = iconMap[name];
  if (!fn) {
    if (typeof console !== "undefined") console.warn(`[booki] unknown icon: ${name}`);
    return iconAppWindow();
  }
  return fn();
}

