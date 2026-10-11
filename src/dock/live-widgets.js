/* Live widget read-outs (clock, focus, weather, stats, media, volume, clipboard)
   and the single poll loop that drives them while the dock is visible. */

import { dock as dockApi } from "../api.js";
import { setTileLabel } from "./tooltip.js";
import { timerSeconds, formatTimer, tasksSummary } from "./productivity.js";
import { recoveryInterval } from "./system-observer.js";
import { singleFlight } from "./async-cache.js";
import { formatDegrees } from "./weather-codes.js";
import { t, curLang } from "../i18n.js";
import { STAT_WIDGETS, RING_DEFAULTS } from "../widgets-meta.js";
import {
  MEDIA_SVG,
  BATTERY_LOW,
  dockPreviewSnippet,
  clockParts,
  volumeStep,
  setMetric,
  setText,
  setMediaText,
  setPreviewSubText,
  setSystem,
} from "./widget-view.js";
import { S } from "./state.js";
import { dockKeys } from "./dom.js";
import { widgetLabel, findWidgetPin } from "./helpers.js";
import { fitDock, reframe } from "./frame.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireLiveWidgets(fns) { Object.assign(deps, fns); }

// Cache of live-widget elements by type, rebuilt on each render so the poll
// loop never re-queries the DOM every tick. Invalidated (rebuilt) below.
let widgetEls = {};
export function cacheWidgetEls() {
  widgetEls = {};
  // The widget elements are about to be replaced, so any "already painted this
  // minute" shortcut is stale — a fresh clock card would otherwise sit on its
  // placeholder until the minute rolled over.
  lastClockKey = "";
  // Bar widgets always; grouped widgets ONLY while their flyout is actually open.
  // The flyout keeps its DOM after closing (until the next open), so gate on
  // stackOpen — otherwise the poll would keep updating hidden grouped widgets.
  const sel = S.stackOpen ? ".dock .tile.widget, #stack .tile.widget" : ".dock .tile.widget";
  document.querySelectorAll(sel).forEach((el) => {
    const w = el.dataset.widget || "";
    (widgetEls[w] || (widgetEls[w] = [])).push(el);
  });
}

// Run fn over every cached element of a widget type (no per-tick DOM query).
export function eachWidget(type, fn) {
  const list = widgetEls[type];
  if (list) list.forEach(fn);
}

// The poll loop ticks every second so the clock rolls over promptly, but the
// card only shows hours and minutes: 59 of every 60 ticks used to reformat the
// same two strings with Intl and write them straight back into the DOM. Keep
// the 1s cadence (it is what makes the rollover feel immediate) and skip the
// work when the displayed minute has not changed.
let lastClockKey = "";
export function tickClocks() {
  if (S.hiddenState) return; // don't update a tucked-away dock
  const { key, time, date } = clockParts(new Date(), curLang());
  tickProductivity();
  if (key === lastClockKey) return;
  lastClockKey = key;
  eachWidget("clock", (el) => setText(el, date, time));
}

const weatherCache = new Map();
export function tickProductivity() {
  // Focus shows the running (or just finished) timer, otherwise the next task.
  eachWidget("focus", (el) => {
    const item = findWidgetPin(el.dataset.id); if (!item) return;
    const style = item.style || {};
    const seconds = timerSeconds(style);
    const finished = !!style.endsAt && seconds === 0;
    const summary = tasksSummary(style.tasks);
    if (style.endsAt) setText(el, finished ? t("focus.finished") : summary.next || t("w.focus"), formatTimer(seconds));
    else if (summary.total) setText(el, summary.next || t("focus.allDone"), `${summary.done}/${summary.total}`);
    else setText(el, t("w.focus"), formatTimer(seconds));
    el.classList.toggle("focus-finished", finished);
  });
  eachWidget("calendar", (el) => setText(el, new Date().toLocaleDateString(curLang(), { month: "short", weekday: "short" }), String(new Date().getDate())));
  eachWidget("weather", (el) => {
    const style = findWidgetPin(el.dataset.id)?.style || {};
    if (!Number.isFinite(style.latitude) || !Number.isFinite(style.longitude)) { setText(el, t("focus.noCity"), "—"); return; }
    const key = `${style.latitude},${style.longitude}`;
    let cached = weatherCache.get(key);
    if (!cached || (!cached.pending && Date.now() >= cached.expires)) {
      cached = { pending: true, expires: Date.now() + 600000, value: cached?.value }; weatherCache.set(key, cached);
      const record = cached;
      dockApi.weatherCurrent(style.latitude, style.longitude).then((value) => {
        record.value = value; record.error = false;
      }, () => { record.error = true; record.expires = Date.now() + 60000; }).finally(() => { record.pending = false; if (!S.hiddenState) tickProductivity(); });
    }
    const value = cached.value;
    // Today's range sits beside the city when Open-Meteo returned it.
    const range = value && Number.isFinite(value.temperature_max) && Number.isFinite(value.temperature_min) ? ` · ${formatDegrees(value.temperature_max, style.units)}/${formatDegrees(value.temperature_min, style.units)}` : "";
    setText(el, `${style.city || t("w.weather")}${range}`, value ? formatDegrees(value.temperature_2m, style.units) : cached.error ? t("focus.weatherError") : "…");
    setTileLabel(el, `${style.city || t("w.weather")} · Open-Meteo`);
  });
}

