/* Shared pin / group helpers — keep dock.js and settings.jsx dissolve rules
   and merge/kind detection from drifting apart. */

/** True when a pin can be drop-merged into a group with another pin. */
export function canMergeKind(kind) {
  return kind === "app" || kind === "widget" || kind === "folder";
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

/**
 * Dissolve groups that have fewer than 2 children.
 * Empty groups are removed (unless keepEmpty); a single leftover child is
 * promoted to the dock. Settings uses keepEmpty so "+ New group" can stay
 * open while the user fills it.
 */
export function normalizeGroups(pinned, { keepEmpty = false } = {}) {
  const out = [];
  for (const p of pinned || []) {
    if (p.kind !== "group") {
      out.push(p);
      continue;
    }
    const kids = [...(p.children || [])];
    const name = String(p.name || "").trim() || undefined;
    if (kids.length >= 2) {
      out.push({ ...p, children: kids, name });
    } else if (kids.length === 1) {
      out.push(kids[0]);
    } else if (keepEmpty) {
      out.push({ ...p, children: [], name });
    }
    // length 0 without keepEmpty → drop empty group
  }
  return out;
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

/** Pull child out of group onto the dock; dissolve if < 2 remain. */
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
  let reopenId = grp.id;
  if (grp.children.length < 2) {
    list.splice(gi, 1, ...grp.children);
    reopenId = null;
  }
  return { pinned: list, reopenId };
}
