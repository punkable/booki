/* Signed Tauri updates. One installation at a time across callers in a WebView. */
import { updateProgress } from "./update-state.js";
import { isTauri, logMessage } from "./api.js";
let checking = null;
let installing = null;
export async function checkForUpdate(onError) {
  if (!isTauri) return null;
  if (!checking) checking = import("@tauri-apps/plugin-updater").then(({ check }) => check({ timeout: 20000 })).finally(() => { checking = null; });
  try { const update = await checking; return update?.available ? update : null; }
  catch (error) { logMessage("warn", `update check failed: ${error}`); onError?.(error); return null; }
}
export function installUpdate(update, onProgress) {
  if (installing) return installing;
  installing = performInstall(update, onProgress).finally(() => { installing = null; });
  return installing;
}
async function performInstall(update, onProgress) {
  if (!update) throw new Error("No update available");
  let total = 0, received = 0;
  const event = (event) => {
    if (event.event === "Started") { total = event.data.contentLength || 0; received = 0; onProgress?.({ phase: "download", pct: updateProgress(total, 0) }); }
    else if (event.event === "Progress") { received += Math.max(0, event.data.chunkLength || 0); onProgress?.({ phase: "download", pct: updateProgress(total, received) }); }
    else if (event.event === "Finished") onProgress?.({ phase: "install", pct: 1 });
  };
  if (typeof update.download === "function" && typeof update.install === "function") {
    await update.download(event);
    onProgress?.({ phase: "install", pct: 1 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await update.install();
  } else await update.downloadAndInstall(event);
  try { const { relaunch } = await import("@tauri-apps/plugin-process"); await relaunch(); } catch (_) { /* Windows installer exits the app. */ }
}
