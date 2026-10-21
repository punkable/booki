/* Dragging the empty bar to move the dock to another screen edge. */

import { dock as dockApi } from "../api.js";
import { applyEdge } from "../theme.js";
import { S } from "./state.js";
import { isVertical } from "./helpers.js";
import { dockEl, dockKeys } from "./dom.js";
import { fitDock, applyFrame } from "./frame.js";
import { persist } from "./config-sync.js";

// Drag the empty bar to MOVE the dock to another edge — with a live preview so
// you SEE where it will land instead of it teleporting: the window grows to
// cover the screen, four anchor targets light up, and a ghost bar slides to
// whichever edge is nearest the cursor. Release commits; Esc cancels. Nearest-
// edge (not dominant-direction) makes the anchors forgiving, not rigid.
let edgeOverlay = null;

function buildEdgeOverlay() {
  if (edgeOverlay) return edgeOverlay;
  const o = document.createElement("div");
  o.id = "edge-overlay";
  o.className = "hidden";
  o.innerHTML =
    ["top", "bottom", "left", "right"]
      .map((ed) => `<div class="edge-zone edge-zone-${ed}" data-edge="${ed}"><span class="edge-zone-dot"></span></div>`)
      .join("") + `<div class="edge-ghost" aria-hidden="true"></div>`;
  document.body.appendChild(o);
  edgeOverlay = o;
  return o;
}

// Nearest of the four edges to a point inside the (work-area-sized) window.
function edgeMoveTarget(x, y, W, H) {
  const d = { top: y, bottom: H - y, left: x, right: W - x };
  return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
}

export function updateEdgePreview(x, y) {
  if (!S.edgeMove || !S.edgeMove.ready) return;
  const { W, H } = S.edgeMove;
  const target = edgeMoveTarget(x, y, W, H);
  S.edgeMove.target = target;
  edgeOverlay.querySelectorAll(".edge-zone").forEach((z) =>
    z.classList.toggle("active", z.dataset.edge === target));
  const g = edgeOverlay.querySelector(".edge-ghost");
  const vert = target === "left" || target === "right";
  const len = Math.min(S.edgeMove.barLen, (vert ? H : W) * 0.7);
  const thick = S.edgeMove.barThick;
  const m = 14;
  if (vert) {
    g.style.width = `${thick}px`;
    g.style.height = `${len}px`;
    g.style.top = `${(H - len) / 2}px`;
    g.style.left = target === "left" ? `${m}px` : `${W - thick - m}px`;
  } else {
    g.style.width = `${len}px`;
    g.style.height = `${thick}px`;
    g.style.left = `${(W - len) / 2}px`;
    g.style.top = target === "top" ? `${m}px` : `${H - thick - m}px`;
  }
}

export async function enterEdgeMove() {
  // Capture the bar's footprint BEFORE the window grows (afterwards it reflows
  // against the huge window and the numbers stop meaning anything).
  const r = dockEl.getBoundingClientRect();
  const vert = isVertical();
  S.edgeMove.barLen = Math.round(vert ? r.height : r.width) || 320;
  S.edgeMove.barThick = Math.round(vert ? r.width : r.height) || 54;
  buildEdgeOverlay();
  document.body.classList.add("edge-moving");
  const move = S.edgeMove;
  const source = await dockApi.monitorAtCursor().catch(() => null);
  if (S.edgeMove !== move) return;
  move.monitor = source;
  let css = null;
  try { css = await dockApi.dockCoverWorkarea(); } catch (_) {}
  if (!S.edgeMove) return; // released/cancelled while the resize was in flight
  S.edgeMove.W = (css && css[0]) || window.innerWidth;
  S.edgeMove.H = (css && css[1]) || window.innerHeight;
  edgeOverlay.classList.remove("hidden");
  S.edgeMove.ready = true;
  updateEdgePreview(S.edgeMove.lastX, S.edgeMove.lastY);
}

export async function endEdgeMove(commit) {
  const mv = S.edgeMove;
  S.edgeMove = null;
  if (edgeOverlay) edgeOverlay.classList.add("hidden");
  document.body.classList.remove("edge-moving");
  if (!mv || !mv.active) return; // never grew the window → nothing to restore
  // The OS window was grown to cover the screen, but lastFull still holds the
  // bar-sized frame — so applyFrame() would no-op and leave the window huge.
  // Force it to re-issue the real frame.
  S.lastFull = null;
  const destination = commit ? await dockApi.monitorAtCursor().catch(() => null) : null;
  const movedScreen = destination && mv.monitor && destination.name !== mv.monitor.name;
  const target = movedScreen ? S.cfg.edge : mv.target;
  if (commit && target && (target !== S.cfg.edge || movedScreen)) {
    // Land on the new edge with a pop so the move reads as motion, not a jump.
    const patch = { edge: target, ...(movedScreen ? { monitor: destination.index, monitorName: destination.name } : {}) };
    if (!(await persist(patch))) { applyFrame(); return; }
    Object.assign(S.cfg, patch);
    applyEdge(S.cfg);
    dockKeys.sync();
    fitDock();
    document.body.classList.add("edge-swap");
    applyFrame();
    await dockApi.setDockEdge(target);
    setTimeout(() => requestAnimationFrame(() => document.body.classList.remove("edge-swap")), 90);
  } else {
    applyFrame(); // same edge or cancelled → just shrink the window back to the bar
  }
}
