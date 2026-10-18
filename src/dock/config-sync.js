/* Loading, applying and saving the configuration, and keeping the native side
   (Explorer menu, tray language, automatic profiles) in step with it. */

import { config as configApi, dock as dockApi, logMessage, isTauri } from "../api.js";
import { parseConfigConflict } from "../settings/config-conflicts.js";
import { singleFlight } from "./async-cache.js";
import { applyTheme, applyEdge } from "../theme.js";
import { paintedLook } from "../system-look.js";
import { t, setLang, curLang, ensureLang } from "../i18n.js";
import { dockRadius } from "../surface.js";
import { normalizeGroups } from "../pins.js";
import { desiredProfile } from "../profile-rules.js";
import { applyMaterial } from "../material.js";
import { S } from "./state.js";
import { emitConfigChanged } from "./helpers.js";
import { dockEl, dockKeys, dropOverlay, undoToast, esc } from "./dom.js";
import { fitDock, reframe, SHADOW_PAD, applyFrame } from "./frame.js";
import { startPolls } from "./live-widgets.js";
import { hideMode, setupAutoHide } from "./autohide.js";
import { closeMenu } from "./menu-core.js";
import { render } from "./render.js";
import { hideUndoToast, placeUndoToast } from "./undo-toast.js";
import { closeTrashPop } from "./popovers.js";
import { scheduleFocusAlerts } from "./focus-alerts.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireConfigSync(fns) { Object.assign(deps, fns); }

// Explorer right-click menu: entries live in the registry, written by the
// backend with labels WE localize here (so all 5 languages work). Re-synced
// whenever the groups, the language, or the toggle change.
const ctxGroupsSig = (c) =>
  (c.pinned || []).filter((p) => p.kind === "group").map((p) => `${p.id}:${p.name}`).join("|") +
  `|${c.contextMenu !== false}|${c.language || ""}`;
let lastCtxSig = null;
function syncCtxMenu() {
  lastCtxSig = ctxGroupsSig(S.cfg);
  dockApi
    .syncContextMenu(S.cfg.contextMenu !== false, t("ctx.addToBooki"), t("ctx.addToGroup"))
    .catch(() => {});
}
// Cheap guard used from persist(): dock-side group edits bypass reloadConfig
// (self-emit echo guard), so re-sync here when the signature actually moved.
export function maybeSyncCtxMenu() {
  if (S.cfg && ctxGroupsSig(S.cfg) !== lastCtxSig) syncCtxMenu();
}

let configReloadGeneration = 0;
// Automatic profiles: re-check every minute (and when the displays change)
// while rules are on, and apply only when the answer changes, so a profile
// picked by hand stays until the next change of schedule or monitors.
let autoProfileLast = null;
let autoProfileTimer = null;
export const checkAutoProfile = singleFlight(async () => {
  clearTimeout(autoProfileTimer);
  const rules = S.cfg?.profileRules;
  if (!rules?.enabled) { autoProfileLast = null; return; }
  autoProfileTimer = setTimeout(checkAutoProfile, 60000);
  try {
    const [available, monitors] = await Promise.all([dockApi.profileList(), dockApi.listMonitors()]);
    const want = desiredProfile(rules, { now: new Date(), monitors: Array.isArray(monitors) ? monitors.length : 1, available: available || [] });
    if (want === autoProfileLast) return;
    autoProfileLast = want;
    if (want && want !== S.cfg.lastProfile) await dockApi.profileApply(want);
  } catch (_) {
    autoProfileLast = null; // try again on the next tick
  }
});

