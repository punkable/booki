/* Shared app identity, matching and sections for Settings and the dock flyout. */
export function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function pathKey(path) { return String(path || '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase(); }
export function matchScore(name, query) {
  const q = norm(query).trim(); if (!q) return 1;
  const n = norm(name); if (n.startsWith(q)) return 3;
  if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}
export function baseTitle(path) { return (String(path || '').split(/[\\/]/).pop() || '').replace(/\.(exe|lnk|url|appref-ms)$/i, ''); }
export function appKey(item, identities = {}) {
  const key = identities[item.path] || pathKey(item.path);
  return item.args?.length ? `${key}|${JSON.stringify(item.args)}` : key;
}
export function pinnedKeys(pinned, identities = {}) {
  const keys = new Set();
  const walk = (items) => { for (const item of items || []) { if (item.path) keys.add(appKey(item, identities)); if (item.children) walk(item.children); } };
  walk(pinned); return keys;
}
export function isPinned(keys, path, _name, identities = {}, args = []) { return keys.has(appKey({ path, args }, identities)); }
export function runningCandidates(windows, keys, identities = {}) {
  const seen = new Set(); const out = [];
  for (const w of windows || []) {
    const exe = String(w.exe || ''); if (!exe) continue;
    const id = appKey({ path: exe }, identities); if (seen.has(id)) continue; seen.add(id);
    const title = baseTitle(exe);
    if (/^(booki|explorer|applicationframehost|searchhost|shellexperiencehost|textinputhost)$/i.test(title)) continue;
    out.push({ name: title === title.toLowerCase() ? title[0].toUpperCase() + title.slice(1) : title, path: exe, pinned: isPinned(keys, exe, title, identities) });
  }
  return out.sort((a, b) => Number(a.pinned) - Number(b.pinned) || a.name.localeCompare(b.name));
}
export function frequentCandidates(used, keys, max = 6, identities = {}) {
  const seen = new Set();
  return (used || []).map((u) => ({ name: u.name, path: u.path, args: u.args || [], pinned: isPinned(keys, u.path, u.name, identities, u.args) }))
    .filter((c) => { const key = appKey(c, identities); if (!c.path || c.pinned || seen.has(key)) return false; seen.add(key); return true; }).slice(0, max);
}
export function installedCandidates(groups, keys, identities = {}) {
  const seen = new Set(); const out = [];
  for (const group of groups || []) for (const item of group.items || []) {
    const id = appKey(item, identities); if (!item.path || seen.has(id)) continue; seen.add(id);
    out.push({ ...item, pinned: isPinned(keys, item.path, item.name, identities, item.args) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
export function rank(list, query) {
  if (!norm(query).trim()) return [...list];
  return list.map((c) => ({ c, s: matchScore(c.name, query) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name)).map((x) => x.c);
}
export function candidateSections(data, keys, query = '', identities = {}) {
  const catalog = installedCandidates(data.groups, keys, identities);
  const names = new Map(catalog.map((c) => [appKey(c, identities), c.name]));
  const catalogIds = new Set(catalog.map((c) => appKey(c, identities)));
  const used = (data.used || []).filter((u) => !catalog.length || !pathKey(u.path).startsWith('shell:appsfolder/') || catalogIds.has(appKey(u, identities)));
  const frequent = frequentCandidates(used, keys, 12, identities).map((c) => ({ ...c, name: names.get(appKey(c, identities)) || c.name }));
  const seen = new Set(frequent.map((c) => appKey(c, identities)));
  const running = runningCandidates(data.running, keys, identities).filter((c) => !seen.has(appKey(c, identities)));
  running.forEach((c) => seen.add(appKey(c, identities)));
  const installed = installedCandidates(data.groups, keys, identities).filter((c) => !seen.has(appKey(c, identities)));
  return { frequent: rank(frequent, query), running: rank(running, query), installed: rank(installed, query) };
}
