/* Booki notch — a tiny, always-reliable "home pill" window shown when the dock
   is tucked away. Click it to bring the dock back; drag it to a screen edge to
   move the dock (and notch) there. It's its own small window (never resized
   mid-flight) so the click target and repaint stay rock-solid. */

import { config as configApi, invoke, onConfigChanged } from "./api.js";
import { applyAccent } from "./util-color.js";

const root = document.documentElement;
const winApi = (typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.window) || null;

async function applyLook() {
  try {
    const cfg = await configApi.get();
    if (cfg.accent) applyAccent(root, cfg.accent);
    document.body.classList.toggle("vertical", cfg.edge === "left" || cfg.edge === "right");
  } catch (_) {
    /* keep defaults */
  }
}

applyLook();
onConfigChanged(applyLook);

const pill = document.getElementById("notch-pill");

// Click = reveal the dock. Drag to a screen edge = move the dock there.
let drag = null;

pill.addEventListener("pointerdown", (e) => {
  drag = { sx: e.screenX, sy: e.screenY, moved: false };
  try {
    pill.setPointerCapture(e.pointerId);
  } catch (_) {}
});

pill.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) < 6) return;
  drag.moved = true;
  // Move the notch window to follow the cursor (logical screen px ↔ LogicalPosition).
  if (winApi) {
    try {
      const w = winApi.getCurrentWindow();
      w.setPosition(new winApi.LogicalPosition(Math.round(e.screenX - 92), Math.round(e.screenY - 13)));
    } catch (_) {}
  }
});

pill.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (!d) return;
  try {
    pill.releasePointerCapture(e.pointerId);
  } catch (_) {}
  if (!d.moved) {
    invoke("notch_reveal"); // a plain click → bring the dock back
    return;
  }
  // Dropped → snap the dock to the nearest screen edge.
  const sw = window.screen.width || 1920;
  const sh = window.screen.height || 1080;
  const dist = { left: e.screenX, right: sw - e.screenX, top: e.screenY, bottom: sh - e.screenY };
  let edge = "bottom";
  let best = Infinity;
  for (const [k, v] of Object.entries(dist)) {
    if (v < best) {
      best = v;
      edge = k;
    }
  }
  invoke("set_dock_edge", { edge });
});
