/* Thin wrapper over the Tauri bridge with browser fallbacks, so the UI can be
   previewed with `vite` in a normal browser during development. */

import { startDrag } from "@crabnebula/tauri-plugin-drag";

const T = typeof window !== "undefined" ? window.__TAURI__ : undefined;
export const isTauri = !!(T && T.core);

// ── Demo data used only when running outside Tauri (browser preview) ──
const DEMO_CONFIG = {
  pinned: [
    { id: "a", name: "Explorer", path: "C:/Windows/explorer.exe", args: [], kind: "app" },
    { id: "b", name: "Edge", path: "C:/Program Files/Edge/msedge.exe", args: [], kind: "app" },
    { id: "c", name: "Terminal", path: "C:/Windows/System32/wt.exe", args: [], kind: "app" },
    { id: "s1", name: "", path: "", args: [], kind: "separator" },
    { id: "d", name: "Notepad", path: "C:/Windows/notepad.exe", args: [], kind: "app" },
    { id: "e", name: "Photos", path: "C:/Apps/photos.exe", args: [], kind: "app" },
    { id: "f", name: "Music", path: "C:/Apps/music.exe", args: [], kind: "app" },
    { id: "g", name: "Proyectos", path: "C:/Users/Proyectos", args: [], kind: "folder" },
    { id: "w1", name: "Reloj", path: "", args: [], kind: "widget", widget: "clock" },
    { id: "w2", name: "CPU", path: "", args: [], kind: "widget", widget: "cpu" },
    { id: "w3", name: "Notas", path: "", args: [], kind: "widget", widget: "notes", style: { note: "Comprar leche y huevos" } },
    { id: "w4", name: "Portapapeles", path: "", args: [], kind: "widget", widget: "clipboard" },
    {
      id: "grp", name: "Diseño", path: "", args: [], kind: "group",
      children: [
        { id: "c1", name: "Photos", path: "C:/Apps/photos.exe", args: [], kind: "app" },
        { id: "c2", name: "Music", path: "C:/Apps/music.exe", args: [], kind: "app" },
        { id: "c3", name: "Editor", path: "C:/Apps/editor.exe", args: [], kind: "app", icon: "lib:palette:badge" },
      ],
    },
  ],
  edge: "bottom",
  accent: "#dfaa75",
  theme: "system",
  iconSize: 36,
  magnification: false,
  zoom: 1.25,
  spacing: 6,
  cornerRadius: 12,
  showLabels: true,
  showIndicators: true,
  autoHide: false,
  autoHideMode: "smart",
  autoHideDelay: 650,
  notchPosition: "center",
  notchPeek: false,
  alwaysOnTop: true,
  magnifyStyle: "spring",
  hotkey: "",
  monitor: -1,
  materialStrength: 70,
  autostart: false,
  language: "system",
  notchTrigger: "click",
  compact: false,
  onboarded: true,
  lastProfile: "",
  edgeGap: 48,
  focusIfRunning: false,
  multiNotchEnabled: false,
  multiNotchApps: [],
  multiNotchAutoSuggest: true,
  clipboardPersist: false,
  clipboardRetentionDays: 7,
  clipboardHistoryLimit: 60,
  clipboardSensitiveGuard: true,
  clipboardCompact: false,
  captureVisible: false,
};
let demoConfig = structuredClone(DEMO_CONFIG);
let demoTrashItems = 2; // browser demo: pretend the bin has something in it
let demoVolume = { pct: 55, muted: false };
let demoClipboard = [
  { id: 2, text: "https://example.com/informe-final.pdf", ts: Date.now() - 60000 },
  { id: 1, text: "Reunión de equipo — jueves 10:00", ts: Date.now() - 300000 },
];
let demoProfiles = { Trabajo: structuredClone(DEMO_CONFIG) };

