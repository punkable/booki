/* Geometry shared by the live bar and its Settings previews. */
import { canonicalWidget, systemMetrics } from "../widgets-meta.js";

/** Cells a widget spans. The system widget is one cell per metric. */
export function widgetSpan(widget, style = {}) {
  const type = canonicalWidget(widget);
  if (type === "system") return systemMetrics(style).length;
  const requested = Number(style?.span);
  if ([1, 2, 3].includes(requested)) return requested;
  if (["media", "notes", "clipboard"].includes(type)) return 3;
  return ["clock", "focus", "calendar", "weather"].includes(type) ? 2 : 1;
}
export function widgetWidth(type, size, gap, style = {}) {
  const span = widgetSpan(type, style);
  return size * span + gap * (span - 1);
}
export function chooseFitSize(size, natural, usable, mode = "adapt", minimum = 30) {
  if (natural <= usable || usable <= 0 || mode === "scroll") return size;
  return Math.min(size, Math.max(Math.min(minimum, size), Math.floor(size * usable / natural)));
}
export const LAYOUT_SCENARIOS = [
  { id: "off", icon: "eye", title: "overhaul.fixed", hint: "overhaul.fixedHint", patch: { autoHideMode: "off", notchAlwaysVisible: false } },
  { id: "smart", icon: "app", title: "overhaul.smart", hint: "overhaul.smartHint", patch: { autoHideMode: "smart", hideInFullscreen: true } },
  { id: "edge", icon: "eye-off", title: "overhaul.edge", hint: "overhaul.edgeHint", patch: { autoHideMode: "edge", notchTrigger: "hover", hideInFullscreen: true } },
];
export function countContent(items = []) {
  return items.reduce((sum, item) => {
    if (item.kind === "group") {
      const child = countContent(item.children || []);
      return { apps: sum.apps + child.apps, widgets: sum.widgets + child.widgets, groups: sum.groups + child.groups + 1 };
    }
    if (item.kind === "widget") sum.widgets++;
    else if (item.kind !== "separator") sum.apps++;
    return sum;
  }, { apps: 0, widgets: 0, groups: 0 });
}
