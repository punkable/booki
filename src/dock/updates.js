/* The update pill beside the bar. */

import { dock as dockApi, invoke } from "../api.js";
import { checkForUpdate } from "../update.js";
import { t } from "../i18n.js";
import { placeDockNotices } from "./notice-layout.js";
import { showErrorToast } from "./undo-toast.js";
import { quiet } from "./notices.js";

// ─────────────────── Update check ───────────────────

export const placeUpdatePill = placeDockNotices;

let toldVersion = "";
let waitingUpdate = null;
let updateRetry = 0;

async function pictureBusy() {
  try {
    const place = String(await invoke("foreground_place") || "");
    return place === "video" || place === "game";
  } catch (_) { return false; }
}

function showUpdate(update) {
  const pill = document.getElementById("update-pill");
  if (!pill) return;
  const version = update.version || "";
  if (!version || toldVersion === version) return;
  toldVersion = version;
  waitingUpdate = null;
  if (updateRetry) { clearInterval(updateRetry); updateRetry = 0; }
  pill.dataset.version = version;
  pill.querySelector("[data-update-label]").textContent = t("toast.updateBody").replace("{version}", () => version);
  pill.classList.remove("hidden");
  placeUpdatePill();
  if (!pill.dataset.bound) {
    pill.dataset.bound = "1";
    pill.querySelector("[data-update-open]").addEventListener("click", () => dockApi.openSettingsTab("system").catch(() => showErrorToast(t("overhaul.failed"))));
    pill.querySelector("[data-update-dismiss]").addEventListener("click", () => { pill.classList.add("hidden"); placeDockNotices(); });
  }
}

export async function checkUpdates() {
  const pill = document.getElementById("update-pill");
  if (!pill) return;
  const update = waitingUpdate || await checkForUpdate();
  if (!update?.version || toldVersion === update.version) return;
  if (quiet() || await pictureBusy()) {
    waitingUpdate = update;
    if (!updateRetry) updateRetry = setInterval(() => { checkUpdates(); }, 30000);
    return;
  }
  showUpdate(update);
}