async function mockInvoke(cmd, args) {
  switch (cmd) {
    case "get_config":
      return structuredClone(demoConfig);
    case "save_config":
      demoConfig = structuredClone(args.config);
      return null;
    case "app_icon":
    case "image_data_uri":
      return null; // browser can't read native icons → UI falls back to letter tile
    case "launch_app":
      console.info("[demo] launch", args);
      return null;
    case "list_windows":
      return [];
    case "app_version":
      return "0.55.1";
    case "reset_config":
      demoConfig = structuredClone(DEMO_CONFIG);
      return structuredClone(demoConfig);
    case "list_monitors":
      return [
        { index: 0, name: "Pantalla principal", x: 0, y: 0, w: 1920, h: 1080, primary: true },
        { index: 1, name: "Pantalla 2", x: 1920, y: 0, w: 1920, h: 1080, primary: false },
      ];
    case "get_autostart":
      return demoConfig.autostart;
    case "system_accent":
      return "#3a86ff";
    case "is_dir":
      return false;
    case "set_hit_rects":
    case "open_with":
      return null;
    case "file_thumbnail":
      return null;
    case "copy_text":
      return true;
    case "recent_files_for":
      return [];
    case "clipboard_count":
      return demoClipboard.length;
    case "clipboard_summary":
      return { count: demoClipboard.length, preview: demoClipboard[0]?.text || null };
    case "clipboard_history":
      return demoClipboard.slice(0, args.limit || 60);
    case "clipboard_copy":
      demoClipboard = [
        { id: Date.now(), text: args.text, ts: Date.now() },
        ...demoClipboard.filter((e) => e.text !== args.text),
      ].slice(0, 60);
      return true;
    case "clipboard_delete":
      demoClipboard = demoClipboard.filter((e) => e.id !== args.id);
      return null;
    case "clipboard_favorite":
      demoClipboard = demoClipboard.map((e) => e.id === args.id ? { ...e, favorite: !!args.favorite } : e);
      return null;
    case "clipboard_private":
      demoClipboard = demoClipboard.map((e) => e.id === args.id ? { ...e, private: !!args.private } : e);
      return null;
    case "clipboard_clear":
      demoClipboard = [];
      return null;
    case "list_dir":
      return [
        { name: "Documentos", path: "C:/Users/Doc", is_dir: true },
        { name: "informe.pdf", path: "C:/Users/informe.pdf", is_dir: false },
        { name: "notas.txt", path: "C:/Users/notas.txt", is_dir: false },
      ];
    case "list_installed_apps":
      return [
        {
          name: "Microsoft Office",
          items: [
            { name: "Word", path: "C:/Apps/Office/Word.lnk", is_dir: false },
            { name: "Excel", path: "C:/Apps/Office/Excel.lnk", is_dir: false },
            { name: "PowerPoint", path: "C:/Apps/Office/PowerPoint.lnk", is_dir: false },
          ],
        },
        {
          name: "",
          items: [
            { name: "Microsoft Edge", path: "C:/Program Files/Edge/msedge.lnk", is_dir: false },
            { name: "Spotify", path: "C:/Apps/Spotify.lnk", is_dir: false },
            { name: "Visual Studio Code", path: "C:/Apps/Code.lnk", is_dir: false },
            { name: "WhatsApp", path: "C:/Apps/WhatsApp.lnk", is_dir: false },
          ],
        },
      ];
    case "set_autostart":
      demoConfig.autostart = !!(args && args.enabled);
      console.info("[demo]", cmd, args);
      return null;
    case "take_pending_changelog":
      return false;
    case "open_settings_tab":
    case "take_pending_tab":
      return null;
    case "paths_exist":
      // Demo: pretend one path is missing so the reassign UI can be seen.
      return ((args && args.paths) || []).map((p) => !/photos/i.test(p));
    case "trash_paths":
      demoTrashItems += ((args && args.paths) || []).length;
      return null;
    case "trash_is_empty":
      return demoTrashItems === 0;
    case "trash_count":
      return demoTrashItems;
    case "empty_trash":
      demoTrashItems = 0;
      return null;
    case "recent_files":
      return [
        { name: "Notas de la reunión", path: "C:/demo/Notas.docx" },
        { name: "Presupuesto 2026", path: "C:/demo/Presupuesto.xlsx" },
        { name: "captura", path: "C:/demo/captura.png" },
      ].slice(0, (args && args.limit) || 12);
    case "wallpaper_accent":
      return "#3a86ff";
    case "media_info":
      return { title: "Capybara Groove", artist: "Los Roedores", playing: true, thumb: null };
    case "media_toggle":
    case "media_next":
    case "media_prev":
      return true;
    case "volume_info":
      return [demoVolume.pct, demoVolume.muted];
    case "volume_set":
      demoVolume.pct = Math.max(0, Math.min(100, (args && args.pct) || 0));
      if (demoVolume.pct > 0) demoVolume.muted = false;
      return null;
    case "volume_mute":
      demoVolume.muted = !demoVolume.muted;
      return demoVolume.muted;
    case "profile_list":
      return Object.keys(demoProfiles).sort();
    case "profile_save":
      demoConfig.lastProfile = (args && args.name) || "Perfil";
      demoProfiles[demoConfig.lastProfile] = structuredClone(demoConfig);
      return null;
    case "profile_apply":
      demoConfig = structuredClone(demoProfiles[(args && args.name) || ""] || demoConfig);
      demoConfig.lastProfile = (args && args.name) || "";
      return structuredClone(demoConfig);
    case "profile_delete":
      delete demoProfiles[(args && args.name) || ""];
      return null;
    case "open_location":
    case "set_hotkey":
    case "apply_hotkeys":
    case "move_paths":
    case "set_material":
      console.info("[demo]", cmd, args);
      return null;
    case "fetch_favicon":
      return null; // browser demo can't fetch; the UI falls back to a letter tile
    case "system_stats": {
      const r = (a, b) => a + Math.random() * (b - a);
      return {
        cpu: r(4, 38),
        mem: r(40, 70),
        mem_used_mb: Math.round(r(6000, 11000)),
        mem_total_mb: 16384,
        net_down_kbps: Math.round(r(0, 1500)),
        net_up_kbps: Math.round(r(0, 400)),
        disk: r(45, 80),
        disk_used_gb: Math.round(r(200, 400)),
        disk_total_gb: 512,
        uptime_secs: Math.round(r(3600, 200000)),
        battery: Math.round(r(20, 100)),
        charging: Math.random() > 0.5,
      };
    }
    case "dock_cover_workarea":
      return [window.screen.availWidth, window.screen.availHeight];
    case "sync_context_menu":
      return null;
    case "known_folders":
      return [
        ["desktop", "C:/Users/demo/Desktop"],
        ["documents", "C:/Users/demo/Documents"],
        ["downloads", "C:/Users/demo/Downloads"],
        ["pictures", "C:/Users/demo/Pictures"],
        ["videos", "C:/Users/demo/Videos"],
        ["music", "C:/Users/demo/Music"],
      ];
    case "export_config":
    case "import_config":
      console.info("[demo]", cmd, args);
      return cmd === "import_config" ? demoConfig : null;
    default:
      return null;
  }
}

