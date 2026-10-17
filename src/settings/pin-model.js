import { canonicalWidget } from "../widgets-meta.js";
/* Locating and updating a widget inside the pinned tree.

   A widget can sit on the bar or inside a group, so every edit has to find it
   first. Fully pure — no React, no DOM — and unit-tested in
   tests/settings-pin-model.test.mjs. */

/** Pins showing `widget`, including ones saved under a name it replaced. */
export function widgetRefs(pinned, widget) {
  const refs = [];
  const same = (item) => item.kind === "widget" && canonicalWidget(item.widget) === widget;
  (pinned || []).forEach((item, i) => {
    if (same(item)) refs.push({ type: "top", id: item.id, i });
    (item.children || []).forEach((child) => {
      if (same(child)) refs.push({ type: "child", groupId: item.id, gi: i, id: child.id });
    });
  });
  return refs;
}

