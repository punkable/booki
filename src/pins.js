/* Shared pin / group helpers — keep dock.js and settings.jsx group rules
   and merge/kind detection from drifting apart. */

/** True when a pin can be drop-merged into a group with another pin. */
export function canMergeKind(kind) {
  return kind === "app" || kind === "widget" || kind === "folder" || kind === "action";
}

export function findPin(items, id) {
  for (const item of items || []) {
    if (item.id === id) return item;
    const child = findPin(item.children, id);
    if (child) return child;
  }
  return null;
}

export function updatePin(items, id, patch) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item.kind === 'group' ? { ...item, children: updatePin(item.children || [], id, patch) } : item);
}

export function removePin(items, id) {
  return normalizeGroups(items.filter((item) => item.id !== id).map((item) => item.kind === 'group' ? { ...item, children: removePin(item.children || [], id) } : item));
}

/** Move within the same row without dissolving a group or losing its children. */
export function movePinBy(items, id, delta) {
  if (delta !== -1 && delta !== 1) return items;
  const index = items.findIndex(item => item.id === id);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return items;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next;
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'group') continue;
    const children = movePinBy(item.children || [], id, delta);
    if (children !== item.children) { const next = [...items]; next[i] = { ...item, children }; return next; }
  }
  return items;
}

/** Replace a group with its members at the same position in a single edit. */
export function ungroupPin(items, id) {
  const index = items.findIndex(item => item.id === id && item.kind === 'group');
  if (index < 0) return items;
  return [...items.slice(0, index), ...(items[index].children || []), ...items.slice(index + 1)];
}

/** One committed edit for either adding a candidate or moving a saved pin. */
export function placePin(items, pin, { beforeId, groupId } = {}) {
  if (beforeId === pin.id || groupId === pin.id) return items;
  if (groupId && (pin.kind === 'group' || !canMergeKind(pin.kind))) return items;
  const destination = groupId && findPin(items, groupId);
  if (groupId && destination?.kind !== 'group') return items;
  // Keep the destination intact while removing a child from its own group.
  const strip = (rows) => rows.filter((item) => item.id !== pin.id).map((item) => item.kind === 'group' ? { ...item, children: strip(item.children || []) } : item);
  let next = strip(items);
  if (groupId) next = updatePin(next, groupId, { children: [...(findPin(next, groupId)?.children || []), pin] });
  else {
    const at = next.findIndex((item) => item.id === beforeId);
    next.splice(at < 0 ? next.length : at, 0, pin);
  }
  return normalizeGroups(next);
}

export function settingsPin() {
  return { id: crypto.randomUUID(), kind: 'action', action: 'settings', name: 'Booki', path: '', args: [] };
}

export const PIN_DRAG_TYPE = 'application/x-booki-pin';
export function readPinDrop(dataTransfer) {
  try {
    const raw = dataTransfer.getData(PIN_DRAG_TYPE);
    if (!raw || raw.length > 16384) return null;
    const item = JSON.parse(raw);
    const valid = (pin, depth = 0) => {
      if (!pin || typeof pin.id !== 'string' || !pin.id || pin.id.length > 128 || typeof pin.name !== 'string' || pin.name.length > 1024) return false;
      if (!['app', 'folder', 'widget', 'action', 'group', 'separator', 'trash'].includes(pin.kind)) return false;
      if (pin.args !== undefined && (!Array.isArray(pin.args) || pin.args.length > 64 || pin.args.some((arg) => typeof arg !== 'string' || arg.includes('\0')))) return false;
      if (pin.kind === 'action' && pin.action !== 'settings') return false;
      if (['app', 'folder'].includes(pin.kind) && (typeof pin.path !== 'string' || !pin.path || pin.path.includes('\0'))) return false;
      if (pin.kind === 'widget' && (typeof pin.widget !== 'string' || !pin.widget || pin.widget.length > 64)) return false;
      if (pin.kind === 'group' && (depth > 0 || !Array.isArray(pin.children) || pin.children.length > 100 || !pin.children.every((child) => valid(child, depth + 1)))) return false;
      return true;
    };
    if (!valid(item)) return null;
    return item;
  } catch (_) { return null; }
}

/** Detect pin kind for a filesystem path (dir → folder, else app). */
export async function kindForPath(path, isDirFn) {
  if (!path) return "app";
  try {
    if (typeof isDirFn === "function" && (await isDirFn(path))) return "folder";
  } catch (_) {
    /* fall through */
  }
  return "app";
}

/** Named containers keep their identity until the user explicitly ungroups
 * or removes them. Adding the first app and unrelated saves must not erase a
 * group's name, position, icon or future destination. */
export function normalizeGroups(pinned) {
  return (pinned || []).map((pin) => pin.kind === "group"
    ? { ...pin, children: [...(pin.children || [])] }
    : pin);
}

/** Build a pin from a filesystem path. */
export function mkPin(path, kind = "app") {
  const file = String(path || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "App";
  const name = file.replace(/\.(exe|lnk|bat|cmd)$/i, "");
  return {
    id: Math.random().toString(36).slice(2, 9),
    name,
    path,
    args: [],
    kind: kind === "folder" ? "folder" : "app",
  };
}

/** Merge pin `fromId` onto `toId` → a group at `toId`'s index. */
export function mergePins(pinned, fromId, toId, newGroupName = "Group") {
  const fromI = pinned.findIndex((p) => p.id === fromId);
  const toI = pinned.findIndex((p) => p.id === toId);
  if (fromI < 0 || toI < 0 || fromI === toI) return pinned;
  const a = pinned[fromI];
  const b = pinned[toI];
  if (!canMergeKind(a.kind) || b.kind === "separator" || b.kind === "trash") return pinned;
  if (a.kind === "group") return pinned;
  const list = [...pinned];

  const uid = () => Math.random().toString(36).slice(2, 9);
  let group;
  if (b.kind === "group") {
    group = { ...b, children: [...(b.children || []), a] };
  } else {
    group = {
      id: uid(),
      name: newGroupName,
      path: "",
      args: [],
      kind: "group",
      children: [b, a],
    };
  }
  const withoutFrom = list.filter((_, i) => i !== fromI);
  const newTo = withoutFrom.findIndex((p) => p.id === toId);
  if (newTo < 0) return list;
  withoutFrom.splice(newTo, 1, group);
  return withoutFrom;
}

/** Build a complete group in one edit, preserving member data and order. */
export function groupSelected(pinned, ids, name, id) {
  const selected = new Set(ids);
  const children = pinned.filter((item) => selected.has(item.id) && canMergeKind(item.kind));
  if (children.length < 2) return pinned;
  const members = new Set(children.map((item) => item.id));
  const group = { id, name, path: "", args: [], kind: "group", children };
  return pinned.flatMap((item) => item.id === children[0].id ? [group] : members.has(item.id) ? [] : [item]);
}

/** Pull a child onto the dock, preserving the named container. */
export function takeOutOfGroup(pinned, groupId, childId) {
  const list = pinned.map((p) =>
    p.kind === "group" ? { ...p, children: [...(p.children || [])] } : p
  );
  const gi = list.findIndex((p) => p.id === groupId);
  if (gi < 0) return { pinned: list, reopenId: null };
  const grp = list[gi];
  const ci = (grp.children || []).findIndex((c) => c.id === childId);
  if (ci < 0) return { pinned: list, reopenId: null };
  const [child] = grp.children.splice(ci, 1);
  list.splice(gi + 1, 0, child);
  return { pinned: list, reopenId: grp.id };
}
