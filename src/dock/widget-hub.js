import { t } from "../i18n.js";
import { widgetTile } from "./render.js";
import { icon } from "../icons.js";
import { WIDGET_META, widgetDisplayName } from "../widgets-meta.js";

/* One entry per pinned widget, including grouped widgets. Each button opens
   its existing live panel, so there is no second set of readers or timers. */
export function buildWidgetHub(pins, { open, close, settings }) {
  const panel = document.createElement("section"); panel.className = "productivity-panel widget-hub";
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", t("refine.hub"));
  const head = document.createElement("div"); head.className = "productivity-head";
  const title = document.createElement("strong"); title.textContent = t("refine.hub");
  const done = document.createElement("button"); done.type = "button"; done.className = "stack-close"; done.innerHTML = icon("x"); done.setAttribute("aria-label", t("stack.close")); done.addEventListener("click", close);
  head.append(title, done); panel.append(head);
  const grid = document.createElement("div"); grid.className = "widget-hub-grid"; panel.append(grid);
  const walk = (items) => { for (const pin of items || []) {
    if (pin.kind === "group") { walk(pin.children); continue; }
    if (pin.kind !== "widget" || !WIDGET_META[pin.widget]) continue;
    const row = document.createElement("article"); row.className = "widget-hub-item";
    const button = widgetTile(pin, { inFlyout: true });
    button.addEventListener("click", () => open(pin));
    const name = document.createElement("strong"); name.textContent = pin.style?.device || widgetDisplayName(pin.widget, t);
    const desc = document.createElement("small"); desc.textContent = t(WIDGET_META[pin.widget].desc);
    row.append(button, name, desc); grid.append(row);
  } };
  walk(pins);
  const add = document.createElement("button"); add.type = "button"; add.className = "productivity-button"; add.textContent = t("overhaul.addWidget"); add.addEventListener("click", settings); panel.append(add);
  return panel;
}
