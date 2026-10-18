/* Lucide-style SVG icons — 24×24 viewBox, 1.5px stroke, currentColor.
   App chrome / actions. User-selectable pin glyphs live in icon-library.js.
   Usage: icon("settings"). */

const S = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

// Filled brand marks (Simple Icons paths are solid, not stroked).
const B = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;

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
  // Provider logos for the AI card, from Simple Icons 16.35.0 (CC0-1.0,
  // simpleicons.org). The marks remain their owners' trademarks and only
  // identify the service.
  "ai-claude": () => B(`m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z`),
  "ai-openai": () => B(`M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z`),
};

export function icon(name) {
  const fn = iconMap[name];
  if (!fn) {
    if (typeof console !== "undefined") console.warn(`[booki] unknown icon: ${name}`);
    return iconAppWindow();
  }
  return fn();
}

