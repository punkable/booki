/* Booki notch — a tiny, always-reliable "home pill" window shown when the dock
   is tucked away. Click it to bring the dock back; drag it to a screen edge to
   move the dock (and notch) there. It's its own small window (never resized
   mid-flight) so the click target and repaint stay rock-solid.

   Hit-testing: the OS window is slightly larger than the painted pill (hover /
   glow room). CSS pointer-events alone cannot pass clicks through on WebView2,
   so we report the pill (or toast) rect to the backend; a watcher toggles
   ignore_cursor_events — same contract as the dock stage. */

import { config as configApi, invoke, onConfigChanged, onFileDrop, onFullscreen, onNotchToast, onNotchToastOut, onOcclusion } from "./api.js";
import { applyAccent } from "./util-color.js";
import { applyTheme } from "./theme.js";
import { t, setLang, ensureLang, curLang } from "./i18n.js";
import { applySurfaceVars, resolveSurfaceStyle, transparencyReduced } from "./surface.js";
import { resolveNotchMode } from "./notch-mode.js";
import { availW, availH, rectFromElement, hitSignature } from "./dock/geometry.js";
import { reduceMotion } from "./dock/motion.js";
import { clockParts, MEDIA_SVG } from "./dock/widget-view.js";
import { reportMaterial, shapeOf, materialTint, setMaterialTint, setMaterialEnabled, followFrames } from "./material.js";

const root = document.documentElement;
const winApi = (typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.window) || null;
const inTauri = !!winApi;

let hoverTrigger = false; // reveal the dock when the pill is hovered
let notchMode = "attached";
// The live card only exists on a horizontal tab: a vertical one has no room
// for a line of text, and the smart dot is deliberately a dot.
let canPeek = false;
let draggingNotch = false;
let lastHitSig = "";

const pill = document.getElementById("notch-pill");
const toastEl = document.getElementById("notch-toast");
const toastTitleEl = document.getElementById("notch-toast-title");
const toastSubEl = document.getElementById("notch-toast-sub");

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
    const mode = resolveNotchMode(cfg);
    notchMode = mode;
    const attached = mode === "attached";
    const floating = mode === "floating";
    const smart = mode === "smart";
    document.body.classList.toggle("vertical", edge === "left" || edge === "right");
    // Modes are mutually exclusive. Smart must NOT also get `floating` —
    // floating's capsule rules (128×16) are more specific than `.notch-dot`
    // and would keep a long pill inside a square window (looks clipped).
    document.body.classList.toggle("peek", attached);
    document.body.classList.toggle("floating", floating);
    document.body.classList.toggle("smart", smart);
    document.body.classList.toggle("notch-dot", smart);
    if (!smart) {
      document.body.classList.remove("smart-busy", "smart-focus");
    }
    document.body.classList.remove("edge-top", "edge-bottom", "edge-left", "edge-right");
    document.body.classList.add(`edge-${edge}`);
    // Stacked under a visible dock the card would grow over the bar.
    canPeek = !smart && !hoverTrigger && !cfg.notchAlwaysVisible && (edge === "top" || edge === "bottom");
    document.body.classList.toggle("peekable", canPeek);
    if (!canPeek) closeCard();
    pollMedia();
    applySurfaceVars(cfg);
    setMaterialTint(materialTint(cfg));
    setMaterialEnabled(cfg.nativeMaterial !== false && !transparencyReduced(cfg) && resolveSurfaceStyle(cfg) !== "solid");
    // Set scale on <body> — styles.css used to hardcode --notch-scale: 1 on
    // body.notch-body, which shadowed any value set on <html>.
    const scale = Math.min(1.5, Math.max(0.7, Number(cfg.notchScale) || 1));
    document.body.style.setProperty("--notch-scale", String(scale));
    document.documentElement.style.setProperty("--notch-scale", String(scale));
    scheduleHitReport();
  } catch (_) {
    /* keep defaults */
  }
}

applyLook();
onConfigChanged(applyLook);
matchMedia("(prefers-reduced-transparency: reduce)").addEventListener("change", applyLook);

// Smart ambient behaviours: stay circular always, but react to fullscreen /
// occlusion so the dot feels alive — no app whitelist required.
function setSmartState(name, on) {
  if (notchMode !== "smart") return;
  document.body.classList.toggle(name, !!on);
  scheduleHitReport();
}
onFullscreen((v) => setSmartState("smart-busy", v));
onOcclusion((v) => setSmartState("smart-focus", v));

