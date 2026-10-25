/* Booki notch — a tiny, always-reliable "home pill" window shown when the dock
   is tucked away. Click it to bring the dock back; drag it to a screen edge to
   move the dock (and notch) there. It's its own small window (never resized
   mid-flight) so the click target and repaint stay rock-solid.

   Hit-testing: the OS window is slightly larger than the painted pill (hover /
   glow room). CSS pointer-events alone cannot pass clicks through on WebView2,
   so we report the pill (or toast) rect to the backend; a watcher toggles
   ignore_cursor_events — same contract as the dock stage. */

import { config as configApi, dock as dockApi, emitNoticeAction, emitNotchMenu, emitNotchShape, invoke, onAgentActivity, onConfigChanged, onFileDrop, onNotchNear, onNotchToast, onNotchToastOut, onScreenBusy } from "./api.js";
import { singleFlight } from "./dock/async-cache.js";
import { icon } from "./icons.js";
import { imageSrc } from "./image-src.js";
import { observeSystem, recoveryInterval } from "./dock/system-observer.js";
import { showBookiMenu } from "./native-context-menu.js";
import { applyAccent } from "./util-color.js";
import { applyTheme } from "./theme.js";
import { paintedLook } from "./system-look.js";
import { t, setLang, ensureLang, curLang } from "./i18n.js";

import { resolveNotchMode } from "./notch-mode.js";
import { availW, availH, rectFromElement, hitSignature } from "./dock/geometry.js";
import { reduceMotion } from "./dock/motion.js";
import { clockParts, MEDIA_SVG } from "./dock/widget-view.js";
import { reportMaterial, shapeOf, applyMaterial, followFrames, onMaterialSettled } from "./material.js";

const root = document.documentElement;
const winApi = (typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.window) || null;
const inTauri = !!winApi;

let hoverTrigger = false; // reveal the dock when the pill is hovered
let revealDelay = 300; // like the Windows taskbar: a beat, so brushing past does not open it
// The live card only exists on a horizontal tab: a vertical one has no room
// for a line of text.
let canPeek = false; // the hover card can open (click trigger, horizontal edge)
let liveOn = { media: true, timer: true, battery: true, volume: true }; // Settings > Dock > Notch
let canLive = false; // live activity (music, timer, battery, agents) shows in the notch
let draggingNotch = false;
let lastHitSig = "";

const pill = document.getElementById("notch-pill");
const toastEl = document.getElementById("notch-toast");
const toastTitleEl = document.getElementById("notch-toast-title");
const toastSubEl = document.getElementById("notch-toast-sub");
const toastActionsEl = document.getElementById("notch-toast-actions");

let lookGeneration = 0;
async function applyLook() {
  const generation = ++lookGeneration;
  try {
    const cfg = await configApi.get();
    await ensureLang(cfg.language || "system");
    if (generation !== lookGeneration) return;
    setLang(cfg.language || "system");
    const label = t("notch.show");
    pill.title = label;
    pill.setAttribute("aria-label", label);
    applyTheme(cfg);
    const look = paintedLook(cfg);
    if (look.accent) applyAccent(root, look.accent);
    hoverTrigger = cfg.notchTrigger === "hover";
    revealDelay = Math.max(0, Math.min(1500, Number(cfg.revealDelay ?? 300) || 0));
    clearTimeout(hoverTimer);
    clearTimeout(cardTimer);
    if (!hoverTrigger && !pill.matches(":focus-visible")) closeCard();
    presenceMode = ["always", "edge"].includes(cfg.notchVisibility) ? cfg.notchVisibility : "auto";
    // The notch always lives on the dock's edge now.
    const edge = cfg.edge || "bottom";
    const shape = resolveNotchMode(cfg);
    document.body.classList.toggle("vertical", edge === "left" || edge === "right");
    // Shapes are exclusive; the smart dot reuses the floating placement.
    document.body.classList.toggle("peek", shape === "attached");
    document.body.classList.toggle("floating", shape === "floating");
    document.body.classList.toggle("smart", shape === "smart");
    focusTimers = focusTimersOf(cfg.pinned || []);
    agentsOn = cfg.notchAgents !== false;
    liveOn = { media: true, timer: true, battery: true, volume: true, ...(cfg.notchLive || {}) };
    musicWhilePlaying = cfg.notchMusic === "playing";
    if (!agentsOn) clearAgents();
    document.body.classList.remove("edge-top", "edge-bottom", "edge-left", "edge-right");
    document.body.classList.add(`edge-${edge}`);
    // Stacked under a visible dock the card would grow over the bar.
    // Live activity only needs room along the edge; the card additionally
    // needs the click trigger, since hovering already summons the dock.
    canLive = edge === "top" || edge === "bottom";
    canPeek = canLive && !hoverTrigger;
    document.body.classList.toggle("peekable", canLive);
    if (!canPeek) closeCard();
    pollMedia();
    pollBattery();
    readVolume();
    paintActivity();
    applyMaterial(look);
    paintPresence();
    scheduleHitReport();
  } catch (_) {
    /* keep defaults */
  }
}

applyLook();
onConfigChanged(applyLook);
matchMedia("(prefers-reduced-transparency: reduce)").addEventListener("change", applyLook);

