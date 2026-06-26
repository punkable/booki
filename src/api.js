/* Thin wrapper over the Tauri bridge with browser fallbacks, so the UI can be
   previewed with `vite` in a normal browser during development. */

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
  ],
  edge: "bottom",
  accent: "#dfaa75",
  theme: "system",
  iconSize: 48,
  magnification: true,
  zoom: 1.8,
  spacing: 6,
  opacity: 0.62,
  showLabels: true,
  showIndicators: true,
  autoHide: false,
  autoHideDelay: 650,
  alwaysOnTop: true,
  magnifyStyle: "spring",
  hotkey: "",
};
let demoConfig = structuredClone(DEMO_CONFIG);

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
      return "0.1.0";
    case "reset_config":
      demoConfig = structuredClone(DEMO_CONFIG);
      return structuredClone(demoConfig);
    case "open_location":
    case "set_hotkey":
      console.info("[demo]", cmd, args);
      return null;
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

/** Subscribe to OS file-drop events (dragging items from the desktop). */
export async function onFileDrop({ onEnter, onLeave, onDrop } = {}) {
  if (!(T && T.event && T.event.listen)) return () => {};
  const unsubs = await Promise.all([
    T.event.listen("tauri://drag-enter", () => onEnter && onEnter()),
    T.event.listen("tauri://drag-leave", () => onLeave && onLeave()),
    T.event.listen("tauri://drag-drop", (e) => onDrop && onDrop((e.payload && e.payload.paths) || [])),
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
  setDockFrame: (edge, width, height) => invoke("set_dock_frame", { edge, width, height }),
  setAlwaysOnTop: (value) => invoke("set_always_on_top", { value }),
  openSettings: () => invoke("open_settings"),
  quit: () => invoke("quit"),
  listWindows: () => invoke("list_windows"),
  focusWindow: (hwnd) => invoke("focus_window", { hwnd }),
  appVersion: () => invoke("app_version"),
  openLocation: (path) => invoke("open_location", { path }),
  setHotkey: (accelerator) => invoke("set_hotkey", { accelerator }),
};
