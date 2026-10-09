/* Applies accent color, theme and dock edge to the document. */

import { observePlatformPreferences } from "./platform-preferences.js";
import { applySurfaceVars } from "./surface.js";
import { applyMaterial } from "./material.js";
import { applyAccent } from "./util-color.js";

/** "auto" theme → light during the day (7:00–19:00), dark at night. */
function resolveTheme(theme) {
  if (theme !== "auto") return theme || "system";
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "light" : "dark";
}

let autoTimer = null;
let latestConfig = null;
observePlatformPreferences(() => {
  if (!latestConfig) return;
  if (document.body.classList.contains("settings-body")) applySurfaceVars(latestConfig);
  else applyMaterial(latestConfig);
});

export function applyTheme(cfg) {
  latestConfig = cfg;
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