// ─── Hit-testing: only the painted pill (or toast) is clickable ───────────
// Window-relative CSS px [x, y, w, h], matching the dock's set_hit_rects.
function reportNotchHitRects() {
  const toasting = document.body.classList.contains("toast");
  // Out of sight means out of the way: no blur, no clicks, the app behind
  // gets the whole edge.
  const away = !toasting && document.body.classList.contains("away");
  // Windows' blur fills a rectangle, so material.rs pulls it in from rounded
  // corners. On the slim tab, the live capsule and the dot that inset is a
  // third of the height or more, which split the pill into a blurred and a
  // flat band. Those shapes get the CSS fill alone; the card is big enough
  // for the real blur.
  const blurred = toasting || (document.body.classList.contains("card") && !document.body.classList.contains("card-leaving"));
  reportMaterial(document.visibilityState === "hidden" || away || !blurred ? [] : [shapeOf(toasting ? toastEl : pill)]);
  // During drag or toast, keep the whole notch window interactive so gestures
  // and the message aren't yanked out from under the cursor.
  const all = !!(draggingNotch || toasting);
  const rects = [];
  if (toasting) {
    const toastRect = rectFromElement(toastEl, 2) || rectFromElement(pill, 2);
    if (toastRect) rects.push(toastRect);
  } else if (!away) {
    // Tiny inflate (~1px) for aim comfort; never the full window padding.
    const pillRect = rectFromElement(pill, 1);
    if (pillRect) rects.push(pillRect);
  }
  shareShape();
  const sig = hitSignature(rects, all);
  if (sig === lastHitSig) return;
  lastHitSig = sig;
  invoke("set_notch_hit_rects", { rects, all }).catch(() => {});
}

// Tell the dock what the pill looks like once it settles. While it shows a
// live activity or the card, the dock opens by stretching that capsule into
// the bar instead of rising from the edge (dock/autohide.js).
let lastShapeSig = "";
function shareShape() {
  if (pill.getAnimations().some((animation) => animation.playState === "running")) return;
  const body = document.body.classList;
  const shape = {
    active: !body.contains("away") && !body.contains("toast") && (body.contains("live") || body.contains("card")),
    width: pill.offsetWidth,
    height: pill.offsetHeight,
    // Screen x of the capsule's centre (CSS px), so the dock can grow out of
    // the notch where it actually sits, also when it lives off-centre.
    cx: Math.round(window.screenX + pill.offsetLeft + pill.offsetWidth / 2),
    cy: Math.round(window.screenY + pill.offsetTop + pill.offsetHeight / 2),
    attached: body.contains("peek"),
  };
  const sig = JSON.stringify(shape);
  if (sig === lastShapeSig) return;
  lastShapeSig = sig;
  emitNotchShape(shape).catch(() => {});
}

let hitRaf = 0;
function scheduleHitReport() {
  if (hitRaf) return;
  hitRaf = requestAnimationFrame(() => {
    hitRaf = 0;
    reportNotchHitRects();
  });
}

// The pill only changes shape through class/style changes and CSS
// transitions, all observed below, so no polling timer is needed.
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
  toastActionsEl?.replaceChildren();
  if (toastActionsEl) toastActionsEl.hidden = true;
  document.body.classList.remove("toast-actionable");
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
  toastActionsEl?.replaceChildren();
  const actions = payload?.actionId && Array.isArray(payload.actions) ? payload.actions.slice(0, 3) : [];
  document.body.classList.toggle("toast-actionable", actions.length > 0);
  if (toastActionsEl) {
    toastActionsEl.hidden = !actions.length;
    actions.forEach((label, index) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = String(label); button.title = String(label);
      button.addEventListener("click", async (event) => {
        event.stopPropagation(); button.disabled = true;
        try { await emitNoticeAction(payload.actionId, index); button.innerHTML = icon("check"); }
        catch (_) { button.disabled = false; }
      });
      toastActionsEl.append(button);
    });
  }
  clearTimeout(toastTimer);
  // Safety clear if dock never blackouts (e.g. fullscreen ended early).
  toastTimer = setTimeout(clearNotchToast, actions.length ? 9600 : 3200);
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

// ─── Presence: out of the way while you work ──────────────────────────────
// "always" keeps the tab on screen whenever the dock is tucked away. "auto"
// (the default) lets it step aside while an app is maximized or fullscreen,
// "edge" keeps it out of sight everywhere. Either way it comes back when the
// pointer nears the edge, while its card is open or dragged, and for a few
// seconds when something new happens (the next song, a timer ending).
let presenceMode = "auto";
let screenBusy = false;
let scene = "desk";
let codeForeground = false;
let videoForeground = false;
let place = "desk";
let pointerNear = false;
let nearLinger = null;
let nudgeUntil = 0;
let nudgeTimer = null;
const NEAR_LINGER_MS = 900;
const NUDGE_MS = 4000;