// System stats (system + battery widgets) — one snapshot fans out to
// every stat card on the bar (from the cached element map).
const pollStats = singleFlight(async () => {
  let s;
  try {
    s = await dockApi.systemStats();
  } catch (_) {
    return;
  }
  if (!s) return;
  const labels = { cpu: "CPU", ram: "RAM", disk: t("w.disk"), net: t("w.net") };
  eachWidget("system", (el) => setSystem(el, s, labels));
  eachWidget("battery", (el) => {
    setWidgetAvailable(el, s.battery >= 0);
    if (s.battery < 0) { setText(el, t("w.battery"), "—"); return; }
    setMetric(el, t("w.battery"), s.battery);
    el.classList.toggle("charging", !!s.charging);
    // A ring left at its default color (never manually re-colored) turns red
    // when running low and unplugged — the same "pay attention" cue Windows
    // itself uses, without overriding a color the user picked on purpose.
    if (el.dataset.autoAccent) {
      el.style.setProperty("--w-accent", !s.charging && s.battery <= 20 ? BATTERY_LOW : RING_DEFAULTS.battery);
    }
  });
});

function setWidgetAvailable(el, available) {
  const item = findWidgetPin(el.dataset.id);
  const hide = !!item?.style?.hideWhenUnavailable && !available;
  if (el.classList.contains("conditionally-hidden") === hide) return;
  el.classList.toggle("conditionally-hidden", hide);
  dockKeys.sync();
  requestAnimationFrame(() => { fitDock(); reframe(); });
}

// Now-playing card: the system media session (Spotify, browser, …).
// The play/pause glyph is only rebuilt when the state flips, not every poll.
function setMediaToggle(toggle, playing) {
  if (!toggle || toggle.dataset.playing === String(playing)) return;
  toggle.dataset.playing = String(playing);
  toggle.innerHTML = playing ? MEDIA_SVG.pause : MEDIA_SVG.play;
}
const pollMedia = singleFlight(async () => {
  const m = await dockApi.mediaInfo().catch(() => null);
  eachWidget("media", (el) => {
    const art = el.querySelector(".w-art");
    const ico = el.querySelector(".w-ico");
    const toggle = el.querySelector(".w-ctl-toggle");
    setWidgetAvailable(el, !!m);
    if (!m) {
      setText(el, t("w.media"), t("w.mediaIdle"), t("w.media"));
      delete el.dataset.mqTitle;
      el.classList.remove("playing");
      if (art) { art.style.display = "none"; art.removeAttribute("data-src"); }
      if (ico) ico.style.display = "";
      setMediaToggle(toggle, false);
      return;
    }
    setMediaText(el, m.artist || t("w.media"), m.title || "—");
    setTileLabel(el, `${m.title} — ${m.artist}`);
    el.classList.toggle("playing", !!m.playing);
    setMediaToggle(toggle, !!m.playing);
    if (art && m.thumb) {
      // Cross-fade the album art when the track's art actually changes.
      if (art.dataset.src !== m.thumb) {
        art.dataset.src = m.thumb;
        art.style.opacity = "0";
        art.onload = () => { art.style.opacity = "1"; };
        art.src = m.thumb;
      }
      art.style.display = "block";
      if (ico) ico.style.display = "none";
    } else if (art) {
      // Playing something with no artwork → don't leave the previous track's
      // cover showing; fall back to the widget icon.
      art.style.display = "none";
      art.removeAttribute("data-src");
      if (ico) ico.style.display = "";
    }
  });
});

