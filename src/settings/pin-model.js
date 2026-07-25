/* Locating and updating a widget inside the pinned tree.

   A widget can sit on the bar or inside a group, so every edit has to find it
   first. Fully pure — no React, no DOM — and unit-tested in
   tests/settings-pin-model.test.mjs. */

export function widgetRefs(pinned, widget) {
  const refs = [];
  (pinned || []).forEach((item, i) => {
    if (item.kind === "widget" && item.widget === widget) refs.push({ type: "top", id: item.id, i });
    (item.children || []).forEach((child) => {
      if (child.kind === "widget" && child.widget === widget) refs.push({ type: "child", groupId: item.id, gi: i, id: child.id });
    });
  });
  return refs;
}

export function itemForWidgetRef(pinned, ref) {
  if (!ref) return null;
  if (ref.type === "top") {
    return (pinned || []).find((item) => item.id === ref.id) || null;
  }
  const group = (pinned || []).find((item) => item.id === ref.groupId);
  return (group?.children || []).find((child) => child.id === ref.id) || null;
}

export function updateWidgetStyleForRef(pinned, ref, value) {
  if (!ref) return pinned;
  if (ref.type === "top") {
    return pinned.map((item) => (item.id === ref.id ? { ...item, style: value } : item));
  }
  return pinned.map((item) =>
    item.id === ref.groupId
      ? { ...item, children: (item.children || []).map((child) => (child.id === ref.id ? { ...child, style: value } : child)) }
      : item
  );
}
