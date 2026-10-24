/* Live widget read-outs (clock, focus, weather, stats, media, volume, clipboard)
   and the single poll loop that drives them while the dock is visible. */

import { dock as dockApi, invoke, onAgentActivity } from "../api.js";
import { usageResets, usageSnapshot } from "../usage-reset.js";
import { setTileLabel } from "./tooltip.js";
import { timerSeconds, formatTimer, tasksSummary } from "./productivity.js";
import { recoveryInterval } from "./system-observer.js";
import { singleFlight } from "./async-cache.js";
import { paintDownloads } from "./collector.js";
import { notify, quiet } from "./notices.js";
import { pollDnd, dndActive, onFocusDndChange } from "./focus-dnd.js";
import { deviceReading, aiReading, statsReading, tokenText, updatesReading, shownUpdates, batteryTone, usageTone, TONE_COLORS, shortDeviceName, matchDevice } from "./readings.js";
import { formatDegrees } from "./weather-codes.js";
import { t, curLang } from "../i18n.js";
import { icon } from "../icons.js";
import { STAT_WIDGETS } from "../widgets-meta.js";
import {
  MEDIA_SVG,
  dockPreviewSnippet,
  clockParts,
  volumeStep,
  setMetric,
  setText,
  setMediaText,
  setPreviewSubText,
  setSystem,
  widgetGlyph,
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
  // Bar widgets always; grouped widgets ONLY while their flyout is actually open.
  // The flyout keeps its DOM after closing (until the next open), so gate on
  // stackOpen — otherwise the poll would keep updating hidden grouped widgets.
  const sel = S.stackOpen ? ".dock .tile.widget, #stack .tile.widget" : ".dock .tile.widget";
  document.querySelectorAll(sel + (S.productivityPanel?.classList.contains("widget-hub") ? ", .widget-hub:not(.is-closing) .tile.widget" : "")).forEach((el) => {
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
export function tickClocks() {
  if (S.hiddenState) return; // don't update a tucked-away dock
  const now = new Date();
  tickProductivity();
  eachWidget("clock", (el) => {
    const style = findWidgetPin(el.dataset.id)?.style || {};
    const { key, time, date } = clockParts(now, curLang(), style);
    if (el.dataset.clockKey === key) return;
    el.dataset.clockKey = key;
    el.classList.toggle("clock-no-date", style.showDate === false);
    setText(el, date, time);
  });
}

const weatherCache = new Map();
// A small moon on the Focus card while Windows holds notifications.
function paintDndBadge(el, on) {
  let badge = el.querySelector(".focus-dnd-badge");
  if (on && !badge) {
    badge = document.createElement("span"); badge.className = "focus-dnd-badge";
    badge.innerHTML = icon("moon"); badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", t("focus.dndOn")); badge.title = t("focus.dndOn");
    el.appendChild(badge);
  } else if (!on && badge) badge.remove();
  el.classList.toggle("focus-dnd", on);
}
onFocusDndChange(() => eachWidget("focus", (el) => paintDndBadge(el, dndActive())));
export function tickProductivity() {
  // Windows' own toggle: read every ten seconds while a Focus card is shown.
  if (widgetEls.focus?.length) pollDnd();
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
    paintDndBadge(el, dndActive());
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
    s = await statsReading.refresh();
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
    // A ring left at its default color (never manually re-colored) follows
    // the charge: green, amber, red, and pulses near empty while unplugged.
    // A color the user picked on purpose is kept; the pulse still applies.
    const tone = batteryTone(s.battery, !!s.charging);
    el.dataset.tone = tone;
    el.classList.toggle("needs-attention", !s.charging && s.battery >= 0 && s.battery <= 10);
    if (el.dataset.autoAccent) el.style.setProperty("--w-accent", TONE_COLORS[tone]);
  });
});

