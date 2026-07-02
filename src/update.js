/* Auto-update via the Tauri updater. Checks the GitHub release manifest,
   downloads + installs the signed update, and relaunches — the user's config
   in %APPDATA%\Booki is never touched (only the app install is replaced).
   Dynamic imports so the browser preview (no Tauri) doesn't choke. */

import { isTauri, logMessage } from "./api.js";

/** Check for an available update. Returns the update object or null. */
export async function checkForUpdate() {
  if (!isTauri) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    return update && update.available ? update : null;
  } catch (e) {
    logMessage("warn", `update check failed: ${e}`);
    return null;
  }
}

/** Download + install an update, reporting progress, then relaunch.
    Download and install run as SEPARATE steps so the UI gets a beat to show
    "installing — Booki will restart itself" before the installer closes the
    app; with the old all-in-one call the progress bar just vanished. */
export async function installUpdate(update, onProgress) {
  let total = 0;
  let received = 0;
  const onEvent = (event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength || 0;
        onProgress && onProgress({ phase: "download", pct: 0 });
        break;
      case "Progress":
        received += event.data.chunkLength || 0;
        onProgress && onProgress({ phase: "download", pct: total ? received / total : 0 });
        break;
      case "Finished":
        onProgress && onProgress({ phase: "install", pct: 1 });
        break;
    }
  };
  if (typeof update.download === "function" && typeof update.install === "function") {
    await update.download(onEvent);
    onProgress && onProgress({ phase: "install", pct: 1 });
    await new Promise((r) => setTimeout(r, 1600)); // let the message be read
    await update.install(); // on Windows this exits the app into the installer
  } else {
    await update.downloadAndInstall(onEvent);
  }
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (_) {
    /* on Windows the app is already exiting into the installer */
  }
}
