/* Applies accent color, theme and dock edge to the document. */

import { applySurfaceVars } from "./surface.js";
import { applyMaterial } from "./material.js";
import { applyAccent } from "./util-color.js";
import { onLookChange, paintedLook } from "./system-look.js";

/** "auto" theme → light during the day (7:00–19:00), dark at night. */
function resolveTheme(theme) {
  if (theme !== "auto") return theme || "system";
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "light" : "dark";
}

let autoTimer = null;
let latestConfig = null;
// Windows preferences, the accent or the wallpaper changed: repaint with
// the colours they now give.
onLookChange(() => {
  if (!latestConfig) return;
  applyTheme(latestConfig);
  const look = paintedLook(latestConfig);
  if (document.body.classList.contains("settings-body")) applySurfaceVars(look);
  else applyMaterial(look);
});

export function applyTheme(cfg) {
  latestConfig = cfg;
  const root = document.documentElement;
  const look = paintedLook(cfg);
  applyAccent(root, look.accent);
  const resolved = resolveTheme(look.theme);
  if (resolved === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", resolved);
  }
  // While in auto mode, re-check every few minutes so day/night flips live.
  clearInterval(autoTimer);
  if (look.theme === "auto") {
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
