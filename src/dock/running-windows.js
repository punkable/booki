/* Running-app indicators, taskbar attention and the window poll behind them. */

import { dock as dockApi, isTauri } from "../api.js";
import { recoveryInterval } from "./system-observer.js";
import { singleFlight } from "./async-cache.js";
import { windowsFor as matchPinWindows, runningDescription } from "./running.js";
import { t } from "../i18n.js";
import { S } from "./state.js";
import { dockEl, stackEl } from "./dom.js";
import { checkScreenChange } from "./frame.js";
import { pollSlowdown } from "./live-widgets.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wireRunningWindows(fns) { Object.assign(deps, fns); }

// ─────────────────── Running-app indicators ───────────────────

// Windows from the last poll, so a context menu can list an app's windows
// without waiting on another enumeration.
let lastWindows = [];

/** The open windows that belong to a pin (matching rules in dock/running.js). */
export function windowsFor(pin, wins = lastWindows) {
  return matchPinWindows(pin, wins);
}

// Windows flashing on the taskbar (asking for attention). The backend keeps
// the list and drops a window once it comes to the front; a tile shows the
// state when any of its windows is in it.
let attentionHwnds = new Set();
export function setAttention(list) {
  attentionHwnds = new Set((Array.isArray(list) ? list : []).map(Number));
  paintAttention();
}
function paintAttention() {
  dockEl.querySelectorAll(".tile[data-id]").forEach((tile) => {
    const item = S.cfg?.pinned.find((p) => p.id === tile.dataset.id);
    const waiting = !!item && item.kind === "app" && attentionHwnds.size > 0 &&
      windowsFor(item).some((w) => attentionHwnds.has(Number(w.hwnd)));
    if (waiting === tile.classList.contains("attention")) return;
    tile.classList.toggle("attention", waiting);
    if (waiting) tile.setAttribute("aria-description", t("dock.attention"));
    else tile.removeAttribute("aria-description");
  });
}
export function clearAttention(el, item) {
  if (!el?.classList.contains("attention")) return;
  const hwnds = windowsFor(item).map((w) => Number(w.hwnd)).filter((h) => attentionHwnds.has(h));
  for (const h of hwnds) attentionHwnds.delete(h);
  el.classList.remove("attention");
  el.removeAttribute("aria-description");
  if (hwnds.length) dockApi.dismissAttention(hwnds).catch(() => {});
}

export function startRunningPoll() {
  if (!isTauri) return;
  clearInterval(S.pollTimer); // never stack two running-app polls
  S.pollTimer = null;
  if (S.displayOff) return; // nobody can see the dots; display-on restarts it
  const tick = singleFlight(async (refreshTrash = true) => {
    // Don't poll while tucked into the notch — saves CPU/IPC when idle.
    if (S.hiddenState || S.displayOff) return;
    // Cheap, no-IPC guard that repositions the dock if the screen changed.
    checkScreenChange();
    // Keep the trash badge in sync with deletions made outside Booki.
    if (refreshTrash && dockEl.querySelector(".tile.trash")) deps.refreshTrashState();
    // Running state powers switching and hints independently of visible dots.
    // Nothing that could be "running" is pinned (only widgets/trash/separators) →
    // skip enumerating every window (which now also resolves each process's exe).
    if (!S.cfg.pinned.some((p) => p.kind === "app" || p.kind === "folder" || p.kind === "group")) {
      return;
    }
    try {
      const wins = await dockApi.listWindows();
      lastWindows = wins;
      const matchWins = (pin) => windowsFor(pin, wins);
      const say = (n) => runningDescription(n, t); // `t` is the tile inside the loop
      dockEl.querySelectorAll(".tile[data-id]").forEach((t) => {
        const app = S.cfg.pinned.find((a) => a.id === t.dataset.id);
        if (!app || app.kind === "separator" || app.kind === "trash" || app.kind === "action") return;
        const matches = matchWins(app);
        const badge = t.querySelector(".badge");
        if (matches.length) {
          t.dataset.running = "true";
          t.dataset.hwnd = String(matches[0].hwnd);
          t.classList.remove("launching");
          if (badge) badge.textContent = matches.length > 1 ? String(matches.length) : "";
        } else {
          t.dataset.running = "false";
          delete t.dataset.hwnd;
          if (badge) badge.textContent = "";
        }
        // The dot and the count are visual; say the same thing to a screen reader.
        const said = say(matches.length);
        if ((t.getAttribute("aria-description") || "") !== said) {
          if (said) t.setAttribute("aria-description", said);
          else t.removeAttribute("aria-description");
        }
      });
      paintAttention();
      // Mirror running state onto open group flyout cells.
      if (S.stackOpen && S.stackItemId) {
        const grp = S.cfg.pinned.find((p) => p.id === S.stackItemId);
        if (grp && grp.kind === "group") {
          stackEl.querySelectorAll(".stack-item[data-child-id]").forEach((cell) => {
            const child = (grp.children || []).find((c) => c.id === cell.dataset.childId);
            const matches = matchWins(child);
            cell.dataset.running = matches.length ? "true" : "false";
          });
        }
      }
    } catch (_) {
      /* ignore */
    }
  });
  S.appPollTick = tick;
  tick();
  S.pollTimer = setInterval(tick, recoveryInterval(S.nativeSupport, "windows", 5000) * pollSlowdown());
}
