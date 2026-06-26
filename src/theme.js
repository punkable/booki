/* Applies accent color, theme and dock edge to the document. */

export function applyTheme(cfg) {
  const root = document.documentElement;
  if (cfg.accent) {
    root.style.setProperty("--accent", cfg.accent);
  }
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
