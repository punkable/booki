/* How a widget card looks and how its text is painted.
 *
 * Split out of dock.js because none of it needs the dock: the formatters are
 * pure, the painters take the element they write to, and the markup builder
 * returns a string. What stays behind in dock.js is the part that genuinely
 * depends on dock state — wiring a tile to the context menu, the poll loop, the
 * note editor.
 *
 * The practical payoff is that the formatting rules below are now unit-testable
 * without a browser. Three of them were bugs at some point: the marquee ran at
 * one fixed duration regardless of title length, the clock reformatted itself
 * sixty times per minute, and setText assumed every card had a `.w-value`
 * (which ring cards do not — that one threw ~1500 times an hour on any desktop
 * PC, because a batteryless machine reports battery < 0 on every poll).
 */
import { icon } from "../icons.js";
import { emo } from "../emoji.js";
import { WIDGET_ICONS, RING_WIDGETS, PREVIEW_WIDGETS } from "../widgets-meta.js";
import { reduceMotion } from "./motion.js";

export const RING_R = 15.5; // SVG viewBox 0 0 36 36
export const RING_C = 2 * Math.PI * RING_R;
export const BATTERY_LOW = "#e5484d";

/** Transport glyphs for the media card — filled, rounded, Fluent-like SVGs. */
export const MEDIA_SVG = {
  prev: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3.2 2.8c0-.44.36-.8.8-.8s.8.36.8.8v4.1l7-4.63c.8-.53 1.87.04 1.87 1v9.46c0 .96-1.07 1.53-1.87 1L4.8 9.1v4.1c0 .44-.36.8-.8.8s-.8-.36-.8-.8V2.8Z"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12.8 2.8c0-.44-.36-.8-.8-.8s-.8.36-.8.8v4.1l-7-4.63c-.8-.53-1.87.04-1.87 1v9.46c0 .96 1.07 1.53 1.87 1l7-4.63v4.1c0 .44.36.8.8.8s.8-.36.8-.8V2.8Z"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M5.1 2.32c-.87-.5-1.95.13-1.95 1.13v9.1c0 1 1.08 1.63 1.95 1.13l7.9-4.55c.87-.5.87-1.76 0-2.26L5.1 2.32Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M4.1 2.5c-.61 0-1.1.49-1.1 1.1v8.8c0 .61.49 1.1 1.1 1.1h1.3c.61 0 1.1-.49 1.1-1.1V3.6c0-.61-.49-1.1-1.1-1.1H4.1Zm6.5 0c-.61 0-1.1.49-1.1 1.1v8.8c0 .61.49 1.1 1.1 1.1h1.3c.61 0 1.1-.49 1.1-1.1V3.6c0-.61-.49-1.1-1.1-1.1h-1.3Z"/></svg>',
};

// ── pure formatters ───────────────────────────────────────────────────────

export const fmtRate = (kbps) =>
  kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`;

export function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Trim a clipboard/note preview to one tidy line. */
export function dockPreviewSnippet(text, max = 180) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3).trimEnd()}...`;
}

/* Slow, distance-aware marquee. The old media fallback used 9s for every
   title, which made long tracks rush across the card. The keyframes hold at
   rest for the first 12% of each cycle (a readable pause every loop), so the
   duration is stretched to keep the actual scroll speed unchanged. */
export function marqueeDuration(distance) {
  return Math.max(18, Math.min(48, distance / 14)) / 0.88;
}

/** A firmer flick of the wheel moves the volume further. */
export const volumeStep = (deltaY) => (Math.abs(deltaY) > 80 ? 5 : 3);

const CLOCK_LOCALE = { es: "es-ES", en: "en-US", pt: "pt-BR", fr: "fr-FR", de: "de-DE" };

/* The clock's rendered state, plus a key that only changes when that state
   does. The poll loop still ticks every second (that is what makes the
   rollover feel immediate) but skips the two Intl formats and the DOM writes
   while the displayed minute is unchanged — 59 of every 60 ticks. */
export function clockParts(now, lang) {
  const loc = CLOCK_LOCALE[lang] || "en-US";
  return {
    key: `${lang}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}|${now.getHours()}:${now.getMinutes()}`,
    time: now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" }),
  };
}

// ── markup ────────────────────────────────────────────────────────────────

/** Inner markup of `.w-card` for a widget type. Ring, preview or plain. */
export function widgetCardHTML(type) {
  if (PREVIEW_WIDGETS.includes(type)) {
    return (
      `<span class="w-pv-ico">${emo(WIDGET_ICONS[type] || "puzzle", 22)}<span class="w-pv-count"></span></span>` +
      `<span class="w-pv-main"><span class="w-pv-title"></span><span class="w-pv-sub"></span></span>` +
      `<span class="w-pv-badge">${icon(type === "notes" ? "pencil" : "chevron-right")}</span>`
    );
  }
  const isRing = RING_WIDGETS.includes(type);
  const art = isRing
    ? `<span class="w-ring">` +
      `<svg viewBox="0 0 36 36"><circle class="w-ring-track" cx="18" cy="18" r="${RING_R}"/>` +
      `<circle class="w-ring-fill" cx="18" cy="18" r="${RING_R}" style="stroke-dasharray:${RING_C.toFixed(2)};stroke-dashoffset:${RING_C.toFixed(2)}"/></svg>` +
      `<span class="w-ring-num"></span></span>`
    : `<span class="w-ico">${emo(WIDGET_ICONS[type] || "puzzle", 20)}</span>`;
  return (
    art +
    `<span class="w-main">` +
    `<span class="w-label"></span>` +
    (isRing ? "" : `<span class="w-value">…</span><span class="w-bar"><i></i></span>`) +
    `</span>`
  );
}