// ─── Hit-testing: only the painted pill (or toast) is clickable ───────────
// Window-relative CSS px [x, y, w, h], matching the dock's set_hit_rects.
function reportNotchHitRects() {
  const toasting = document.body.classList.contains("toast");
  reportMaterial(document.visibilityState === "hidden" ? [] : [shapeOf(toasting ? toastEl : pill)]);
  // During drag or toast, keep the whole notch window interactive so gestures
  // and the message aren't yanked out from under the cursor.
  const all = !!(draggingNotch || toasting);
  const rects = [];
  if (toasting) {
    const toastRect = rectFromElement(toastEl, 2) || rectFromElement(pill, 2);
    if (toastRect) rects.push(toastRect);
  } else {
    // Tiny inflate (~1px) for aim comfort; never the full window padding.
    const pillRect = rectFromElement(pill, 1);
    if (pillRect) rects.push(pillRect);
  }
  const sig = hitSignature(rects, all);
  if (sig === lastHitSig) return;
  lastHitSig = sig;
  invoke("set_notch_hit_rects", { rects, all }).catch(() => {});
}

let hitRaf = 0;
function scheduleHitReport() {
  if (hitRaf) return;
  hitRaf = requestAnimationFrame(() => {
    hitRaf = 0;
    reportNotchHitRects();
  });
}

// Keep hit rects fresh while the pill is animating (smart breathe/focus scales
// it, and the rect has to follow or clicks land in the wrong place).
//
// KNOWN COST: this runs at 4Hz for the life of the app. The visibilityState
// guard does not help, because a window the backend hid with ShowWindow still
// reports "visible" here. Gating it properly needs a shown/hidden event from
// Rust that does not exist yet — deliberately not half-wired: reportNotchHitRects
// already dedupes by signature, so the waste is one getBoundingClientRect per
// tick, not IPC.
setInterval(() => {
  if (document.visibilityState === "visible") reportNotchHitRects();
}, 250);
window.addEventListener("resize", scheduleHitReport);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleHitReport();
});
new MutationObserver(() => { scheduleHitReport(); followMorph(); }).observe(document.body, {
  attributes: true,
  attributeFilter: ["class", "style"],
  subtree: true,
});

for (const event of ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"]) {
  document.body.addEventListener(event, (e) => {
    if (e.target === pill || e.target === toastEl) followMorph();
  });
}

// Brief status chip (e.g. fullscreen hide). Dock owns hide_all timing — this
// window only paints. Never call hide_all here (a short fullscreen would
// otherwise re-blackout after restore).
let toastTimer = null;
function clearNotchToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  document.body.classList.remove("toast", "toast-out");
  if (toastTitleEl) toastTitleEl.textContent = "";
  if (toastSubEl) {
    toastSubEl.textContent = "";
    toastSubEl.hidden = true;
  }
  scheduleHitReport();
}
function showNotchToast(payload) {
  const title = (payload && payload.title) || "";
  const detail = (payload && payload.detail) || "";
  document.body.classList.remove("toast-out");
  document.body.classList.add("toast");
  if (toastTitleEl) toastTitleEl.textContent = title;
  if (toastSubEl) {
    toastSubEl.textContent = detail;
    toastSubEl.hidden = !detail;
  }
  clearTimeout(toastTimer);
  // Safety clear if dock never blackouts (e.g. fullscreen ended early).
  toastTimer = setTimeout(clearNotchToast, 3200);
  scheduleHitReport();
}
onNotchToast(showNotchToast);
onNotchToastOut(() => {
  if (!document.body.classList.contains("toast")) return;
  document.body.classList.add("toast-out");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearNotchToast, 300);
});
// When the OS window is hidden (dock hide_all / hideDock), drop toast chrome
// so a later show never flashes the old message + pill.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") clearNotchToast();
});

// ─── Live activity + hover card ───────────────────────────────────────────
// The tab is one element that morphs: slim at rest, a little wider with art
// and a level meter while something plays, and a small card under the
// pointer. Clicking the card still brings the dock back, so the notch never
// stops being the dock's handle — the card only adds a glance and play/pause.
const lArt = document.getElementById("nl-art-img");
const cArt = document.getElementById("nc-art-img");
const cTitle = document.getElementById("nc-title");
const cSub = document.getElementById("nc-sub");
const cPlay = document.getElementById("nc-play");
let media = null; // { title, artist, playing, thumb } or null
let mediaTimer = null;
let cardTimer = null;
let cardOpen = false;

