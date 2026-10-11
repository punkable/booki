/* Confirmation popovers beside the bar (trash, move) and how they open and close. */

import { dock as dockApi, logMessage } from "../api.js";
import { icon } from "../icons.js";
import { emo } from "../emoji.js";
import { t } from "../i18n.js";
import { reduceMotion } from "./motion.js";
import { placeBesideBar } from "./placement.js";
import { S } from "./state.js";
import { baseName } from "./helpers.js";
import { dockEl, esc } from "./dom.js";
import { reframe, applyFrame } from "./frame.js";

// Calls into modules that import this one. dock.js wires them before boot, so
// the imports never form a cycle.
const deps = {};
export function wirePopovers(fns) { Object.assign(deps, fns); }

// ─────────────────────── Trash confirmation ───────────────────────
// A small in-dock popover: nothing is ever deleted without an explicit yes.
// Files go to the Recycle Bin (undoable), never a permanent delete.

let popSeq = 0;

/** A popover button. The one helper every confirm popover builds with. */
export function popButton(pop, cls, label, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `tp-btn ${cls}`.trim();
  b.textContent = label;
  b.addEventListener("click", fn);
  pop.appendChild(b);
  return b;
}

/* Show a yes/no popover as an alertdialog: named by its question, described
   by its detail line, with the first button focused once it is visible so a
   keyboard user can answer it. closeTrashPop hands focus back. */
export function showConfirmPop(pop) {
  const id = `trash-pop-${++popSeq}`;
  const text = pop.querySelector(".tp-text");
  const sub = pop.querySelector(".tp-sub");
  pop.setAttribute("role", "alertdialog");
  if (text) { text.id = `${id}-text`; pop.setAttribute("aria-labelledby", text.id); }
  if (sub) { sub.id = `${id}-sub`; pop.setAttribute("aria-describedby", sub.id); }
  const back = document.activeElement;
  pop._returnFocus = back instanceof HTMLElement && back !== document.body ? back : null;
  placePop(pop);
  S.trashPop = pop;
  // placePop reveals the popover after ~70 ms; focus it once it is shown.
  setTimeout(() => requestAnimationFrame(() => {
    if (S.trashPop === pop) pop.querySelector("button")?.focus({ preventScroll: true });
  }), 90);
}
// Dismiss a popover along the same path it entered (fade + slight drop), then
// run `done`. Under reduced motion the removal is immediate.
export function dismissPop(pop, done) {
  const finish = () => {
    pop.remove();
    if (done) done();
  };
  if (!pop || !pop.isConnected) {
    if (pop) pop.remove();
    if (done) done();
    return;
  }
  if (reduceMotion()) return finish();
  pop.classList.add("closing");
  setTimeout(finish, 180);
}
export function closeTrashPop() {
  const pop = S.trashPop;
  S.trashPop = null;
  // Give focus back to where it was, unless the user already moved it.
  const back = pop?._returnFocus;
  if (back?.isConnected && pop.contains(document.activeElement)) back.focus({ preventScroll: true });
  dismissPop(pop, () => {
    // Shrink the window only after the exit finishes, or it would clip it.
    if (!S.trashPop) {
      document.body.classList.remove("pop-open");
      reframe();
    }
  });
}

// Place a dock popover (trash confirm / first-run tips) NEXT TO the bar — never
// on top of it — and grow the window so nothing gets clipped.
export function placePop(pop) {
  pop.classList.add("measuring");
  document.body.appendChild(pop);
  document.body.classList.add("pop-open");
  applyFrame(); // grow the window before anything is visible
  const put = () => {
    // Centre on the BAR, not the window: a slot-aligned dock sits off-centre.
    pop.style.left = pop.style.right = pop.style.top = pop.style.bottom = "";
    pop.style.transform = "";
    const { left, top } = placeBesideBar({
      bar: dockEl.getBoundingClientRect(),
      box: { width: pop.offsetWidth, height: pop.offsetHeight },
      edge: S.cfg.edge,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      gap: 12,
    });
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  };
  put();
  // Reveal only after the window has grown and the popover sits in place.
  setTimeout(() => {
    requestAnimationFrame(() => {
      put();
      pop.classList.remove("measuring");
    });
  }, 70);
  // The coach swaps its content per step WITHOUT re-calling placePop; since the
  // popover is now hard-positioned (no translate centering), re-run put() on
  // any size change so every step stays centered on the bar and in-viewport.
  if (typeof ResizeObserver !== "undefined") {
    // Disconnect once the popover leaves the document. An observer left
    // watching a detached node keeps it (and its whole subtree) alive, and the
    // dock opens one of these for every trash prompt and coach step.
    const ro = new ResizeObserver(() => {
      if (pop.isConnected) put();
      else ro.disconnect();
    });
    ro.observe(pop);
  }
}