function wantsAway(now = Date.now()) {
  // The pointer at the edge, an open card, or a drag means they want Booki.
  if (pointerNear || cardOpen || drag || draggingNotch) return false;
  if (presenceMode === "always" && !videoForeground && place !== "game") return false;
  // A player or a streaming page owns the picture, even in a normal window
  // and even if the notch is set to stay visible. Leaving the edge hides it.
  if (videoForeground || scene === "game") return true;
  // A creative app keeps the notch even when its window is maximized.
  if (place === "creative") return false;
  if (presenceMode === "always") return false;
  if (document.body.classList.contains("toast") || now < nudgeUntil) return false;
  return presenceMode === "edge" || screenBusy;
}

function paintPresence() {
  const away = wantsAway();
  const preparing = !away && (videoForeground || scene === "game") && !cardOpen;
  const changed = document.body.classList.contains("away") !== away
    || document.body.classList.contains("preparing") !== preparing;
  document.body.classList.toggle("away", away);
  document.body.classList.toggle("preparing", preparing);
  if (changed) scheduleHitReport();
}

function paintScene() {
  // The streaming window itself, not "something is playing somewhere".
  // A creative app stays, even maximized. A game, or any other maximized
  // window, steps aside. Music on the desktop is not a video scene.
  const watching = place === "video";
  const creative = place === "creative";
  const game = place === "game" || (screenBusy && !watching && !creative && !codeForeground);
  const next = watching ? "video" : game ? "game" : creative ? "creative" : codeForeground ? "code" : "desk";
  const changed = next !== scene;
  scene = next;
  document.body.classList.toggle("scene-game", scene === "game");
  document.body.classList.toggle("scene-video", scene === "video");
  document.body.classList.toggle("scene-code", scene === "code");
  document.body.classList.toggle("scene-creative", scene === "creative");
  // A video that just came forward should not keep a card open over the picture
  // unless the pointer is already there to use it.
  if ((watching || game) && !pointerNear && cardOpen) closeCard();
  if (changed) paintActivity();
  paintPresence();
}

// Windows reports app switches and title changes (a browser tab turning into
// a video); the slow timer only recovers from a missed event.
let foregroundTimer = null;
let nativeSupport = {};
async function pollForeground() {
  clearTimeout(foregroundTimer);
  if (!inTauri) return;
  foregroundTimer = setTimeout(pollForeground, recoveryInterval(nativeSupport, "foreground", 3000));
  try {
    place = String(await invoke("foreground_place") || "desk");
    codeForeground = place === "code";
    videoForeground = place === "video";
  } catch (_) {
    place = "desk";
    codeForeground = false;
    videoForeground = false;
  }
  paintScene();
}
pollForeground();

/** Show the tab for a moment because something changed worth a glance. */
function nudgePresence(ms = NUDGE_MS) {
  if (videoForeground || scene === "game" || presenceMode === "always") return;
  nudgeUntil = Date.now() + ms;
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(paintPresence, ms + 20);
  paintPresence();
}

onScreenBusy((value) => {
  screenBusy = value;
  paintScene();
  paintPresence();
});
onNotchNear((value) => {
  clearTimeout(nearLinger);
  if (value) {
    pointerNear = true;
    paintPresence();
    return;
  }
  // Leaving by a few pixels should not blink it away.
  nearLinger = setTimeout(() => {
    pointerNear = false;
    paintPresence();
  }, NEAR_LINGER_MS);
});

// Each time the notch is shown, ask where things stand so it starts out of
// the way over a maximized app instead of flashing in and then leaving.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    clearTimeout(nearLinger);
    pointerNear = false;
    return;
  }
  if (presenceMode === "always" || !inTauri) return;
  invoke("notch_screen_busy").then((value) => {
    screenBusy = !!value;
    paintPresence();
  }).catch(() => {});
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
const cBar = document.getElementById("nc-bar");
/** A thin bar under the text: time left, battery or volume level (0..1); null hides it. */
/** How far the track is, from the last reading plus the time since. */
function mediaProgress(now = Date.now()) {
  const duration = Number(media?.duration_ms);
  if (!duration || media.position_ms == null) return null;
  const position = Number(media.position_ms) + (media.playing ? now - (media.fetchedAt || now) : 0);
  return Math.min(1, position / duration);
}

function cardBar(fraction, tone = "") {
  cBar.hidden = fraction == null;
  if (fraction == null) return;
  cBar.dataset.tone = tone;
  cBar.firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
}
let media = null; // { title, artist, playing, thumb } or null
let mediaPeekUntil = 0;
let musicWhilePlaying = false; // Settings: music stays in the notch while it plays
let mediaKey = "";
let mediaSeenAt = 0;
const PAUSED_MEDIA_MS = 60000;
const hasRecentMedia = () => !!(media && (media.title || media.artist) && (media.playing || Date.now() - mediaSeenAt < PAUSED_MEDIA_MS));
const MEDIA_PEEK_MS = 5000;
let mediaTimer = null;
let cardTimer = null;
let cardOpen = false;

// ─── Activities ──────────────────────────────────────────────────────────
// The tab shows the one thing worth a glance, in this order: a volume change
// (for two seconds), a running focus timer, a focus block that just ended
// (for a minute, with the next task), music that is playing, a battery
// running out. Nothing else; at rest it stays a quiet tab or dot.
let focusTimers = [];
let battery = null; // { level, charging } or null on a desktop
let volumeFlash = null; // { level, muted, until } after a volume change
let activityTick = null;
let activityExpiry = null;
const VOLUME_FLASH_MS = 2000;
const CHARGE_FLASH_MS = 2500;
let chargeFlash = null;
const FOCUS_DONE_MS = 60000;
const ringEl = document.getElementById("nl-ring");
const lText = document.getElementById("nl-text");