// System volume — scroll changes it, click toggles mute.
let lastVolumePct = NaN;
let volumeWheelTimer = null;
let volumeInfoPending = false;
function renderVolume(pct, muted) {
  lastVolumePct = Number(pct);
  eachWidget("volume", (el) => {
    setMetric(el, muted ? t("w.muted") : t("w.volume"), pct, `${t("w.volume")}: ${pct}%`);
    el.classList.toggle("muted", muted);
  });
}
const pollVolume = singleFlight(async () => {
  const v = await dockApi.volumeInfo().catch(() => null);
  if (Array.isArray(v)) renderVolume(v[0], !!v[1]);
});
function readVolumeFromTile(tile) {
  const vEl = tile?.querySelector(".w-ring-num");
  const dataValue = Number(vEl?.dataset.v);
  if (Number.isFinite(dataValue)) return dataValue;
  const textValue = parseInt(vEl?.textContent || "", 10);
  return Number.isFinite(textValue) ? textValue : NaN;
}
export function queueVolumeSet(next) {
  const pct = Math.max(0, Math.min(100, Math.round(next)));
  renderVolume(pct, false);
  clearTimeout(volumeWheelTimer);
  volumeWheelTimer = setTimeout(() => {
    dockApi.volumeSet(pct).then(refreshVolume, () => {});
  }, 70);
}
export function adjustVolumeFromWheel(deltaY, sourceTile) {
  let cur = Number.isFinite(lastVolumePct) ? lastVolumePct : readVolumeFromTile(sourceTile);
  if (!Number.isFinite(cur)) {
    if (volumeInfoPending) return;
    volumeInfoPending = true;
    dockApi.volumeInfo()
      .then((v) => {
        volumeInfoPending = false;
        if (Array.isArray(v)) {
          lastVolumePct = Number(v[0]);
          adjustVolumeFromWheel(deltaY, sourceTile);
        }
      })
      .catch(() => { volumeInfoPending = false; });
    return;
  }
  const step = volumeStep(deltaY);
  queueVolumeSet(cur + (deltaY > 0 ? -step : step));
}

// Clipboard-history widget: the bar card shows a live PREVIEW of the most
// recent copy (not just a bare count) — reads at a glance, like a real
// notification card. The full list is fetched once, when the flyout opens.
function renderClipboardSummary(count, preview) {
  eachWidget("clipboard", (el) => {
    const shown = preview ? dockPreviewSnippet(preview) : t("clip.empty");
    setPreviewSubText(el, shown, !preview);
    const badge = el.querySelector(".w-pv-count");
    if (badge) badge.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
    setTileLabel(el, widgetLabel("clipboard"));
  });
}
const pollClipboard = singleFlight(async () => {
  const s = await dockApi.clipboardSummary().catch(() => ({ count: 0, preview: null }));
  renderClipboardSummary(s.count, s.preview);
});

// ONE poll loop drives every live widget on its own cadence — a single timer
// instead of three, and it does nothing while the dock is tucked away. Fewer
// wakeups → lighter on the battery.
let widgetPollTimer = null;
let pollDue = { stats: 0, media: 0, volume: 0 };
// DOM-based so it also sees widgets rendered inside an open group flyout (they
// poll only while visible). widgetEls is rebuilt by cacheWidgetEls on every
// render and on flyout open/close.
export function widgetPresent(w) {
  const has = (t) => !!(widgetEls[t] && widgetEls[t].length);
  return Array.isArray(w) ? w.some(has) : has(w);
}
function anyPinnedWidget(predicate, items = S.cfg?.pinned || []) {
  return items.some((item) =>
    (item.kind === "widget" && predicate(item)) ||
    anyPinnedWidget(predicate, item.children || [])
  );
}
// What startPolls last scheduled for, so a re-render that keeps the same live
// widgets can repaint without throwing away every timer and its cadence.
let pollKey = "";
let pollsActive = false;
export function stopPolls() {
  clearInterval(widgetPollTimer);
  widgetPollTimer = null;
  // Also stop the running-app/trash poll so a tucked-away dock burns zero timer
  // wakeups (not just early-returns). Resumed by startPolls on reveal.
  clearInterval(S.pollTimer);
  S.pollTimer = null;
  pollsActive = false;
}
// Display power and Energy Saver, as Windows reports them. With the display
// off nothing on screen can change for anyone, so every poll stops; turning
// it back on restarts them through startPolls, which still honours a
// tucked-away dock. Energy Saver doubles the cadence of everything but the
// clock, which has to tick on time.
let energySaver = false;
export function pollSlowdown() { return energySaver ? 2 : 1; }
export function onDisplayPower(on) {
  if (S.displayOff === !on) return;
  S.displayOff = !on;
  if (S.displayOff) stopPolls();
  else startPolls();
}
export function onEnergySaver(on) {
  if (energySaver === !!on) return;
  energySaver = !!on;
  if (pollsActive) startPolls(); // pick up the new cadence
}
function pollKinds() {
  return {
    clock: widgetPresent(["clock", "focus"]),
    local: widgetPresent(["calendar", "weather"]),
    stats: widgetPresent(STAT_WIDGETS),
    media: widgetPresent("media"),
    volume: widgetPresent("volume") || anyPinnedWidget((item) => item.widget === "media" && !!item.style?.scrollVolume),
    clipboard: widgetPresent("clipboard"),
  };
}
// First paint so freshly built cards aren't blank until the next tick.
function paintPolls(k) {
  if (k.clock || k.local) tickClocks();
  if (k.stats) pollStats();
  if (k.media) pollMedia();
  if (k.volume) pollVolume();
  if (k.clipboard) pollClipboard();
}
/* Called after the bar or a flyout was rebuilt. Restarts the timers only when
   the set of live widget kinds changed; otherwise it just repaints the new
   cards (and running-app dots) and keeps every poll's cadence. */