// Headsets, earbuds, mice and keyboards that report a battery to Windows.
// The card takes each device in turn (about every 6 s, lowest first) with an
// icon for its kind; its hint lists them all.
const KIND_ICON = { headset: "headphones", mouse: "mouse", keyboard: "device-keyboard", gamepad: "gamepad" };
let deviceTurn = 0;
function setCornerGlyph(el, name, key) {
  // The ring's own glyph becomes the device kind or provider logo.
  const glyph = el.querySelector(".w-ring-ico") || el.querySelector(".w-ico");
  if (!glyph || glyph.dataset.key === key) return;
  glyph.dataset.key = key; glyph.innerHTML = icon(name);
  glyph.classList.remove("w-glyph-swap"); void glyph.offsetWidth; glyph.classList.add("w-glyph-swap");
  el.dataset.glyph = key;
}
function resetGlyph(el, type) {
  const glyph = el.querySelector(".w-ring-ico");
  if (!glyph?.dataset.key) return;
  delete glyph.dataset.key; delete el.dataset.glyph; glyph.innerHTML = widgetGlyph(type, 14);
}
// One timer turns every rotating card; it repaints cached readings only.
let rotationTimer = 0;
function syncRotation() {
  // Only cards still on the dock rotate; unpinning one lets the timer go.
  const devices = widgetPresent("devices") && (deviceReading.last || []).length > 1;
  const ai = widgetPresent("ai") && (aiReading.last || []).length > 1;
  if (!devices && !ai) { clearInterval(rotationTimer); rotationTimer = 0; return; }
  if (rotationTimer) return;
  rotationTimer = setInterval(() => {
    if (S.hiddenState || S.displayOff) return;
    // Hold still while the pointer rests on the card, so it can be read.
    if (document.querySelector('.tile.widget[data-widget="devices"]:hover, .tile.widget[data-widget="ai"]:hover')) return;
    deviceTurn++; aiTurn++;
    paintDevices(deviceReading.last || []); paintAi(aiReading.last || []);
  }, 6000);
}
function paintDevices(list) {
  eachWidget("devices", (el) => {
    // A card made for one device follows only that one, under its short name.
    const style = findWidgetPin(el.dataset.id)?.style;
    const own = style?.device;
    // Missing from a completed query means unavailable; an old percentage
    // would imply a disconnected device was still reporting live.
    const found = own ? matchDevice(list, own, style.deviceKind) : null;
    const mine = own ? [found].filter(Boolean) : list;
    setWidgetAvailable(el, mine.length > 0);
    if (!mine.length) {
      resetGlyph(el, "devices");
      el.classList.remove("charging", "needs-attention");
      el.dataset.tone = "unknown";
      if (el.dataset.autoAccent) el.style.setProperty("--w-accent", "var(--ink-2)");
      setText(el, own ? shortDeviceName(own) : t("w.devices"), "?");
      setTileLabel(el, own ? `${own} · ${t("dev.disconnected")}` : t("w.devicesNone"));
      return;
    }
    const shown = own ? mine[0] : mine[(style?.rotate === false ? 0 : deviceTurn) % mine.length];
    // Charging shows the bolt in the ring and says so under the name.
    if (shown.charging) setCornerGlyph(el, "zap", "device-charging");
    else setCornerGlyph(el, KIND_ICON[shown.kind] || "battery", `device-${shown.kind || "other"}`);
    el.classList.toggle("charging", !!shown.charging);
    const label = own ? shortDeviceName(shown.name) : shown.name;
    setMetric(el, shown.charging ? `${label} · ${t("dev.charging")}` : label, shown.level);
    setTileLabel(el, mine.map((d) => `${d.name} · ${d.level}%${d.charging ? ` · ${t("dev.charging")}` : ""}`).join("\n"));
    // The ring speaks the battery: green, amber, red; it pulses when a device
    // is about to die (any of them, not only the one on screen).
    const tone = batteryTone(shown.level, shown.charging);
    el.dataset.tone = tone;
    el.classList.toggle("needs-attention", mine.some((d) => !d.charging && d.level <= 10));
    if (el.dataset.autoAccent) el.style.setProperty("--w-accent", TONE_COLORS[tone]);
  });
}
const pollDevices = singleFlight(async () => {
  let list = [];
  try { list = (await deviceReading.refresh()) || []; } catch (_) { list = []; }
  paintDevices(list); syncRotation(); warnLowDevices(list);
});

