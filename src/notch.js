/* Booki notch — a tiny, always-reliable "home pill" window shown when the dock
   is tucked away. Click it to bring the dock back; drag it to a screen edge to
   move the dock (and notch) there. It's its own small window (never resized
   mid-flight) so the click target and repaint stay rock-solid. */

import { config as configApi, invoke, onConfigChanged, onFileDrop, onNotchToast } from "./api.js";
import { applyAccent } from "./util-color.js";

const root = document.documentElement;
const winApi = (typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.window) || null;

async function applyLook() {
  try {
    const cfg = await configApi.get();
    if (cfg.accent) applyAccent(root, cfg.accent);
    const edge = cfg.edge || "bottom";
    document.body.classList.toggle("vertical", edge === "left" || edge === "right");
    document.body.classList.toggle("peek", cfg.notchPeek !== false);
    document.body.classList.remove("edge-top", "edge-bottom", "edge-left", "edge-right");
    document.body.classList.add(`edge-${edge}`);
  } catch (_) {
    /* keep defaults */
  }
}

applyLook();
onConfigChanged(applyLook);

const pill = document.getElementById("notch-pill");
const textEl = document.getElementById("notch-text");

// Brief toast message (e.g. "Booki se ocultó · pantalla completa").
let toastTimer = null;
onNotchToast((text) => {
  document.body.classList.add("toast");
  if (textEl) textEl.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    document.body.classList.remove("toast");
    if (textEl) textEl.textContent = "";
  }, 2600);
});

// Dragging a file NEAR the notch reveals the dock — otherwise there'd be
// nowhere to drop while the dock is tucked away (its window is hidden).
onFileDrop({ onEnter: () => invoke("notch_reveal") });

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
  const sw = window.screen.availWidth || window.screen.width || 1920;
  const sh = window.screen.availHeight || window.screen.height || 1080;
  const dist = { left: e.screenX, right: sw - e.screenX, top: e.screenY, bottom: sh - e.screenY };
  let edge = "bottom";
  let best = Infinity;
  for (const [k, v] of Object.entries(dist)) {
    if (v < best) {
      best = v;
      edge = k;
    }
  }
  // Animate the notch gliding to the chosen edge (a natural travel), then let the
  // backend place + resize it authoritatively for that edge.
  const W = 184, H = 26, m = 3;
  const target =
    edge === "top" ? { x: (sw - W) / 2, y: m }
    : edge === "left" ? { x: m, y: (sh - H) / 2 }
    : edge === "right" ? { x: sw - W - m, y: (sh - H) / 2 }
    : { x: (sw - W) / 2, y: sh - H - m };
  const from = { x: e.screenX - W / 2, y: e.screenY - H / 2 };
  tweenNotch(from, target, 340, () => invoke("set_dock_edge", { edge }));
});

// Glide the notch window from `from` to `to` over `ms` (easeOutCubic), then `done`.
function tweenNotch(from, to, ms, done) {
  if (!winApi) {
    done && done();
    return;
  }
  const w = winApi.getCurrentWindow();
  const t0 = performance.now();
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const e = ease(p);
    try {
      w.setPosition(new winApi.LogicalPosition(Math.round(from.x + (to.x - from.x) * e), Math.round(from.y + (to.y - from.y) * e)));
    } catch (_) {}
    if (p < 1) requestAnimationFrame(frame);
    else done && done();
  };
  requestAnimationFrame(frame);
}
