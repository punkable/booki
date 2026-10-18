/* Auto-hide: when the bar tucks into the notch and when it comes back. */

import { dock as dockApi } from "../api.js";
import { decideVisible, wantsHidden } from "./visibility-policy.js";
import { t } from "../i18n.js";
import { S } from "./state.js";
import { reportHitRects } from "./hit-regions.js";
import { applyFrame } from "./frame.js";
import { stopPolls, startPolls } from "./live-widgets.js";
import { reduceMotion } from "./motion.js";

// ───────────────────────── Auto-hide ─────────────────────────
// Modes: "off" (always visible) · "smart" (hide when a window covers the dock,
// driven by the backend occlusion watcher) · "edge" (hide, reveal on hover).

let desktopActive = false;
let occluded = false; // last occlusion signal from the backend (smart mode)
let blackoutTimer = null;
let occRevealTimer = null; // debounce for the smart-mode auto-reveal
let hiddenBeforeFullscreen = false;
const SMART_REVEAL_DELAY = 1100;

// Fullscreen game/movie/presentation → get completely out of the way: flash a
// brief toast, then hide BOTH the bar and the notch. Restore when it ends.
const FS_TOAST_HOLD_MS = 1500;
const FS_TOAST_FADE_MS = 260;

function hideInFullscreenEnabled() {
  return S.cfg.hideInFullscreen !== false;
}

function clearFsTimers() {
  clearTimeout(blackoutTimer);
  blackoutTimer = null;
  clearTimeout(occRevealTimer);
  occRevealTimer = null;
  clearTimeout(S.hideTimer);
  S.hideTimer = null;
}

export function onFullscreenSignal(value) {
  clearFsTimers();
  if (value) {
    // Already blacked out — ignore repeat signals.
    if (S.fullscreen) return;
    // Opt-out: stay visible. Do NOT set `fullscreen` or pinOpen/tryTuck break.
    if (!hideInFullscreenEnabled()) return;
    S.fullscreen = true;
    hiddenBeforeFullscreen = S.hiddenState;
    S.pinnedReveal = false;
    S.hiddenState = true;
    stopPolls(); // fullscreen game/movie → go fully idle
    document.body.classList.add("tucked");
    // Already tucked into the notch → skip the toast chip; blackout quietly.
    if (hiddenBeforeFullscreen) {
      blackoutTimer = setTimeout(() => {
        if (S.fullscreen) dockApi.hideAll();
      }, 320);
      return;
    }
    // Calm two-line status on the notch, then fade into full blackout.
    dockApi.notchToast(t("fs.hiddenTitle"), t("fs.hiddenSub"));
    blackoutTimer = setTimeout(() => {
      if (!S.fullscreen) return;
      dockApi.notchToastDismiss().catch(() => {});
      blackoutTimer = setTimeout(() => {
        if (S.fullscreen) dockApi.hideAll();
      }, FS_TOAST_FADE_MS);
    }, FS_TOAST_HOLD_MS);
  } else {
    // Never entered a blackout (hide was off) — nothing to restore.
    if (!S.fullscreen) return;
    S.fullscreen = false;
    const wasTucked = hiddenBeforeFullscreen;
    hiddenBeforeFullscreen = false;
    document.body.classList.remove("tucked");
    // clear_fullscreen_blackout must finish before hide/reveal or Rust no-ops.
    void (async () => {
      await dockApi.clearFullscreenBlackout().catch(() => {});
      await dockApi.notchToastDismiss().catch(() => {});
      // Another app went fullscreen meanwhile: its blackout wins.
      if (S.fullscreen) return;
      // Restore the pre-FS visibility for every hide mode, not only smart+click.
      // setupAutoHide() starts edge visible — that would pop a tucked dock open.
      if (wasTucked && !(hideMode() === "smart" && desktopActive && !S.manualHide)) {
        S.hiddenState = true;
        stopPolls();
        document.body.classList.add("tucked");
        await dockApi.hideDock(S.cfg.edge).catch(() => {});
      } else if (hideMode() === "off") {
        S.hiddenState = false;
        startPolls();
        document.body.classList.add("revealing");
        await dockApi.revealDock().catch(() => {});
        applyFrame();
        setTimeout(() => document.body.classList.remove("revealing"), 380);
      } else {
        S.hiddenState = false;
        setupAutoHide();
      }
    })();
  }
}

export function hideMode() {
  return S.cfg.autoHideMode || (S.cfg.autoHide ? "edge" : "off");
}

let handoffTimer = null; let revealTimer = null;
// Matches the CSS: leaving takes --dur-2, arriving --dur-4.
const HIDE_MS = 167;
const REVEAL_MS = 250;