// One notice per device when it crosses 10%, not again until it recovers.
const warnedDevices = new Set();
function warnLowDevices(list) {
  for (const d of list) {
    if (!d.charging && d.level <= 10) {
      if (!warnedDevices.has(d.name)) { warnedDevices.add(d.name); notify(t("dev.low"), `${d.name} · ${d.level}%`, { critical: d.level <= 10 }); }
    } else if (d.charging || d.level > 15) warnedDevices.delete(d.name);
  }
}

// AI usage of the tools found on this PC (Claude Code, Codex), read by the
// backend from their own local usage logs only: no sign-in, no network.
// Codex logs carry its plan's windows (used percentages); the card shows
// the remaining share. Claude's logs carry only token counts, so quota is
// explicitly unknown instead of displaying elapsed time as an allowance. Asked every five minutes,
// only while pinned.
const resetClock = (seconds) => seconds > 0
  ? new Date(seconds * 1000).toLocaleString(curLang(), { weekday: "short", hour: "numeric", minute: "2-digit" })
  : "";
const windowName = (label) => (label === "week" ? t("w.aiWeek") : label);
const resetsText = (seconds) => { const r = resetClock(seconds); return r ? ` · ${t("w.aiResets").replace("{time}", () => r)}` : ""; };
const tokensText = (n) => t("w.aiTokens").replace("{n}", () => tokenText(n));
/** Every hint line for one provider. */
function aiHintLines(p) {
  if (p.detected === false) return [`${p.name} · ${t("panelFlow.notDetected")}`];
  const week = `${p.name} · ${t("w.aiWeekTokens").replace("{n}", () => tokensText(p.week_tokens))}`;
  if ((p.windows || []).length) {
    return p.windows.map((w) => `${p.name} ${windowName(w.label)} · ${Math.round(w.percent)}%${resetsText(w.resets_at)}`);
  }
  if (p.block) {
    return [
      `${p.name} · ${t("w.aiBlock")}: ${tokensText(p.block.tokens)}${resetsText(p.block.resets_at)}`,
      `${p.name} · ${t("w.aiBlockElapsed").replace("{n}", () => Math.round(p.block.elapsed_percent))}`,
      week,
      `${p.name} · ${t("w.aiQuotaUnknown")}`,
    ];
  }
  return [`${p.name} · ${t("w.aiIdle")}`, `${p.name} · ${t("w.aiQuotaUnknown")}`, ...(p.week_tokens > 0 ? [week] : [])];
}
// Every active provider takes a turn on the card (about every 6 s);
// rotating repaints the cached reading, it never reads the logs again.
let aiTurn = 0;
const aiStages = new Map();
onAgentActivity(({ provider, state }) => {
  if (["working", "waiting", "error"].includes(state)) aiStages.set(provider, state);
  else aiStages.delete(provider);
  aiTurn = 0;
  if (aiReading.last) paintAi(aiReading.last);
});
const PROVIDER_ICON = { claude: "ai-claude", chatgpt: "ai-openai", codex: "ai-openai", cursor: "ai-cursor", opencode: "ai-opencode" };
function paintAi(providers) {
  eachWidget("ai", (el) => {
    const style = findWidgetPin(el.dataset.id)?.style || {};
    const available = style.provider ? providers.filter((provider) => provider.id === style.provider) : providers.filter((provider) => provider.detected !== false);
    const urgent = available.filter((provider) => ["waiting", "error"].includes(aiStages.get(provider.id)));
    const working = available.filter((provider) => aiStages.get(provider.id) === "working");
    const shown = urgent.length ? urgent : working.length ? working : available;
    setWidgetAvailable(el, shown.some((provider) => provider.detected !== false));
    const hint = available.flatMap(aiHintLines).concat(t("w.aiLocal")).join("\n");
    if (!shown.length) {
      resetGlyph(el, "ai");
      setText(el, t("w.ai"), "—");
      setTileLabel(el, !available.length ? t("w.aiNone") : hint);
      return;
    }
    const current = shown[(style.rotate === false ? 0 : aiTurn) % shown.length];
    if (el.dataset.aiCurrent && el.dataset.aiCurrent !== current.id) {
      el.classList.remove("w-turn"); void el.offsetWidth; el.classList.add("w-turn");
    }
    el.dataset.aiCurrent = current.id;
    el.style.setProperty("--ai-brand", ({ claude: "#d97757", cursor: "#c6ccd8", opencode: "#b3a1ff" })[current.id] || "#10a37f");
    setCornerGlyph(el, PROVIDER_ICON[current.id] || "sparkles", `ai-${current.id}`);
    setTileLabel(el, hint);
    let tone = "good";
    if ((current.windows || []).length) {
      const top = current.windows.reduce((a, b) => (b.percent > a.percent ? b : a));
      setMetric(el, `${current.name} · ${t("w.aiRemaining")}`, Math.round(100 - Math.min(100, Math.max(0, top.percent))), undefined, "%");
      tone = usageTone(top.percent);
    } else {
      // Local Claude logs have token counts, not the subscription allowance.
      // An elapsed-time ring must never masquerade as remaining quota.
      const recorded = current.block?.tokens || current.week_tokens || 0;
      setText(el, recorded > 0 ? `${current.name} · ${t("refine.estimate")}` : current.name, recorded > 0 ? `~${tokenText(recorded).replace(/\s+/g, "")}` : "?");
    }
    el.dataset.tone = tone;
    el.classList.toggle("needs-attention", available.some((p) => (p.windows || []).some((w) => w.percent >= 95)));
    if (el.dataset.autoAccent) el.style.setProperty("--w-accent", TONE_COLORS[tone]);
  });
}
let usageBefore = null;
const usageSeen = new Set();
try {
  const saved = JSON.parse(localStorage.getItem("booki.usageResets") || "null");
  if (saved && Date.now() - saved.at < 8 * 86400000 && saved.at <= Date.now()) {
    usageBefore = usageSnapshot(saved.providers);
    for (const key of Array.isArray(saved.seen) ? saved.seen.slice(-64) : []) if (typeof key === "string") usageSeen.add(key);
  }
} catch (_) { /* A missing/corrupt local snapshot starts quietly. */ }
const usageQueue = [];
let usageRetry = 0;
let usageFlushing = false;
async function pictureBusy() {
  try { return ["video", "game"].includes(String(await invoke("foreground_place") || "")); }
  catch (_) { return false; }
}
async function flushUsage() {
  if (usageFlushing) return;
  if (S.cfg?.notchAgents === false) usageQueue.length = 0;
  if (!usageQueue.length) { if (usageRetry) { clearInterval(usageRetry); usageRetry = 0; } return; }
  usageFlushing = true;
  try {
  if (quiet() || await pictureBusy()) return;
  const ev = usageQueue.shift();
  if (usageRetry) { clearInterval(usageRetry); usageRetry = 0; }
  const title = t(ev.kind === "block" ? "notch.usageBlockEnded" : "notch.usageReady").replace("{agent}", () => ev.name);
  await notify(title);
  if (usageQueue.length) usageRetry = setInterval(flushUsage, 6000);
  } finally { usageFlushing = false; }
}
function noteUsage(providers) {
  if (S.cfg?.notchAgents === false) { usageQueue.length = 0; return; }
  const now = Math.floor(Date.now() / 1000);
  for (const ev of usageBefore ? usageResets(usageBefore, providers, now) : []) {
    if (usageSeen.has(ev.key)) continue;
    usageSeen.add(ev.key);
    usageQueue.push(ev);
  }
  usageBefore = usageSnapshot(providers);
  while (usageSeen.size > 64) usageSeen.delete(usageSeen.values().next().value);
  try { localStorage.setItem("booki.usageResets", JSON.stringify({ at: Date.now(), providers: usageBefore, seen: [...usageSeen] })); } catch (_) { /* storage unavailable */ }
  if (usageQueue.length && !usageRetry) usageRetry = setInterval(flushUsage, 20000);
  flushUsage();
}
const pollAi = singleFlight(async () => {
  let providers = [];
  try { providers = (await aiReading.fresh(300000)) || []; } catch (_) { return; }
  if (!Array.isArray(providers)) return;
  paintAi(providers); syncRotation(); noteUsage(providers);
});