export async function reloadConfig({ afterSaves = true } = {}) {
  const request = ++configReloadGeneration;
  // Let queued dock saves land first; otherwise the reload replaces cfg and
  // the queued save writes back the backend copy, losing the dock's edit.
  // A save that reloads from inside the queue must skip this, or it waits on itself.
  if (afterSaves) await persistQueue;
  const queued = persistQueue;
  const next = await configApi.get();
  if (request !== configReloadGeneration) return;
  // A dock edit saved while this read was in flight: read again after it,
  // or the older snapshot would put the edit back.
  if (afterSaves && queued !== persistQueue) return reloadConfig({ afterSaves });
  const prev = S.cfg;
  S.cfg = next;
  // If the language changed, make sure its dictionary is loaded before re-render.
  if (!prev || prev.language !== S.cfg.language) await ensureLang(S.cfg.language);
  if (request !== configReloadGeneration) return;
  maybeSyncCtxMenu();
  // Placement moved while the frame size may not have: force a re-place.
  const PLACEMENT = ["edgeGap", "notchPosition", "notchMode", "monitor", "monitorName"];
  if (prev && PLACEMENT.some((key) => prev[key] !== S.cfg[key])) S.lastFull = null;
  // Edge changed → mask the window teleport with a fade+pop: the bar vanishes
  // instantly, the window moves, and the bar pops back in on the new edge.
  const edgeSwapped = prev && prev.edge !== S.cfg.edge;
  if (edgeSwapped) {
    document.body.classList.add("edge-swap");
  }
  applyAll();
  if (JSON.stringify(prev?.profileRules) !== JSON.stringify(S.cfg.profileRules)) { autoProfileLast = null; checkAutoProfile(); }
  // Only rebuild the bar when the pinned items actually changed — sliders and
  // toggles in Settings shouldn't make the whole dock flash.
  const languageChanged = !!prev && prev.language !== S.cfg.language;
  if (languageChanged) { closeMenu(); closeTrashPop(); deps.hideTip(); }
  const pinsChanged = languageChanged || !prev || JSON.stringify(prev.pinned) !== JSON.stringify(S.cfg.pinned);
  if (pinsChanged) {
    // A drag in flight holds tiles this render would replace.
    if (S.dragging || S.press) await deps.cancelDrag?.();
    // Stale flyout handlers hold old children — close rather than lie.
    const keepCatalog = S.stackOpen && S.stackItemId === "__add";
    if (S.stackOpen && !keepCatalog) deps.closeStack();
    await render();
    if (keepCatalog) S.stackRefreshPins?.();
  } else {
    fitDock();
  }
  reframe();
  // Re-arming auto-hide resets the shown/hidden state; only do it when the
  // behavior actually changed, so unrelated tweaks can't blink the dock.
  const hideChanged =
    !prev ||
    prev.edge !== S.cfg.edge ||
    (prev.autoHideMode || "") !== (S.cfg.autoHideMode || "") ||
    prev.notchMode !== S.cfg.notchMode ||
    prev.notchPosition !== S.cfg.notchPosition;
  if (hideChanged) setupAutoHide();
  if (edgeSwapped) {
    // Briefly SHOW the dock in its new spot so the user actually sees it move —
    // otherwise smart-hide (the settings window occludes the dock area) tucks it
    // away and only the notch appears to move. (Notch-only changes preview the
    // notch via notch_preview.) Then let the faded-out bar pop back in.
    positionPreview();
    setTimeout(() => {
      requestAnimationFrame(() => document.body.classList.remove("edge-swap"));
    }, 90);
  }
}

// Show the dock in its current position for a few seconds regardless of
// smart-hide occlusion — used as a live preview while tweaking position in
// Settings. After the window elapses, normal hide behavior resumes.
let previewTimer = null;
function positionPreview() {
  S.previewing = true;
  clearTimeout(previewTimer);
  S.manualHide = false;
  S.hiddenState = false;
  document.body.classList.remove("tucked");
  dockApi.revealDock();
  startPolls(); // visible again → resume live widgets
  applyFrame();
  previewTimer = setTimeout(() => {
    S.previewing = false;
    setupAutoHide(); // return to whatever the hide mode wants
  }, 2600);
}

// The tray menu and the Settings title are drawn by Rust; tell it which
// language the pages resolved ("system" included) whenever that changes.
let nativeLang = null;
function syncNativeLanguage() {
  if (!isTauri || curLang() === nativeLang) return;
  nativeLang = curLang();
  dockApi.syncNativeLanguage(nativeLang).catch(() => { nativeLang = null; });
}