export async function invoke(cmd, args = {}) {
  if (isTauri) return T.core.invoke(cmd, args);
  return mockInvoke(cmd, args);
}

async function pickFile(filters) {
  if (T && T.dialog && T.dialog.open) {
    return T.dialog.open({ multiple: false, directory: false, filters });
  }
  const path = window.prompt("Ruta del archivo:", "C:/Windows/notepad.exe");
  return path || null;
}

/** Open a native file picker for choosing an app to pin. */
export function pickAppFile() {
  return pickFile([{ name: "Programas", extensions: ["exe", "lnk", "bat", "cmd"] }]);
}

/** Open a native folder picker for pinning a folder. */
export async function pickFolder() {
  if (T && T.dialog && T.dialog.open) {
    return T.dialog.open({ multiple: false, directory: true });
  }
  const path = window.prompt("Ruta de la carpeta:", "C:/Users");
  return path || null;
}

/** Write a line to the app log file (best-effort, for diagnostics). */
export function logMessage(level, message) {
  try {
    if (isTauri) T.core.invoke("frontend_log", { level, message: String(message) });
    else console[level === "error" ? "error" : "log"]("[booki]", message);
  } catch (_) {
    /* ignore */
  }
}

/** Pick a path to save a file to (for exporting config). */
export async function pickSavePath(defaultName) {
  if (T && T.dialog && T.dialog.save) {
    return T.dialog.save({ defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] });
  }
  return window.prompt("Guardar como:", defaultName) || null;
}

/** Pick a JSON file (for importing config). */
export function pickJsonFile() {
  return pickFile([{ name: "JSON", extensions: ["json"] }]);
}

/** Open a native file picker for choosing a custom icon image. */
export function pickImageFile() {
  return pickFile([
    { name: "Imágenes", extensions: ["png", "jpg", "jpeg", "ico", "webp", "gif", "svg", "bmp"] },
  ]);
}

/** Close the current window (used by the settings window). */
export async function closeSelf() {
  if (T && T.window && T.window.getCurrentWindow) {
    try {
      await T.window.getCurrentWindow().close();
      return;
    } catch (_) {
      /* fall through */
    }
  }
  window.close();
}

