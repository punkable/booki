/* The update pill beside the bar. */

import { dock as dockApi } from "../api.js";
import { checkForUpdate } from "../update.js";
import { t } from "../i18n.js";
import { placeBesideBar } from "./placement.js";
import { S } from "./state.js";
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

export async function checkUpdates() {
  const pill = document.getElementById("update-pill");
  if (!pill) return;
  const update = await checkForUpdate();
  if (update && pill.classList.contains("hidden")) {
    pill.textContent = t("dock.update");
    pill.classList.remove("hidden");
    // Once per session: the pill stays up, so later checks skip this branch.
    dockApi.notify(t("toast.updateTitle"), t("toast.updateBody").replace("{version}", () => update.version || "")).catch(() => {});
    placeUpdatePill();
    // Straight to General — that's where the install button and progress live.
    // Bound once: the pill stays visible, so it must keep working after a click.
    if (!pill.dataset.bound) {
      pill.dataset.bound = "1";
      pill.addEventListener("click", () => dockApi.openSettingsTab("general"));
    }
  }
}