export function syncPolls({ repaint = true } = {}) {
  if (S.hiddenState || S.displayOff) return;
  const kinds = pollKinds();
  if (!pollsActive || JSON.stringify(kinds) !== pollKey) { startPolls(); return; }
  if (!repaint) return;
  S.appPollTick?.(); // running dots and the trash badge on the new tiles
  paintPolls(kinds);
}
export function startPolls() {
  clearInterval(widgetPollTimer);
  widgetPollTimer = null;
  if (S.hiddenState || S.displayOff) return; // tucked away or screen off → stay idle
  deps.startRunningPoll(); // running-app indicators + trash badge (independent of widgets)
  const k = pollKinds();
  pollKey = JSON.stringify(k);
  pollsActive = true;
  const { clock: hasClock, local: hasLocal, stats: hasStats, media: hasMedia, volume: hasVolume, clipboard: hasClipboard } = k;
  // Nothing live pinned → no timer at all (zero idle cost).
  if (!hasClock && !hasLocal && !hasStats && !hasMedia && !hasVolume && !hasClipboard) return;
  // First paint immediately so cards aren't blank until the first tick, then
  // schedule each poll a full interval out (no wasteful double-poll at start).
  paintPolls(k);
  const t0 = Date.now();
  const slow = pollSlowdown();
  pollDue = { stats: t0 + 2400 * slow, media: t0 + 3000 * slow, volume: t0 + 4000 * slow, clipboard: t0 + 4000 * slow };
  // Base cadence: 1 s only when a clock needs the second/minute rollover;
  // otherwise 1.5 s is plenty and lighter.
  const base = hasClock ? 1000 : hasStats || hasMedia || hasVolume || hasClipboard ? 1500 * slow : 60000;
  widgetPollTimer = setInterval(() => {
    if (S.hiddenState || S.displayOff) return; // don't poll a tucked-away dock
    const now = Date.now();
    if (hasClock || hasLocal) tickClocks();
    if (hasStats && now >= pollDue.stats) { pollDue.stats = now + 2400 * slow; pollStats(); }
    if (hasMedia && now >= pollDue.media) { pollDue.media = now + recoveryInterval(S.nativeSupport, "media", 3000) * slow; pollMedia(); }
    if (hasVolume && now >= pollDue.volume) { pollDue.volume = now + recoveryInterval(S.nativeSupport, "volume", 4000) * slow; pollVolume(); }
    if (hasClipboard && now >= pollDue.clipboard) { pollDue.clipboard = now + 4000 * slow; pollClipboard(); }
  }, base);
}
// Nudge a specific poll right away (e.g. after a transport/volume button).
export function refreshMedia() { pollDue.media = Date.now() + recoveryInterval(S.nativeSupport, "media", 3000); if (!S.hiddenState) pollMedia(); }
export function refreshVolume() { pollDue.volume = Date.now() + recoveryInterval(S.nativeSupport, "volume", 4000); if (!S.hiddenState) pollVolume(); }
export function refreshClipboard() { pollDue.clipboard = 0; if (!S.hiddenState) pollClipboard(); }