function paintMedia() {
  const live = !!(media && media.playing && canPeek);
  document.body.classList.toggle("live", live);
  const art = (media && media.thumb) || "";
  for (const img of [lArt, cArt]) {
    if (img.getAttribute("src") !== art) {
      if (art) img.src = art;
      else img.removeAttribute("src");
    }
  }
  document.body.classList.toggle("has-art", !!art);
  paintCard();
}

function paintCard() {
  if (media && (media.title || media.artist)) {
    cTitle.textContent = media.title || media.artist;
    cSub.textContent = media.title ? media.artist : "";
    cPlay.hidden = false;
    cPlay.innerHTML = media.playing ? MEDIA_SVG.pause : MEDIA_SVG.play;
    cPlay.setAttribute("aria-label", t("w.playPause"));
    cPlay.title = t("w.playPause");
    document.body.classList.remove("card-clock");
  } else {
    // Nothing playing: the card is a clock, which is the other thing you
    // glance at the edge of the screen for.
    const { time, date } = clockParts(new Date(), curLang());
    cTitle.textContent = time;
    cSub.textContent = date;
    cPlay.hidden = true;
    document.body.classList.add("card-clock");
  }
}

// Media is polled only while it can be shown, and slower when nothing plays:
// the WinRT session query is cheap but not free.
async function pollMedia() {
  clearTimeout(mediaTimer);
  if (!canPeek || !inTauri) {
    media = null;
    paintMedia();
    return;
  }
  try {
    media = await invoke("media_info");
  } catch (_) {
    media = null;
  }
  paintMedia();
  mediaTimer = setTimeout(pollMedia, media && media.playing ? 2500 : 6000);
}

// Hit rects must follow the morph while its width/height transition runs.
function followMorph(ms = 420) {
  followFrames(reportNotchHitRects, ms);
}

function openCard() {
  if (!canPeek || cardOpen || drag) return;
  paintCard();
  cardOpen = true;
  document.body.classList.add("card");
  followMorph();
}
function closeCard() {
  clearTimeout(cardTimer);
  if (!cardOpen) return;
  cardOpen = false;
  document.body.classList.remove("card");
  followMorph();
}

// Intent delay in, a short grace out: brushing past the edge does nothing,
// and leaving by a pixel does not snap it shut.
pill.addEventListener("pointerenter", () => {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(openCard, 140);
});
pill.addEventListener("pointerleave", () => {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(closeCard, 220);
});

cPlay.addEventListener("pointerdown", (e) => e.stopPropagation());
cPlay.addEventListener("click", async (e) => {
  e.stopPropagation();
  try {
    await invoke("media_toggle");
  } catch (_) {}
  if (media) media.playing = !media.playing;
  paintMedia();
  setTimeout(pollMedia, 400);
});

pill.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    invoke("notch_reveal");
  }
});

// A hidden notch has nothing to show; drop the card so the next reveal starts
// from the tab.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") closeCard();
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
  hoverTimer = setTimeout(() => invoke("reveal_dock"), 90);
});
pill.addEventListener("pointerleave", () => clearTimeout(hoverTimer));

// Re-run the entrance animation every time the notch window is shown,
// so the dock→notch transition reads as a continuous transformation.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  pill.classList.remove("notch-enter");
  void pill.offsetWidth; // force reflow
  pill.classList.add("notch-enter");
  setTimeout(() => pill.classList.remove("notch-enter"), 280);
  scheduleHitReport();
});

/** Current notch window size — vertical notches are tall, not 184×26. */
function notchSize() {
  const w = Math.max(24, Math.round(window.innerWidth || 184));
  const h = Math.max(16, Math.round(window.innerHeight || 26));
  return { w, h };
}

pill.addEventListener("pointerdown", (e) => {
  const { w, h } = notchSize();
  draggingNotch = false;
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
  scheduleHitReport();
});

let dragRaf = 0;
let dragPos = null;
pill.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) < 6) return;
  drag.moved = true;
  draggingNotch = true;
  closeCard();
  scheduleHitReport();
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
  draggingNotch = false;
  scheduleHitReport();
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
  const sw = availW(inTauri);
  const sh = availH(inTauri);
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
  // The notch travelling across the screen is one of the larger movements
  // Booki makes, and it is driven by setPosition, not CSS — so the global
  // reduced-motion override never reached it. Jump straight to the new edge.
  if (reduceMotion()) {
    try {
      w.setPosition(new winApi.LogicalPosition(Math.round(to.x), Math.round(to.y)));
    } catch (_) {}
    done && done();
    return;
  }
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

// First paint: report an empty/through state until layout settles, then the pill.
scheduleHitReport();