// ── painting ──────────────────────────────────────────────────────────────

/* Animate an integer from its previous value to the next over ~320ms
   (easeOut), so CPU/RAM/volume tick up smoothly instead of snapping. Cheap:
   one rAF chain per metric, and it no-ops when the value is unchanged or
   motion is reduced. */
export function tweenNumber(el, to, fmt) {
  const from = Number(el.dataset.v);
  el.dataset.v = String(to);
  if (reduceMotion() || !Number.isFinite(from) || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const dur = 320;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (p < 1 && el.dataset.v === String(to)) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/* Set a percentage metric (CPU/RAM/disk): label + value% + bar. Extra detail
   goes in the tooltip so nothing overflows the compact card. */
export function setMetric(el, label, val, title) {
  el.querySelector(".w-label").textContent = label;
  const pct = Math.min(100, Math.max(0, val));
  const ring = el.querySelector(".w-ring-fill");
  if (ring) {
    // Ring widget: the number lives INSIDE the ring, not the label row.
    tweenNumber(el.querySelector(".w-ring-num"), val, (n) => `${n}`);
    ring.style.strokeDashoffset = `${(RING_C * (1 - pct / 100)).toFixed(2)}`;
  } else {
    tweenNumber(el.querySelector(".w-value"), val, (n) => `${n}%`);
    const bar = el.querySelector(".w-bar");
    bar.style.display = "";
    bar.querySelector("i").style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
  }
  if (title) el.title = title;
}

/* Plain label + value. Ring widgets have no `.w-value`/`.w-bar` at all (see
   widgetCardHTML), so this has to place the text inside the ring instead — a
   batteryless desktop reports battery < 0 and lands here on every poll, which
   used to throw ~1500 times an hour and freeze the card on its placeholder. */
export function setText(el, label, value, title) {
  el.querySelector(".w-label").textContent = label;
  const ringNum = el.querySelector(".w-ring-num");
  if (ringNum) {
    delete ringNum.dataset.v; // no numeric value to tween from next time
    ringNum.textContent = value;
    const ring = el.querySelector(".w-ring-fill");
    if (ring) ring.style.strokeDashoffset = `${RING_C.toFixed(2)}`; // empty gauge
  } else {
    const val = el.querySelector(".w-value");
    if (val) val.textContent = value;
    const bar = el.querySelector(".w-bar");
    if (bar) bar.style.display = "none";
  }
  if (title) el.title = title;
}

/* A line that doesn't fit its box scrolls gently in a loop instead of being
   chopped by ellipsis — essential on the compact vertical card. Rebuilt only
   when the text changes so the animation never restarts mid-scroll. */
export function setMarqueeText(el, text, keyName, force = false) {
  if (!el) return;
  if (!force && el.dataset[keyName] === text) return;
  el.dataset[keyName] = text;
  el.classList.remove("scroll");
  el.style.removeProperty("--mq-duration");
  el.textContent = text;
  if (reduceMotion()) return; // plain ellipsized line instead of a frozen marquee
  if (!el.clientWidth || el.scrollWidth <= el.clientWidth + 2) return;
  const safe = escapeHTML(text);
  el.innerHTML = `<span class="mq"><span>${safe}</span><span>${safe}</span></span>`;
  const mq = el.querySelector(".mq");
  const distance = mq ? mq.scrollWidth / 2 : el.scrollWidth;
  el.style.setProperty("--mq-duration", `${marqueeDuration(distance).toFixed(2)}s`);
  el.classList.add("scroll");
}

/** Media card text: artist as label, song as value (marquee if it overflows). */
export function setMediaText(el, artist, title) {
  el.querySelector(".w-label").textContent = artist;
  el.querySelector(".w-bar").style.display = "none";
  if (el.dataset.mqTitle === title) return;
  el.dataset.mqTitle = title;
  setMarqueeText(el.querySelector(".w-value"), title, "mqMedia", true);
}

export function setPreviewSubText(el, text, empty = false, force = false) {
  const sub = el.querySelector(".w-pv-sub");
  if (!sub) return;
  sub.classList.toggle("empty", empty);
  setMarqueeText(sub, text, "mqPreview", force);
}

/* A marquee's decision depends on measured width, so it has to be redone when
   the bar changes orientation or scale. Takes no argument on purpose: callers
   hand it straight to requestAnimationFrame, which would pass a timestamp. */
export function refreshPreviewMarquees() {
  document.querySelectorAll(".tile.widget.preview").forEach((el) => {
    const sub = el.querySelector(".w-pv-sub");
    if (!sub) return;
    const text =
      sub.dataset.mqPreview ||
      sub.querySelector(".mq > span")?.textContent ||
      sub.textContent ||
      "";
    setPreviewSubText(el, text, sub.classList.contains("empty"), true);
  });
}

/* Escape user-controlled text (song titles, clipboard contents) before it goes
   into innerHTML — a track literally named "<img onerror=…>" must render as
   text, not run. */
function escapeHTML(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