function focusTimersOf(items = []) {
  const out = [];
  for (const item of items) {
    if (item.kind === "group") out.push(...focusTimersOf(item.children || []));
    else if (item.kind === "widget" && ["focus", "timer"].includes(item.widget) && item.style?.endsAt) out.push(item.style);
  }
  return out;
}

// ─── AI agents (Claude Code, Codex) ──────────────────────────────────────
// The backend (agent_activity.rs) watches their local session logs and
// emits only state changes. Waiting for approval outranks everything but a
// volume flash and stays until answered; working stays quietly while it
// lasts; a finished turn is a 5 s notice, several queue up one by one.
const AGENT_NAMES = {
  claude: "Claude", codex: "Codex", cursor: "Cursor", opencode: "OpenCode",
  gemini: "Gemini", windsurf: "Windsurf", goose: "Goose", cline: "Cline", continue: "Continue", "claude-app": "Claude",
};
const AGENT_ICONS = {
  claude: "ai-claude", codex: "ai-openai", cursor: "ai-cursor", opencode: "ai-opencode",
  gemini: "ai-gemini", windsurf: "ai-windsurf", goose: "ai-goose", cline: "ai-cline", continue: "ai-continue", "claude-app": "ai-claude",
};
const AGENT_DONE_MS = 5000;
// Several live states take turns at this pace; one waiting on you stays put.
const AGENT_ROTATE_MS = 6000;
let agentsOn = true;
const agents = new Map(); // provider -> { state: "working" | "waiting", since }
let agentDone = null; // { provider, since, until }
const agentDoneQueue = [];
const lAgent = document.getElementById("nl-agent");
const cAgent = document.getElementById("nc-agent");
const lState = document.getElementById("nl-state");

function clearAgents() {
  agents.clear();
  agentDone = null;
  agentDoneQueue.length = 0;
}

function agentLabel(state, provider) {
  const key = state === "waiting"
    ? "notch.agentPaused"
    : { working: "notch.agentWorking", waiting: "notch.agentPaused", done: "notch.agentDone", error: "notch.agentError" }[state];
  return t(key).replace("{agent}", () => AGENT_NAMES[provider] || provider);
}

function nextAgentDone(now) {
  if (agentDone && agentDone.until > now) return agentDone;
  agentDone = null;
  const next = agentDoneQueue.shift();
  if (next) agentDone = { ...next, until: now + AGENT_DONE_MS };
  return agentDone;
}

/** The notch itself cannot show it (vertical edge, hover trigger): fall
 *  back to the notice chip, which also covers the tab stepping aside. */
function agentNotice(state, provider) {
  if (videoForeground || scene === "game" || (screenBusy && scene !== "code" && scene !== "creative")) return;
  if (canLive) nudgePresence();
  else invoke("notch_notice", { title: agentLabel(state, provider), detail: "" }).catch(() => {});
}

function applyAgent({ provider, state, since } = {}, quiet = false) {
  if (!agentsOn || !AGENT_NAMES[provider]) return;
  const before = agents.get(provider)?.state;
  if (state === "working" || state === "waiting" || state === "error") {
    agents.set(provider, { state, since: Number(since) || Date.now() });
    if (state === "waiting" && before !== "waiting" && !quiet) agentNotice(state, provider);
    if (state === "error" && before !== "error" && !quiet) agentNotice(state, provider);
  } else {
    agents.delete(provider);
    if (state === "done" && !quiet && !agentDoneQueue.some((d) => d.provider === provider) && agentDone?.provider !== provider) {
      agentDoneQueue.push({ provider, since: Number(since) || Date.now() });
      agentNotice(state, provider);
    }
  }
  paintActivity();
}

function agentActivity(now = Date.now()) {
  const all = [...agents].map(([provider, activity]) => ({ provider, ...activity }));
  const urgent = all.filter((row) => ["waiting", "error"].includes(row.state));
  const eligible = urgent.length ? urgent : all;
  return eligible.length ? eligible[Math.floor(now / AGENT_ROTATE_MS) % eligible.length] : null;
}

onAgentActivity((payload) => applyAgent(payload));
setInterval(() => {
  if (canLive && !document.hidden && !cardOpen && (agents.size || focusTimers.length)) paintActivity();
}, AGENT_ROTATE_MS);
if (inTauri) invoke("agent_activity").then((list) => { for (const a of Array.isArray(list) ? list : []) applyAgent(a, true); }).catch(() => {});

