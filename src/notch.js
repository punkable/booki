/* Booki notch — a tiny, always-reliable "home pill" window shown when the dock
   is tucked away. Clicking it brings the dock back. It's its own small window
   (never resized) so the click target and repaint are rock-solid, unlike
   shrinking the dock window down to a sliver. */

import { config as configApi, invoke, onConfigChanged } from "./api.js";
import { applyAccent } from "./util-color.js";

const root = document.documentElement;

async function applyLook() {
  try {
    const cfg = await configApi.get();
    if (cfg.accent) applyAccent(root, cfg.accent);
    root.dataset.edge = cfg.edge || "bottom";
    document.body.classList.toggle("vertical", cfg.edge === "left" || cfg.edge === "right");
  } catch (_) {
    /* keep defaults */
  }
}

applyLook();
onConfigChanged(applyLook);

const pill = document.getElementById("notch-pill");
pill.addEventListener("click", () => invoke("notch_reveal"));
