/* Applies accent color, theme and dock edge to the document. */

import { applyAccent } from "./util-color.js";

export function applyTheme(cfg) {
  const root = document.documentElement;
  applyAccent(root, cfg.accent);
  root.setAttribute("data-theme", cfg.theme || "system");
  if ((cfg.theme || "system") === "system") {
    root.removeAttribute("data-theme");
  }
}

export function applyEdge(cfg) {
  const body = document.body;
  ["edge-bottom", "edge-top", "edge-left", "edge-right"].forEach((c) =>
    body.classList.remove(c)
  );
  body.classList.add(`edge-${cfg.edge || "bottom"}`);
}