function currentActivity(now = Date.now()) {
  // A movie, a game, or any maximized app that is not an editor: the notch
  // stays out of the picture. At the edge they asked for it, so the card
  // can still pause the video. Music peeks only when the desktop is free.
  // Over a video or a game the notch stays a dot. The dock still opens from
  // that dot, on hover or on click, whichever is already chosen.
  if ((videoForeground || scene === "game") && !cardOpen) return null;
  // Over a maximized app only what needs you now gets through: an agent
  // waiting or done, a focus block ending, a battery running out, the
  // charger, or the volume you just changed. Music and progress wait.
  if (screenBusy && scene !== "code" && scene !== "creative") {
    const urgent = idleActivity(now);
    return urgent && BUSY_KINDS.has(urgent.kind) && !(urgent.kind === "battery" && urgent.level > 10) ? urgent : null;
  }
  return idleActivity(now);
}

const BUSY_KINDS = new Set(["volume", "agent-waiting", "agent-error", "agent-done", "charging", "done", "battery"]);
function idleActivity(now) {
  if (liveOn.volume && volumeFlash && volumeFlash.until > now) return { kind: "volume", level: volumeFlash.level, muted: volumeFlash.muted, until: volumeFlash.until };
  const agent = agentsOn ? agentActivity(now) : null;
  if (agent?.state === "waiting") return { kind: "agent-waiting", provider: agent.provider, since: agent.since };
  if (agent?.state === "error") return { kind: "agent-error", provider: agent.provider, since: agent.since };
  const done = agentsOn ? nextAgentDone(now) : null;
  if (done) return { kind: "agent-done", provider: done.provider, since: done.since, until: done.until };
  if (liveOn.battery && chargeFlash && chargeFlash.until > now) return { kind: "charging", level: chargeFlash.level, until: chargeFlash.until };
  // Music gets a brief introduction, including while an editor is focused.
  // Afterwards it remains available on hover without occupying the capsule.
  if (liveOn.media && media?.playing && (musicWhilePlaying || mediaPeekUntil > now)) return { kind: "media", until: musicWhilePlaying ? now + MEDIA_PEEK_MS : mediaPeekUntil };
  const timer = liveOn.timer && focusTimers.find((style) => Number(style.endsAt) > now);
  if (timer) {
    if (agent && !cardOpen && Math.floor(now / AGENT_ROTATE_MS) % 2) return { kind: "agent", provider: agent.provider, since: agent.since };
    const total = Math.min(180, Math.max(1, Number(timer.minutes) || 25)) * 60;
    const left = Math.max(0, Math.ceil((Number(timer.endsAt) - now) / 1000));
    return { kind: "timer", left, progress: Math.min(1, left / total) };
  }
  const ended = liveOn.timer && focusTimers.find((style) => Number(style.endsAt) <= now && now - Number(style.endsAt) < FOCUS_DONE_MS);
  if (ended) {
    const next = (Array.isArray(ended.tasks) ? ended.tasks : []).find((task) => !task.done)?.text || "";
    return { kind: "done", next, until: Number(ended.endsAt) + FOCUS_DONE_MS };
  }
  // Urgency decides the order: a nearly flat battery outranks the music, a
  // merely low one waits behind it.
  const low = liveOn.battery && battery && !battery.charging && battery.level >= 0 ? battery.level : 101;
  if (low <= 10) return { kind: "battery", level: low };
  if (scene === "code" && agent) return { kind: "agent", provider: agent.provider, since: agent.since };
  // Music opens the notch for a few seconds when it starts or the track
  // changes, then lets it settle; it stays in the card on hover.
  if (agent) return { kind: "agent", provider: agent.provider, since: agent.since };
  if (low <= 15) return { kind: "battery", level: low };
  return null;
}

let lastActivityKind = "";
const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function paintActivity() {
  const activity = canLive ? currentActivity() : null;
  const kind = activity?.kind || "";
  // A timer that just ended or a battery that just ran low is worth a glance
  // even while the tab is out of the way.
  if (kind !== lastActivityKind) {
    if (lastActivityKind === "timer" || kind === "battery" || kind === "charging") nudgePresence();
    lastActivityKind = kind;
  }
  document.body.classList.toggle("live", !!activity);
  for (const name of ["timer", "done", "volume", "media", "battery", "charging", "agent", "agent-waiting", "agent-done", "agent-error"]) document.body.classList.toggle(`act-${name}`, kind === name);
  if (kind === "timer") {
    lText.textContent = mmss(activity.left);
    ringEl.style.strokeDashoffset = String(100 - activity.progress * 100);
  } else if (kind === "volume") {
    lText.textContent = activity.muted ? t("notch.muted") : `${activity.level}%`;
    ringEl.style.strokeDashoffset = String(100 - (activity.muted ? 0 : activity.level));
  } else if (kind === "done") {
    lText.textContent = t("notch.focusDone");
  } else if (kind === "battery" || kind === "charging") {
    lText.textContent = `${activity.level}%`;
  } else if (kind.startsWith("agent")) {
    const state = kind === "agent" ? "working" : kind.slice(6);
    const name = AGENT_NAMES[activity.provider] || activity.name || activity.provider;
    const phrase = state === "ready"
      ? t("notch.usageReady").replace("{agent}", () => name)
      : agentLabel(state, activity.provider);
    lText.textContent = state === "ready" ? phrase : name;
    lText.title = phrase;
    const mark = AGENT_ICONS[activity.provider] || "sparkles";
    if (lAgent.dataset.icon !== mark) {
      lAgent.innerHTML = icon(mark);
      lAgent.dataset.icon = mark;
    }
    const statusMark = { working: "agent-working", waiting: "agent-waiting", done: "agent-done", ready: "agent-done", error: "agent-error" }[state] || "agent-working";
    if (lState.dataset.icon !== statusMark) {
      lState.innerHTML = icon(statusMark);
      lState.dataset.icon = statusMark;
    }
    pill.setAttribute("aria-label", `${phrase}. ${t("notch.show")}`);
  } else {
    pill.setAttribute("aria-label", t("notch.show"));
  }
  for (const name of Object.keys(AGENT_NAMES)) document.body.classList.toggle(`agent-${name}`, kind.startsWith("agent") && activity.provider === name);
  // Tick once a second only while a timer is visible; a passing state
  // repaints once when it runs out.
  clearInterval(activityTick);
  clearTimeout(activityExpiry);
  activityTick = kind === "timer" ? setInterval(() => { paintActivity(); if (cardOpen) paintCard(); }, 1000)
    // An agent's card shows how long it has been at it; refresh that slowly.
    : kind.startsWith("agent") ? setInterval(() => { if (cardOpen) paintCard(); }, 30000) : null;
  activityExpiry = activity?.until ? setTimeout(paintActivity, Math.max(50, activity.until - Date.now() + 20)) : null;
  paintCard();
}