export function applyAll() {
  setLang(S.cfg.language);
  syncNativeLanguage();
  // The two strings baked into index.html were Spanish, which no language
  // setting could reach — a German user dragging a file onto the bar was told
  // "Suelta para anclar a Booki". They live in the dictionary now and are
  // written here, so they follow the language like everything else.
  dropOverlay.querySelector("#drop-pill").textContent = t("dock.dropPin");
  const pill = document.getElementById("update-pill");
  if (pill) {
    pill.textContent = t("dock.update");
    pill.title = t("dock.updateTip");
  }
  dockEl.setAttribute("aria-label", t("a11y.dock"));
  applyTheme(S.cfg);
  applyEdge(S.cfg);
  dockKeys.sync();
  document.body.classList.toggle("hide-running-indicators", S.cfg.showIndicators === false);
  // The stage window spans the whole edge; the BAR aligns to the notch's
  // along-edge slot with CSS (the window itself no longer travels).
  const slot = S.cfg.notchPosition === "start" ? "start" : S.cfg.notchPosition === "end" ? "end" : "center";
  ["slot-start", "slot-center", "slot-end"].forEach((c) => document.body.classList.remove(c));
  document.body.classList.add(`slot-${slot}`);
  const root = document.documentElement;
  // CSS materials on a transparent window (native DWM vibrancy left a gray box).
  // Solidity + optional glass tint drive dock/notch fill together.
  const look = paintedLook(S.cfg);
  applyMaterial(look);
  if (look.accent) {
    root.style.setProperty("--accent", look.accent);
  }
  dockEl.style.setProperty("--gap", `${S.cfg.spacing ?? 6}px`);
  // How close the bar sits to its screen edge (user-tunable). The transparent
  // pad on the anchored side shrinks down to the requested gap; anything past
  // the stage pad is handled by the window's own margin (backend dock_xy).
  const edgeGap = Math.max(0, Math.min(96, S.cfg.edgeGap ?? 12));
  root.style.setProperty("--edge-pad", `${Math.min(SHADOW_PAD, edgeGap)}px`);
  // A small gap leaves no room for the outward drop shadow — soften it.
  document.body.classList.toggle("tight-edge", edgeGap < 24);
  // Tile/corner roundness (user-tunable). Drives tiles, widgets (.w-card),
  // group grids/minis, and letter glyphs. Dock chrome is a touch rounder.
  const cr = S.cfg.cornerRadius ?? 12;
  root.style.setProperty("--tile-r", `${cr}px`);
  root.style.setProperty("--dock-r", `${dockRadius(S.cfg)}px`);
  document.body.classList.toggle("show-labels", S.cfg.showLabels !== false);
  document.body.classList.toggle("compact", !!S.cfg.compact);
  document.body.classList.toggle("autohide", hideMode() !== "off");
  // Magnify animation style → easing curve used for the size/lift transitions.
  const style = S.cfg.magnifyStyle || "spring";
  const ease = style === "smooth" ? "cubic-bezier(0.16,1,0.3,1)" : "cubic-bezier(0.34,1.5,0.5,1)";
  root.style.setProperty("--mag-ease", ease);
  // Genie minimize: the notch always sits on the dock's edge, so the bar funnels
  // toward its along-position on that same edge.
  const ox = { start: 16.6, end: 83.4 }[S.cfg.notchPosition] ?? 50;
  root.style.setProperty("--genie-ox", `${ox}%`);
  root.style.setProperty("--genie-oxn", `${ox}`);
  const gedge = S.cfg.edge || "bottom";
  ["genie-bottom", "genie-top", "genie-left", "genie-right"].forEach((c) =>
    document.body.classList.remove(c)
  );
  document.body.classList.add(`genie-${gedge}`);
}

let persistQueue = Promise.resolve();
export function persist(patch = {}, { showError = true } = {}) {
  const pending = persistQueue.then(() => performPersist(patch, showError));
  persistQueue = pending.catch(() => {});
  return pending;
}
async function performPersist(patch, showError) {
  // Keep named group containers intact, including empty and single-item groups.
  S.cfg.pinned = normalizeGroups(S.cfg.pinned);
  const changes = { pinned: S.cfg.pinned, seenVersion: S.cfg.seenVersion || "", onboarded: !!S.cfg.onboarded, settingsIntroSeen: !!S.cfg.settingsIntroSeen, ...patch };
  try {
    await configApi.patch(changes);
    maybeSyncCtxMenu();
    // A started or paused focus timer is saved without a re-render.
    scheduleFocusAlerts(S.cfg.pinned);
    await emitConfigChanged();
    return true;
  } catch (error) {
    logMessage("error", `dock save failed: ${error}`);
    const conflict = parseConfigConflict(error);
    // Restore the persisted view; retain the proposed edit for explicit retry.
    await reloadConfig({ afterSaves: false }).catch(() => {});
    if (undoToast && showError) {
      hideUndoToast();
      undoToast.innerHTML = `<span>${esc(t(conflict ? "workspace.conflict" : "status.saveError"))}</span><button type="button">${esc(t(conflict ? "workspace.keepMine" : "focus.retry"))}</button>`;
      undoToast.classList.remove("hidden");
      placeUndoToast();
      const retryButton = undoToast.querySelector("button");
      retryButton?.addEventListener("click", async () => {
        retryButton.disabled = true;
        try {
          await configApi.get(); // Retry is an explicit decision against the latest snapshot.
          await configApi.patch(changes);
          await emitConfigChanged();
          await reloadConfig();
          if (undoToast.contains(retryButton)) hideUndoToast();
        } catch (retryError) {
          logMessage("error", `dock retry failed: ${retryError}`);
          retryButton.disabled = false;
        }
      });
    }
    return false;
  }
}