/** Broadcast that the config changed so other windows can live-refresh. */
export async function emitConfigChanged() {
  if (T && T.event && T.event.emit) await T.event.emit("booki://config-changed");
}

/** Listen for config changes from another window. */
export async function onConfigChanged(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://config-changed", () => cb());
}

/** Subscribe to OS file-drop events (dragging items from the desktop). The
    position (physical px, window-relative) lets the dock target a specific tile. */
export async function onFileDrop({ onEnter, onOver, onLeave, onDrop } = {}) {
  if (!(T && T.event && T.event.listen)) return () => {};
  const pos = (e) => (e.payload && e.payload.position) || null;
  const unsubs = await Promise.all([
    T.event.listen("tauri://drag-enter", (e) => onEnter && onEnter(pos(e))),
    T.event.listen("tauri://drag-over", (e) => onOver && onOver(pos(e))),
    T.event.listen("tauri://drag-leave", () => onLeave && onLeave()),
    T.event.listen("tauri://drag-drop", (e) => onDrop && onDrop((e.payload && e.payload.paths) || [], pos(e))),
  ]);
  return () => unsubs.forEach((u) => u());
}

export const config = {
  get: () => invoke("get_config"),
  save: (config) => invoke("save_config", { config }),
  reset: () => invoke("reset_config"),
};

export const dock = {
  launch: (path, args = []) => invoke("launch_app", { path, args }),
  appIcon: (path) => invoke("app_icon", { path }),
  imageDataUri: (path) => invoke("image_data_uri", { path }),
  reposition: (edge) => invoke("reposition_dock", { edge }),
  setDockFrame: (edge, width, height, hidden = false) =>
    invoke("set_dock_frame", { edge, width, height, hidden }),
  // Interactive regions of the stage window (window-relative CSS px); `all`
  // keeps the whole window interactive during drags/overlays.
  setHitRects: (rects, all = false) => invoke("set_hit_rects", { rects, all }),
  // Backend cursor watcher: fires when the OS cursor enters/leaves the dock's
  // live regions (DOM events can't see it once the window ignores the mouse).
  onCursorInside: (cb) => {
    if (!(T && T.event && T.event.listen)) return Promise.resolve(() => {});
    return T.event.listen("booki://cursor-inside", (e) => cb(!!e.payload));
  },
  dockCoverWorkarea: () => invoke("dock_cover_workarea"),
  // Explorer-grade thumbnail for a file (photos/videos in folder flyouts).
  fileThumbnail: (path) => invoke("file_thumbnail", { path }),
  copyText: (text) => invoke("copy_text", { text }),
  // Recents filtered to one app (by file association) for its context menu.
  recentFilesFor: (path, limit = 6) => invoke("recent_files_for", { appPath: path, limit }),
  // Clipboard history widget: count for the badge, full list for the flyout,
  // copy-back/edit (bumps to front), delete one, clear all.
  clipboardCount: () => invoke("clipboard_count"),
  clipboardSummary: () => invoke("clipboard_summary"),
  clipboardHistory: (limit = 60) => invoke("clipboard_history", { limit }),
  clipboardCopy: (text) => invoke("clipboard_copy", { text }),
  clipboardDelete: (id) => invoke("clipboard_delete", { id }),
  clipboardFavorite: (id, favorite) => invoke("clipboard_favorite", { id, favorite }),
  clipboardPrivate: (id, value) => invoke("clipboard_private", { id, private: value }),
  clipboardClear: () => invoke("clipboard_clear"),
  openWith: (path) => invoke("open_with", { path }),
  // Native OLE drag-out: drag a file from the folder flyout into Explorer or
  // any other app. The OS runs the drag, the target decides copy vs move.
  dragOutFiles: async (paths, icon) => {
    if (!isTauri) return false;
    try {
      await startDrag({
        item: paths,
        icon:
          icon ||
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });
      return true;
    } catch (e) {
      console.warn("drag-out failed", e);
      return false;
    }
  },
  knownFolders: () => invoke("known_folders"),
  syncContextMenu: (enabled, labelPin, labelGroup) =>
    invoke("sync_context_menu", { enabled, labelPin, labelGroup }),
  hideDock: (edge) => invoke("hide_dock", { edge }),
  revealDock: () => invoke("reveal_dock"),
  notchToast: (text) => invoke("notch_toast", { text }),
  hideAll: () => invoke("hide_all"),
  setAlwaysOnTop: (value) => invoke("set_always_on_top", { value }),
  openSettings: () => invoke("open_settings"),
  quit: () => invoke("quit"),
  listWindows: () => invoke("list_windows"),
  focusWindow: (hwnd) => invoke("focus_window", { hwnd }),
  trashCount: () => invoke("trash_count"),
  recentFiles: (limit) => invoke("recent_files", { limit }),
  openDataDir: () => invoke("open_data_dir"),
  setDockEdge: (edge) => invoke("set_dock_edge", { edge }),
  appVersion: () => invoke("app_version"),
  openLocation: (path) => invoke("open_location", { path }),
  setHotkey: (accelerator) => invoke("set_hotkey", { accelerator }),
  applyHotkeys: (toggle, positions, modifier) =>
    invoke("apply_hotkeys", { toggle, positions, modifier }),
  movePaths: (paths, dest) => invoke("move_paths", { paths, dest }),
  listMonitors: () => invoke("list_monitors"),
  setMaterial: (strength) => invoke("set_material", { strength }),
  systemAccent: () => invoke("system_accent"),
  systemStats: () => invoke("system_stats"),
  fetchFavicon: (url) => invoke("fetch_favicon", { url }),
  openChangelog: () => invoke("open_changelog"),
  takePendingChangelog: () => invoke("take_pending_changelog"),
  openSettingsTab: (tab) => invoke("open_settings_tab", { tab }),
  takePendingTab: () => invoke("take_pending_tab"),
  trashPaths: (paths) => invoke("trash_paths", { paths }),
  trashIsEmpty: () => invoke("trash_is_empty"),
  emptyTrash: () => invoke("empty_trash"),
  wallpaperAccent: () => invoke("wallpaper_accent"),
  mediaInfo: () => invoke("media_info"),
  mediaToggle: () => invoke("media_toggle"),
  mediaNext: () => invoke("media_next"),
  mediaPrev: () => invoke("media_prev"),
  notchPreview: () => invoke("notch_preview"),
  volumeInfo: () => invoke("volume_info"),
  volumeSet: (pct) => invoke("volume_set", { pct }),
  volumeMute: () => invoke("volume_mute"),
  profileList: () => invoke("profile_list"),
  profileSave: (name) => invoke("profile_save", { name }),
  profileApply: (name) => invoke("profile_apply", { name }),
  profileDelete: (name) => invoke("profile_delete", { name }),
  exportConfig: (path) => invoke("export_config", { path }),
  importConfig: (path) => invoke("import_config", { path }),
  pathsExist: (paths) => invoke("paths_exist", { paths }),
  setAutostart: (enabled) => invoke("set_autostart", { enabled }),
  getAutostart: () => invoke("get_autostart"),
  listDir: (path) => invoke("list_dir", { path }),
  isDir: (path) => invoke("is_dir", { path }),
  listInstalledApps: () => invoke("list_installed_apps"),
};