const pollBattery = singleFlight(async () => {
  clearTimeout(batteryTimer);
  if (!canLive || !inTauri) return;
  const before = battery;
  try {
    const stats = await invoke("system_stats");
    battery = stats && stats.battery >= 0 ? { level: Math.round(stats.battery), charging: !!stats.charging } : null;
  } catch (_) {
    battery = null;
  }
  // Plugging the charger in gets a short confirmation, like a phone's.
  if (before && !before.charging && battery?.charging) chargeFlash = { level: battery.level, until: Date.now() + CHARGE_FLASH_MS };
  paintActivity();
  // A desktop has no battery: stop asking.
  if (battery) batteryTimer = setTimeout(pollBattery, 60000);
});
let batteryTimer = null;

// Windows "Do not disturb": a subtle moon on the tab, read every ten seconds.
const dndEl = document.getElementById("notch-dnd");
if (dndEl) dndEl.innerHTML = icon("moon");
async function pollDndState() {
  let on = false;
  try { on = (await invoke("dnd_state")) === true; } catch (_) { on = false; }
  document.body.classList.toggle("dnd", on);
}
if (inTauri) { pollDndState(); setInterval(() => { if (!document.hidden) pollDndState(); }, 10000); }

let lastTrack = "";
function paintMedia() {
  // A new song is worth a glance even when the tab is out of the way.
  const track = media?.playing ? `${media.title || ""}\u0000${media.artist || ""}` : "";
  if (track && lastTrack && track !== lastTrack && !screenBusy && !videoForeground) nudgePresence();
  if (track) lastTrack = track;
  const art = imageSrc((media && media.thumb) || "");
  for (const img of [lArt, cArt]) {
    if (img.getAttribute("src") !== art) {
      if (art) img.src = art;
      else img.removeAttribute("src");
    }
  }
  document.body.classList.toggle("has-art", !!art);
  paintActivity();
}

function paintCard() {
  const activity = currentActivity();
  cardBar(null);
  const provider = activity?.kind.startsWith("agent") ? activity.provider : "";
  cAgent.hidden = !provider;
  if (provider) {
    const mark = AGENT_ICONS[provider] || "sparkles";
    if (cAgent.dataset.icon !== mark) {
      cAgent.innerHTML = icon(mark);
      cAgent.dataset.icon = mark;
    }
  }
  if (activity?.kind === "timer") {
    cTitle.textContent = mmss(activity.left);
    cSub.textContent = t("w.focus");
    cardBar(activity.progress, "focus");
    cPlay.hidden = true;
    document.body.classList.add("card-clock");
    return;
  }
  if (activity?.kind === "volume") {
    cTitle.textContent = activity.muted ? t("notch.muted") : `${activity.level}%`;
    cSub.textContent = t("w.volume");
    cardBar(activity.muted ? 0 : activity.level / 100, "volume");
    cPlay.hidden = true;
    document.body.classList.add("card-clock");
    return;
  }
  if (activity?.kind === "done") {
    cTitle.textContent = t("focus.finished");
    cSub.textContent = activity.next ? t("notch.nextTask").replace("{task}", () => activity.next) : t("notch.takeBreak");
    cPlay.hidden = true;
    document.body.classList.add("card-clock");
    return;
  }
  if (activity?.kind.startsWith("agent")) {
    const state = activity.kind === "agent" ? "working" : activity.kind.slice(6);
    cTitle.textContent = agentLabel(state, activity.provider);
    const withMedia = activity.kind === "agent" && hasRecentMedia();
    // Working shows how long the turn has run; the other states, when they began.
    cSub.textContent = withMedia ? media.title || media.artist : state === "working" ? agentDuration(activity.since) : agentElapsed(activity.since);
    cPlay.hidden = !withMedia;
    if (withMedia) {
      cPlay.innerHTML = media.playing ? MEDIA_SVG.pause : MEDIA_SVG.play;
      cPlay.setAttribute("aria-label", t("w.playPause"));
      cPlay.title = media.title || t("w.playPause");
    }
    document.body.classList.toggle("card-clock", !withMedia);
    return;
  }
  if (activity?.kind === "battery" || activity?.kind === "charging") {
    cTitle.textContent = `${activity.level}%`;
    cSub.textContent = t(activity.kind === "charging" ? "notch.charging" : "notch.batteryLow");
    cardBar(activity.level / 100, activity.kind === "charging" ? "charging" : "low");
    cPlay.hidden = true;
    document.body.classList.add("card-clock");
    return;
  }
  if (hasRecentMedia()) {
    cTitle.textContent = media.title || media.artist;
    cSub.textContent = media.title ? media.artist : "";
    cardBar(mediaProgress(), "media");
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

/** "3 min" / "1 h 5 min": how long a turn has been running. */
function agentDuration(since, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Number(since || now)) / 60000));
  const unit = (value, name) => {
    try { return new Intl.NumberFormat(curLang(), { style: "unit", unit: name, unitDisplay: "short" }).format(value); } catch (_) { return `${value}`; }
  };
  if (minutes < 1) return `< ${unit(1, "minute")}`;
  if (minutes < 60) return unit(minutes, "minute");
  return `${unit(Math.floor(minutes / 60), "hour")} ${minutes % 60 ? unit(minutes % 60, "minute") : ""}`.trim();
}