// Reset notices keep working with the bar tucked away and with no AI tile.
// Only the existing read-only usage command runs, at most once per 5 minutes.
setInterval(() => {
  if (S.cfg && S.cfg.notchAgents !== false && !S.displayOff) pollAi();
}, 300000);

// Updates (winget): how many apps have an update; asked every six hours.
// A rise in the count is announced once.
let lastUpdateCount = -1;
const pollUpdates = singleFlight(async () => {
  let list = null;
  try { list = shownUpdates((await updatesReading.fresh(6 * 3600000)) || [], S.cfg?.ignoredUpdates); } catch (_) { list = null; }
  eachWidget("updates", (el) => {
    setWidgetAvailable(el, list !== null);
    if (list === null) { setText(el, t("w.updates"), "—"); setTileLabel(el, t("perr.appInstaller")); return; }
    setText(el, list.length ? t("up.some").replace("{n}", () => list.length) : t("up.none"), String(list.length));
    setTileLabel(el, list.length ? list.slice(0, 12).map((u) => `${u.name} · ${u.current} → ${u.available}`).join("\n") : t("up.none"));
    el.dataset.tone = list.length ? "fair" : "good";
    if (el.dataset.autoAccent) el.style.setProperty("--w-accent", TONE_COLORS[list.length ? "fair" : "good"]);
  });
  if (list && list.length > lastUpdateCount && lastUpdateCount >= 0) notify(t("up.found").replace("{n}", () => list.length));
  if (list) lastUpdateCount = list.length;
});