export function setHidden(v) {
  if (v === S.hiddenState) return;
  S.hiddenState = v;
  clearTimeout(handoffTimer); clearTimeout(revealTimer);
  if (v) document.body.classList.remove("revealing");
  // Fully STOP the widget poll while tucked away (not just skip it) — a truly
  // idle dock burns no timer wakeups; it resumes the moment it reappears.
  if (v) stopPolls();
  else startPolls();
  if (v) {
    // The window is about to go away — the pointer can't be "inside" anymore.
    // (Windows won't fire pointerout for a window that hides under the cursor.)
    S.pointerInside = false;
    // Slide the bar into its edge, then hand off to the notch window (and
    // hide the dock window) once it is out of sight.
    document.body.classList.add("tucked");
    handoffTimer = setTimeout(() => {
      if (S.hiddenState) dockApi.hideDock(S.cfg.edge);
    }, reduceMotion() ? 0 : HIDE_MS + 16);
  } else {
    // Show the dock window (and hide the notch), make sure it's sized to the full
    // bar, then slide the bar back in. Force the stage fully interactive during
    // the reveal animation so early clicks aren't lost to stale hit rects.
    document.body.classList.add("revealing");
    dockApi.revealDock();
    applyFrame();
    setTimeout(() => {
      if (!S.hiddenState) document.body.classList.remove("tucked");
    }, 40);
    revealTimer = setTimeout(() => {
      document.body.classList.remove("revealing");
      reportHitRects();
    }, 40 + REVEAL_MS + 30);
  }
}

// ─── The ONE rule of hiding ───────────────────────────────────────────────
// The dock NEVER tucks away while you're using it: pointer on the bar, a drag
// in flight, an open group/menu/popover. Timers and occlusion signals don't
// hide directly — they go through tryTuck(), which defers until the gesture
// ends; the pointer leaving the window is what finishes a deferred hide.
// The auto-hide delay is purely a grace period AFTER you leave, never a
// countdown while you're on the dock.

// Snapshot of everything the visibility policy needs. Built in ONE place so
// every caller below decides from the same inputs — the old code had each of
// reveal(), tryTuck() and onOcclusionSignal() testing a different subset of the
// flags in a different order, which is how a fix for one case kept breaking
// another.
function visibilityState() {
  return {
    mode: hideMode(),
    trigger: S.cfg.notchTrigger || "click",
    fullscreen: S.fullscreen,
    previewing: S.previewing,
    occluded,
    desktop: desktopActive,
    manualHide: S.manualHide,
    summoned: S.pinnedReveal,
    draggingFile: S.draggingFile,
    pointerInside: S.pointerInside,
  };
}

// Would the current mode want the dock hidden right now (ignoring the user's
// ongoing interaction)?
export function wantsHideNow() {
  return wantsHidden(visibilityState());
}

// Anything mid-use that a hide would yank out from under the user.
// Note: pinnedReveal alone is NOT enough — occlusion must still be able to
// tuck a notch-summoned dock once the user is working in another app.
function interacting() {
  return (
    S.pointerInside || S.dragging || S.draggingFile || S.stackOpen ||
    !!S.edgeMove || document.body.classList.contains("menu-open") ||
    !!document.querySelector(".trash-pop, .note-editor, .coach, .productivity-panel")
  );
}

// Hide if the user isn't mid-something; otherwise wait — the pointer-out
// handler re-checks when they actually leave.
function tryTuck() {
  if (S.fullscreen || S.previewing || !wantsHideNow()) return;
  if (interacting()) return; // deferred: pointer-out / gesture-end re-checks
  setHidden(true);
}

export function setupAutoHide() {
  // Fullscreen blackout owns visibility — don't reveal/hide underneath it
  // (config reload / preview end during a game would flash Booki over it).
  if (S.fullscreen) return;
  clearTimeout(S.hideTimer);
  S.pinnedReveal = false;
  // smart starts hidden only if we're currently in an app (occluded), so a
  // config reload while working doesn't flash the dock open. edge now starts
  // VISIBLE and then visibly tucks after the grace delay (unless you move onto
  // it) — starting already-hidden read as "the dock never comes out".
  S.hiddenState = hideMode() === "smart" && occluded;
  document.body.classList.toggle("tucked", S.hiddenState);
  applyFrame();
  // Sync the two windows to the starting state (these don't emit, so this won't
  // pin the dock open).
  if (S.hiddenState) dockApi.hideDock(S.cfg.edge);
  else dockApi.revealDock();
  // Keep the poll loop in step with visibility (idle when tucked away).
  if (S.hiddenState) stopPolls();
  else startPolls();
  if (!S.hiddenState && wantsHideNow()) scheduleHide();
}