/** Listen for "switch to a pending settings tab" (settings re-asks the backend). */
export async function onShowTab(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://show-tab", () => cb());
}

/** Listen for a position hotkey (modifier+1…9): launch the Nth dock item. */
export async function onLaunchIndex(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://launch-index", (e) => cb(e.payload));
}

/** Listen for "cursor pushed against the dock's edge" (reveal a hidden dock). */
export async function onHotEdge(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://hot-edge", () => cb());
}

/** Listen for the smart-hide occlusion signal from the backend. */
export async function onOcclusion(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://occlusion", (e) => cb(!!e.payload));
}

/** Listen for the "reveal the dock" signal (fired when the notch is clicked). */
export async function onReveal(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://reveal", () => cb());
}

/** Notch hover / non-focus reveal — show the dock without pinning it open. */
export async function onSoftReveal(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://soft-reveal", () => cb());
}

/** Listen for the "show what's new" signal (settings shows the changelog modal). */
export async function onShowChangelog(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://show-changelog", () => cb());
}

/** Listen for fullscreen on/off (a game/movie/presentation is running). */
export async function onFullscreen(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://fullscreen", (e) => cb(!!e.payload));
}

/** Listen for a toast message to render on the notch window. */
export async function onNotchToast(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://notch-toast", (e) => cb(e.payload || ""));
}

/** Listen for the active foreground app changing (multi-notch intelligence). */
export async function onActiveApp(cb) {
  if (!(T && T.event && T.event.listen)) return () => {};
  return T.event.listen("booki://active-app", (e) => cb(e.payload || { app: "", dot: false }));
}