/** "hace 2 min" / "2 min ago", in the notch's language. */
function agentElapsed(since, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Number(since || now)) / 1000));
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(curLang(), { numeric: "auto", style: "short" }); } catch (_) { return ""; }
  if (seconds < 60) return rtf.format(-seconds, "second");
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
  return rtf.format(-Math.floor(seconds / 3600), "hour");
}


// Media is polled only while it can be shown, and slower when nothing plays:
// the WinRT session query is cheap but not free.
const pollMedia = singleFlight(async () => {
  clearTimeout(mediaTimer);
  if (!canLive || !inTauri) {
    media = null;
    paintMedia();
    return;
  }
  try {
    media = await invoke("media_info");
    if (media) media.fetchedAt = Date.now();
  } catch (_) {
    media = null;
  }
  if (media?.playing || !mediaSeenAt) mediaSeenAt = Date.now();
  if (!hasRecentMedia() && cardOpen && !currentActivity()) closeCard();
  const key = media?.playing ? `${media.title || ""}\u0000${media.artist || ""}` : "";
  if (key && key !== mediaKey && !videoForeground) mediaPeekUntil = Date.now() + MEDIA_PEEK_MS;
  mediaKey = key;
  paintScene();
  paintMedia();
  mediaTimer = setTimeout(pollMedia, recoveryInterval(nativeSupport, "media", media && media.playing ? 2500 : 6000));
});

// A volume change (keys, mixer or the dock's wheel) flashes the level on the
// tab while the dock is tucked away. The first reading only sets a baseline.
let lastVolume = null;
const readVolume = singleFlight(async () => {
  if (!canLive || !inTauri) return;
  let info = null;
  try { info = await invoke("volume_info"); } catch (_) {}
  if (!Array.isArray(info)) return;
  const [level, muted] = info;
  const changed = lastVolume && (lastVolume.level !== level || lastVolume.muted !== muted);
  lastVolume = { level, muted };
  if (!changed) return;
  volumeFlash = { level, muted, until: Date.now() + VOLUME_FLASH_MS };
  paintActivity();
});

observeSystem(dockApi, { foreground: pollForeground, media: () => { if (canLive) pollMedia(); }, volume: readVolume, power: () => pollBattery() }, (support) => { nativeSupport = support; });

// Hit rects must follow the morph while its width/height transition runs.
function followMorph(ms = 520) { // --dur-spring
  followFrames(reportNotchHitRects, ms);
}

/** Worth a card: something live, or media with a title. A clock alone is
 *  not — the taskbar already shows it, and a big empty card just covers
 *  what the person is working on. */
function cardHasContent() {
  return !!currentActivity() || hasRecentMedia();
}
let cardWatch = null;
function openCard() {
  if (videoForeground || scene === "game") return;
  if (!canPeek || cardOpen || drag || !cardHasContent()) return;
  paintCard();
  // The window can turn click-through under a still pointer and never send
  // pointerleave; close the card as soon as the pointer is really elsewhere.
  clearInterval(cardWatch);
  cardWatch = setInterval(() => {
    if (cardOpen && !pill.matches(":hover") && !pill.contains(document.activeElement)) closeCard();
    else if (cardOpen && media?.playing && !cBar.hidden && cBar.dataset.tone === "media") paintCard();
  }, 1000);
  pill.classList.add("mat-wait");
  clearTimeout(leaveFallback);
  document.body.classList.remove("card-leaving");
  cardOpen = true;
  document.body.classList.add("card");
  followMorph();
}
function closeCard() {
  clearTimeout(cardTimer);
  clearInterval(cardWatch);
  if (!cardOpen) return;
  cardOpen = false;
  // Windows takes the blur away a beat after we ask. Shrinking first left a
  // blurred sheet the size of the card behind the tab: hold the card, solid,
  // until the blur is gone, then shrink.
  if (document.body.classList.contains("native-material") && document.body.classList.contains("surface-glass")) {
    pill.classList.add("mat-wait");
    document.body.classList.add("card-leaving");
    clearTimeout(leaveFallback);
    leaveFallback = setTimeout(finishClose, 250);
    reportNotchHitRects();
    return;
  }
  finishClose();
}
let leaveFallback = null;
function finishClose() {
  clearTimeout(leaveFallback);
  if (cardOpen) return;
  document.body.classList.remove("card", "card-leaving");
  followMorph();
  paintPresence();
}
// The card is solid until the blur is confirmed behind it and its morph has
// settled; a translucent card without blur showed the desktop for a moment.
onMaterialSettled((shapes) => {
  if (document.body.classList.contains("card-leaving")) {
    if (!shapes) finishClose();
    return;
  }
  if (shapes && !pill.getAnimations().some((a) => a.playState === "running")) pill.classList.remove("mat-wait");
});