export function confirmTrash(paths, emptyBin = false) {
  closeTrashPop();
  S.pinnedReveal = true; // keep the dock open while the question is on screen
  const n = paths.length;
  const text = emptyBin
    ? t("trash.emptyAsk")
    : (n === 1 ? t("trash.askOne").replace("{name}", () => esc(baseName(paths[0]))) : t("trash.ask").replace("{n}", n));
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  pop.innerHTML =
    `${icon("trash")}<span class="tp-col"><span class="tp-text">${text}</span>` +
    `<span class="tp-sub">${t("trash.sub")}</span></span>`;
  popButton(pop, "danger", emptyBin ? t("trash.empty") : t("trash.delete"), async () => {
    closeTrashPop();
    try {
      if (emptyBin) await dockApi.emptyTrash();
      else await dockApi.trashPaths(paths);
      const tile = dockEl.querySelector(".tile.trash");
      if (tile) {
        tile.classList.remove("gulp");
        void tile.offsetWidth;
        tile.classList.add("gulp");
      }
    } catch (err) {
      // Deletion was blocked (usually Defender's Controlled Folder Access) —
      // explain honestly instead of failing in silence.
      logMessage("error", `trash: ${err}`);
      trashBlockedInfo();
      return;
    }
    await deps.refreshTrashState();
    S.pinnedReveal = false;
    deps.scheduleHide();
  });
  popButton(pop, "", t("trash.cancel"), () => {
    closeTrashPop();
    S.pinnedReveal = false;
    deps.scheduleHide();
  });
  showConfirmPop(pop);
}

// Shown when Windows refuses the operation: it's almost always Defender's
// "Controlled folder access" being cautious about an app it doesn't know yet.
function trashBlockedInfo() {
  closeTrashPop();
  S.pinnedReveal = true;
  const pop = document.createElement("div");
  pop.className = "trash-pop blocked";
  pop.innerHTML =
    `<span class="tp-emoji">${emo("shield", 24)}</span><span class="tp-col">` +
    `<span class="tp-text">${t("trash.blocked")}</span>` +
    `<span class="tp-sub">${t("trash.blockedSub")}</span></span>`;
  const ok = document.createElement("button");
  ok.className = "tp-btn";
  ok.textContent = t("trash.ok");
  ok.addEventListener("click", () => {
    closeTrashPop();
    S.pinnedReveal = false;
    deps.scheduleHide();
  });
  pop.appendChild(ok);
  placePop(pop);
  S.trashPop = pop;
}

// Drop-on-folder: ask, then move the files into that folder (shell move —
// undoable with Ctrl+Z in Explorer).
export function confirmMove(paths, item) {
  closeTrashPop();
  S.pinnedReveal = true;
  const n = paths.length;
  const what = n === 1 ? `«${esc(baseName(paths[0]))}»` : t("move.n").replace("{n}", n);
  const pop = document.createElement("div");
  pop.className = "trash-pop";
  pop.innerHTML =
    `${icon("folder")}<span class="tp-col"><span class="tp-text">${t("move.ask")
      .replace("{what}", () => what)
      .replace("{dest}", () => esc(item.name))}</span>` +
    `<span class="tp-sub">${t("move.sub")}</span></span>`;
  popButton(pop, "", t("move.ok"), async () => {
    closeTrashPop();
    try {
      await dockApi.movePaths(paths, item.path);
    } catch (err) {
      logMessage("error", `move: ${err}`);
    }
    S.pinnedReveal = false;
    deps.scheduleHide();
  });
  popButton(pop, "", t("trash.cancel"), () => {
    closeTrashPop();
    S.pinnedReveal = false;
    deps.scheduleHide();
  });
  showConfirmPop(pop);
}
