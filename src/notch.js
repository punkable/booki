/* Booki notch — a tiny, always-reliable "home pill" window shown when the dock
   is tucked away. Click it to bring the dock back; drag it to a screen edge to
   move the dock (and notch) there. It's its own small window (never resized
   mid-flight) so the click target and repaint stay rock-solid. */

import { config as configApi, invoke, onActiveApp, onConfigChanged, onFileDrop, onNotchToast } from "./api.js";
import { applyAccent } from "./util-color.js";
import { applyTheme } from "./theme.js";
import { t, setLang, ensureLang } from "./i18n.js";
import { applySurfaceClass } from "./surface.js";

const root = document.documentElement;
const winApi = (typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.window) || null;
const inTauri = !!winApi;

function availW() {
  const screenW = window.screen.availWidth || window.screen.width || window.innerWidth || 1280;
  return inTauri ? screenW : Math.min(screenW, window.innerWidth || screenW);
}

function availH() {
  const screenH = window.screen.availHeight || window.screen.height || window.innerHeight || 720;
  return inTauri ? screenH : Math.min(screenH, window.innerHeight || screenH);
}

let hoverTrigger = false; // reveal the dock when the pill is hovered

async function applyLook() {
  try {
    const cfg = await configApi.get();
    await ensureLang(cfg.language || "system");
    setLang(cfg.language || "system");
    const label = t("notch.show");
    pill.title = label;
    pill.setAttribute("aria-label", label);
    applyTheme(cfg);
    if (cfg.accent) applyAccent(root, cfg.accent);
    hoverTrigger = cfg.notchTrigger === "hover";
    // The notch always lives on the dock's edge now.
    const edge = cfg.edge || "bottom";
    document.body.classList.toggle("vertical", edge === "left" || edge === "right");
    document.body.classList.toggle("peek", cfg.notchPeek !== false);
    document.body.classList.remove("edge-top", "edge-bottom", "edge-left", "edge-right");
    document.body.classList.add(`edge-${edge}`);
    applySurfaceClass(cfg);
    // Set scale on <body> — styles.css used to hardcode --notch-scale: 1 on
    // body.notch-body, which shadowed any value set on <html>.
    const scale = Math.min(1.5, Math.max(0.7, Number(cfg.notchScale) || 1));
    document.body.style.setProperty("--notch-scale", String(scale));
    document.documentElement.style.setProperty("--notch-scale", String(scale));
  } catch (_) {
    /* keep defaults */
  }
}

const pill = document.getElementById("notch-pill");
const textEl = document.getElementById("notch-text");

applyLook();
onConfigChanged(applyLook);

// Multi-notch intelligence: shrink the notch to a dot when the active app is in
// the user's productivity list (browsers, editors, design tools, etc.).
let dotMode = false;
function applyDotMode(active) {
  dotMode = !!active;
  document.body.classList.toggle("notch-dot", dotMode);
}
onActiveApp((payload) => applyDotMode(payload.dot));
(async function initDotMode() {
  try {
    const payload = await invoke("current_foreground_app");
    applyDotMode(payload.dot);
  } catch (_) {}
})();

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

// Optional: reveal on hover (when the user chose the "hover" trigger). A short
// intent delay avoids opening on an accidental brush-past.
let hoverTimer = null;
pill.addEventListener("pointerenter", () => {
  if (!hoverTrigger) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => invoke("reveal_dock"), 120);
});
pill.addEventListener("pointerleave", () => clearTimeout(hoverTimer));

// Re-run the entrance animation every time the notch window is shown,
// so the dock→notch transition reads as a continuous transformation.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  pill.classList.remove("notch-enter");
  void pill.offsetWidth; // force reflow
  pill.classList.add("notch-enter");
  setTimeout(() => pill.classList.remove("notch-enter"), 400);
});

/** Current notch window size — vertical notches are tall, not 184×26. */
function notchSize() {
  const w = Math.max(24, Math.round(window.innerWidth || 184));
  const h = Math.max(16, Math.round(window.innerHeight || 26));
  return { w, h };
}

pill.addEventListener("pointerdown", (e) => {
  const { w, h } = notchSize();
  drag = {
    sx: e.screenX,
    sy: e.screenY,
    moved: false,
    ox: Math.round(w / 2),
    oy: Math.round(h / 2),
    w,
    h,
  };
  try {
    pill.setPointerCapture(e.pointerId);
  } catch (_) {}
});

let dragRaf = 0;
let dragPos = null;
pill.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) < 6) return;
  drag.moved = true;
  // Coalesce to one window move per frame — moving the OS window is an IPC, so
  // firing it on every raw pointer event would flood it at high refresh rates.
  dragPos = { x: Math.round(e.screenX - drag.ox), y: Math.round(e.screenY - drag.oy) };
  if (dragRaf || !winApi) return;
  dragRaf = requestAnimationFrame(() => {
    dragRaf = 0;
    try {
      winApi.getCurrentWindow().setPosition(new winApi.LogicalPosition(dragPos.x, dragPos.y));
    } catch (_) {}
  });
});

pill.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  // Drop any queued follow-move so it can't fight the settle animation.
  cancelAnimationFrame(dragRaf);
  dragRaf = 0;
  if (!d) return;
  try {
    pill.releasePointerCapture(e.pointerId);
  } catch (_) {}
  if (!d.moved) {
    // The notch always lives on the dock's own edge, so a plain click just
    // brings the dock back where it is.
    invoke("notch_reveal");
    return;
  }
  // Dropped → snap the dock to the nearest screen edge.
  const sw = availW();
  const sh = availH();
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
  const W = d.w;
  const H = d.h;
  const m = 3;
  const target =
    edge === "top" ? { x: (sw - W) / 2, y: m }
    : edge === "left" ? { x: m, y: (sh - H) / 2 }
    : edge === "right" ? { x: sw - W - m, y: (sh - H) / 2 }
    : { x: (sw - W) / 2, y: sh - H - m };
  const from = { x: e.screenX - W / 2, y: e.screenY - H / 2 };
  tweenNotch(from, target, 260, () => invoke("set_dock_edge", { edge }));
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