// Intent delay in, a short grace out: brushing past the edge does nothing,
// and leaving by a pixel does not snap it shut.
pill.addEventListener("pointerenter", () => {
  if (!hoverTrigger) return;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(openCard, 350);
});
pill.addEventListener("pointerleave", () => {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(closeCard, 160);
});

// Keyboard: focusing the pill opens the same card, so play/pause is reachable.
pill.addEventListener("focus", () => { if (!pill.matches(":focus-visible")) return; clearTimeout(cardTimer); openCard(); });
pill.addEventListener("blur", (e) => { if (!pill.contains(e.relatedTarget)) { clearTimeout(cardTimer); cardTimer = setTimeout(closeCard, 220); } });

cPlay.addEventListener("pointerdown", (e) => e.stopPropagation());
cPlay.addEventListener("click", async (e) => {
  e.stopPropagation();
  try {
    await invoke("media_toggle");
    if (media) media.playing = !media.playing;
    paintMedia();
  } catch (_) { /* the session is gone; the poll below tells the truth */ }
  setTimeout(pollMedia, 400);
});

pill.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    invoke("notch_reveal").catch(() => {});
  }
});

// A hidden notch has nothing to show; drop the card so the next reveal starts
// from the tab.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") closeCard();
});

// Dragging a file NEAR the notch reveals the dock — otherwise there'd be
// nowhere to drop while the dock is tucked away (its window is hidden).
onFileDrop({ onEnter: () => invoke("notch_reveal").catch(() => {}) });

// Click = reveal the dock. Drag to a screen edge = move the dock there.
let drag = null;

// Optional: reveal on hover (when the user chose the "hover" trigger). A short
// intent delay avoids opening on an accidental brush-past.
let hoverTimer = null;
pill.addEventListener("pointerenter", () => {
  if (!hoverTrigger) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => { if (hoverTrigger) invoke("reveal_dock").catch(() => {}); }, revealDelay);
});
pill.addEventListener("pointerleave", () => clearTimeout(hoverTimer));

// Re-run the entrance animation every time the notch window is shown,
// so the dock→notch transition reads as a continuous transformation.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  pill.classList.remove("notch-enter");
  void pill.offsetWidth; // force reflow
  pill.classList.add("notch-enter");
  // Ends on its own; the class must not outlive it (a throttled timer
  // once left it on and the tab could no longer step out of the way).
  pill.addEventListener("animationend", () => pill.classList.remove("notch-enter"), { once: true });
  setTimeout(() => pill.classList.remove("notch-enter"), 600);
  scheduleHitReport();
});

/** Current notch window size — vertical notches are tall, not 184×26. */
function notchSize() {
  const w = Math.max(24, Math.round(window.innerWidth || 184));
  const h = Math.max(16, Math.round(window.innerHeight || 26));
  return { w, h };
}

pill.addEventListener("pointerdown", (e) => {
  // Right-click opens the notch's own menu; it must not reveal the dock too.
  if (e.button !== 0) return;
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
  paintPresence();
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
    invoke("notch_reveal").catch(() => {});
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

// A cancelled drag (touch, pen, or the window hiding mid-press) never gets a
// pointerup; without this the notch would stay "dragging" and fully clickable.
function cancelNotchDrag() {
  if (!drag) return;
  drag = null;
  draggingNotch = false;
  cancelAnimationFrame(dragRaf);
  dragRaf = 0;
  paintPresence();
  scheduleHitReport();
}
pill.addEventListener("pointercancel", cancelNotchDrag);
pill.addEventListener("lostpointercapture", cancelNotchDrag);

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

// Never expose WebView navigation commands over Booki chrome. Right-click
// brings the dock back and opens the dock's own menu, so the notch and the
// dock share one menu; the small native one stays as a fallback when the
// dock cannot come back (a fullscreen app owns the screen).
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!inTauri || document.body.classList.contains("toast")) return showBookiMenu(event);
  invoke("notch_reveal_for_menu")
    .then((revealed) => (revealed ? emitNotchMenu() : showBookiMenu(event)))
    .catch(() => showBookiMenu(event));
});
