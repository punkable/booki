/* Applies accent color, theme and dock edge to the document. */

import { applyAccent } from "./util-color.js";

/** "auto" theme → light during the day (7:00–19:00), dark at night. */
function resolveTheme(theme) {
  if (theme !== "auto") return theme || "system";
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "light" : "dark";
}

let autoTimer = null;

export function applyTheme(cfg) {
  const root = document.documentElement;
  applyAccent(root, cfg.accent);
  const resolved = resolveTheme(cfg.theme);
  if (resolved === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", resolved);
  }
  // While in auto mode, re-check every few minutes so day/night flips live.
  clearInterval(autoTimer);
  if ((cfg.theme || "system") === "auto") {
    autoTimer = setInterval(() => applyTheme(cfg), 5 * 60 * 1000);
  }
}

export function applyEdge(cfg) {
  const body = document.body;
  ["edge-bottom", "edge-top", "edge-left", "edge-right"].forEach((c) =>
    body.classList.remove(c)
  );
  body.classList.add(`edge-${cfg.edge || "bottom"}`);
}