// Lighting (OpenRGB): the card names the profile last applied from Booki.
export function paintLighting() {
  let current = "";
  try { current = localStorage.getItem("booki.rgbProfile") || ""; } catch (_) { current = ""; }
  if (current === "\u0000off") current = t("rgb.off");
  eachWidget("lighting", (el) => {
    setText(el, t("w.lighting"), current || "—");
    setTileLabel(el, current ? `${t("w.lighting")} · ${current}` : t("widget.lightingDesc"));
  });
}

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
    setTileLabel(el, [m.title, m.artist].filter(Boolean).join(" — ") || t("w.media"));
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

// System volume — the wheel changes it; the tile opens the mixer.
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
  // The device/AI rotation sleeps with the polls too.
  clearInterval(rotationTimer);
  rotationTimer = 0;
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
    devices: widgetPresent("devices"),
    ai: widgetPresent("ai"),
    collector: widgetPresent("collector"),
    updates: widgetPresent("updates"),
    lighting: widgetPresent("lighting"),
  };
}
// First paint so freshly built cards aren't blank until the next tick.
function paintPolls(k) {
  if (k.clock || k.local) tickClocks();
  if (k.stats) pollStats();
  if (k.media) pollMedia();
  if (k.volume) pollVolume();
  if (k.clipboard) pollClipboard();
  if (k.devices) pollDevices();
  if (k.ai) pollAi();
  if (!k.devices && !k.ai) syncRotation();
  if (k.collector) paintDownloads();
  if (k.updates) pollUpdates();
  if (k.lighting) paintLighting();
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
  if (S.cfg?.notchAgents !== false && !S.displayOff) pollAi();
  if (S.hiddenState || S.displayOff) return; // tucked away or screen off → stay idle
  deps.startRunningPoll(); // running-app indicators + trash badge (independent of widgets)
  const k = pollKinds();
  pollKey = JSON.stringify(k);
  pollsActive = true;
  const { clock: hasClock, local: hasLocal, stats: hasStats, media: hasMedia, volume: hasVolume, clipboard: hasClipboard, devices: hasDevices, ai: hasAi } = k;
  // The Collector is event-driven: repaint rebuilt cards, no timer needed.
  if (k.collector) paintDownloads();
  if (k.lighting) paintLighting();
  // Updates and Cloud reuse their reading until it is 6 h / 30 min old, so a
  // check every ten minutes costs nothing until then.
  const hasSlow = k.updates;
  // Nothing live pinned → no timer at all (zero idle cost).
  if (!hasClock && !hasLocal && !hasStats && !hasMedia && !hasVolume && !hasClipboard && !hasDevices && !hasAi && !hasSlow) return;
  // First paint immediately so cards aren't blank until the first tick, then
  // schedule each poll a full interval out (no wasteful double-poll at start).
  paintPolls(k);
  const t0 = Date.now();
  const slow = pollSlowdown();
  // Device batteries change slowly and the query walks Windows' device list.
  pollDue = { stats: t0 + 2400 * slow, media: t0 + 3000 * slow, volume: t0 + 4000 * slow, clipboard: t0 + 4000 * slow, devices: t0 + 15000 * slow, ai: t0 + 300000 * slow, slow: t0 + 600000 };
  // Base cadence: 1 s only when a clock needs the second/minute rollover;
  // otherwise 1.5 s is plenty and lighter.
  const base = hasClock ? 1000 : hasStats || hasMedia || hasVolume || hasClipboard ? 1500 * slow : hasDevices || hasAi ? 15000 : 60000;
  widgetPollTimer = setInterval(() => {
    if (S.hiddenState || S.displayOff) return; // don't poll a tucked-away dock
    const now = Date.now();
    if (hasClock || hasLocal) tickClocks();
    if (hasStats && now >= pollDue.stats) { pollDue.stats = now + 2400 * slow; pollStats(); }
    if (hasMedia && now >= pollDue.media) { pollDue.media = now + recoveryInterval(S.nativeSupport, "media", 3000) * slow; pollMedia(); }
    if (hasVolume && now >= pollDue.volume) { pollDue.volume = now + recoveryInterval(S.nativeSupport, "volume", 4000) * slow; pollVolume(); }
    if (hasClipboard && now >= pollDue.clipboard) { pollDue.clipboard = now + 4000 * slow; pollClipboard(); }
    if (hasDevices && now >= pollDue.devices) { pollDue.devices = now + 15000 * slow; pollDevices(); }
    if (hasAi && now >= pollDue.ai) { pollDue.ai = now + 300000 * slow; pollAi(); }
    if (hasSlow && now >= pollDue.slow) { pollDue.slow = now + 600000; if (k.updates) pollUpdates(); }
  }, base);
}
// Nudge a specific poll right away (e.g. after a transport/volume button).
export function refreshMedia() { pollDue.media = Date.now() + recoveryInterval(S.nativeSupport, "media", 3000); if (!S.hiddenState) pollMedia(); }
export function refreshDevices() { return pollDevices(); }
export function refreshVolume() { pollDue.volume = Date.now() + recoveryInterval(S.nativeSupport, "volume", 4000); if (!S.hiddenState) pollVolume(); }
export function refreshClipboard() { pollDue.clipboard = 0; if (!S.hiddenState) pollClipboard(); }

/** After updating apps from the panel, read the list again. */
export function refreshUpdates() { updatesReading.refreshAfter().catch(() => {}).finally(() => pollUpdates()); }
