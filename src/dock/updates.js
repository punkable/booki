/* The update pill beside the bar. */

import { dock as dockApi, invoke } from "../api.js";
import { checkForUpdate } from "../update.js";
import { t } from "../i18n.js";
import { placeBesideBar } from "./placement.js";
import { S } from "./state.js";
import { quiet } from "./notices.js";
import { dockEl } from "./dom.js";

// ─────────────────── Update check ───────────────────

// Keep the pill centered over the BAR (not the window — the window grows for
// popovers/flyouts, which would leave a fixed-centered pill visibly off-axis).
export function placeUpdatePill() {
  const pill = document.getElementById("update-pill");
  if (!pill || pill.classList.contains("hidden")) return;
  pill.style.left = pill.style.right = pill.style.top = pill.style.bottom = "";
  const { left, top } = placeBesideBar({
    bar: dockEl.getBoundingClientRect(),
    box: { width: pill.offsetWidth, height: pill.offsetHeight },
    edge: S.cfg.edge || "bottom",
    viewport: { width: window.innerWidth, height: window.innerHeight },
    gap: 8,
  });
  pill.style.left = `${left}px`;
  pill.style.top = `${top}px`;
}

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
  pill.textContent = t("toast.updateBody").replace("{version}", () => version);
  pill.classList.remove("hidden");
  dockApi.notify(t("toast.updateBody").replace("{version}", () => version), "").catch(() => {});
  placeUpdatePill();
  if (!pill.dataset.bound) {
    pill.dataset.bound = "1";
    pill.addEventListener("click", () => dockApi.openSettingsTab("system"));
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