// Pointer entered the dock area while HIDDEN → reveal (hover trigger only; in
// click mode a hidden dock comes back exclusively from the notch).
export function reveal() {
  if ((S.cfg.notchTrigger || "click") === "click") return; // hover trigger only
  // "The pointer just arrived — with that, does the policy want the bar out?"
  // The chain of early-outs this replaced (fullscreen, manual swipe, mode off,
  // occluded-and-not-summoned) is now one lookup that cannot drift from the
  // other two decision points.
  if (decideVisible({ ...visibilityState(), pointerInside: true }) !== true) return;
  clearTimeout(S.hideTimer);
  setHidden(false);
}

// Grace period after leaving the dock; the callback re-checks EVERYTHING so a
// pointer that came back (or an opened menu) simply cancels the hide.
export function scheduleHide() {
  if (hideMode() === "off") return;
  clearTimeout(S.hideTimer);
  S.hideTimer = setTimeout(tryTuck, S.cfg.autoHideDelay ?? 650);
}

// Smart-hide: the backend tells us when a window covers the dock's home area.
// We hide to the notch when covered and reappear when the desktop is clear —
// measured against a stable rect in Rust, so it can no longer flap.
export function onDesktopSignal(value) {
  desktopActive = value;
  if (value) occluded = false;
  // Win+D can hide a native window without changing our JS visibility.
  if (value && !S.hiddenState && decideVisible(visibilityState()) === true) {
    dockApi.revealDock().catch(() => {});
  }
  onOcclusionSignal(occluded);
}

export function onOcclusionSignal(value) {
  occluded = value;
  // Going back to work in an app releases a manual swipe-hide: next time the
  // desktop is clear, normal smart behavior resumes.
  if (value) S.manualHide = false;
  // These own visibility while they last; occlusion doesn't get a vote.
  if (S.previewing || S.fullscreen || S.draggingFile) return;
  if (hideMode() !== "smart") return;

  const want = decideVisible(visibilityState());
  if (want === null) {
    // Click trigger: the desktop cleared, but a tucked dock waits to be asked.
    clearTimeout(occRevealTimer);
    return;
  }
  if (want) {
    // Back on the desktop → come out, but only once it has STAYED clear for a
    // beat. Switching or moving windows opens transient gaps over the dock's
    // spot, and revealing on those made it pop out "by itself" mid alt-tab.
    clearTimeout(occRevealTimer);
    occRevealTimer = setTimeout(() => {
      if (decideVisible(visibilityState()) !== true) return;
      S.pinnedReveal = false;
      setHidden(false);
    }, SMART_REVEAL_DELAY);
    return;
  }
  clearTimeout(occRevealTimer); // covered again → drop any pending reveal
  // The policy says hide, but the gate still applies: never yank the bar out
  // from under someone using it. The pointer-out handler re-checks.
  if (S.pointerInside || interacting()) return;
  S.pinnedReveal = false;
  setHidden(true);
}

// The notch is now its own small window. Clicking it calls the backend, which
// shows the dock window again and fires `booki://reveal`. This must NOT go
// through reveal() — that helper is the hover-trigger path and bails out in
// click mode, which silently ate the notch click (the dock never came back in
// \u201cal salir\u201d). An explicit summon always reveals, whatever the trigger.
let pinTimer = null;
export function pinOpen() {
  if (S.fullscreen) return;
  S.manualHide = false;
  S.pinnedReveal = true;
  S.pinTouched = false;
  clearTimeout(S.hideTimer);
  setHidden(false);
  // Outside clicks pass through the stage window now, so they can't release
  // the pin — instead the pin ends when you visit the dock and leave, with a
  // timeout valve for an accidental summon that's never used.
  clearTimeout(pinTimer);
  pinTimer = setTimeout(() => {
    if (S.pinnedReveal && !S.pinTouched) {
      S.pinnedReveal = false;
      if (wantsHideNow()) scheduleHide();
    }
  }, 8000);
}

// Soft reveal from notch hover: show the dock without stealing focus or pinning
// it open — it can tuck again once the pointer leaves / smart-hide decides.
// Only act when JS still thinks we're tucked; otherwise reveal_dock's emit
// (also used by setHidden / setupAutoHide) would clear pending hide timers.
export function softOpen() {
  if (S.fullscreen || !S.hiddenState) return;
  S.manualHide = false;
  clearTimeout(S.hideTimer);
  setHidden(false);
  // Soft reveal is not a pin — if smart-hide still wants us gone, arm the grace
  // hide so we don't sit over the app forever (occlusion won't re-fire if true).
  if (wantsHideNow() && !S.pointerInside) scheduleHide();
}
