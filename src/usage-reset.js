/** Which plan windows just opened again.

 *  `before` and `after` are the provider snapshots the AI widget already
 *  reads: percents and reset times only. The first snapshot never notifies.
 *  A window notifies once, when its reset time has passed and it had been
 *  in use. Providers with no local quota snapshot are simply absent. */

export function usageResets(before, after, now) {
  if (!Array.isArray(before) || !before.length || !Array.isArray(after)) return [];
  const prev = new Map();
  for (const row of before) if (row && row.id) prev.set(row.id, row);
  const out = [];
  for (const next of after) {
    if (!next || !next.id) continue;
    const was = prev.get(next.id);
    if (!was) continue;
    const name = next.name || was.name || next.id;
    for (const window of was.windows || []) {
      const at = Number(window?.resets_at) || 0;
      if (at > 0 && at <= now && Number(window.percent) > 0) {
        out.push({ id: next.id, name, kind: "plan", key: `${next.id}:${window.label || "window"}:${at}` });
      }
    }
    const block = was.block;
    const at = Number(block?.resets_at) || 0;
    if (at > 0 && at <= now) {
      const still = next.block
        && Number(next.block.resets_at) === at
        && Number(next.block.started_at) === Number(block.started_at);
      if (!still) out.push({ id: next.id, name, kind: "block", key: `${next.id}:block:${at}` });
    }
  }
  return out;
}

/** Persist only public provider ids, quota percentages and reset timestamps.
 * No transcript, paths, token counts, account identifiers or credentials. */
export function usageSnapshot(providers) {
  if (!Array.isArray(providers)) return [];
  const names = { codex: "Codex", claude: "Claude" };
  const positive = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  return providers.filter((p) => p && ["codex", "claude"].includes(p.id)).slice(0, 2).map((p) => ({
    id: p.id, name: names[p.id],
    windows: (Array.isArray(p.windows) ? p.windows : []).slice(0, 2).map((w) => ({
      label: String(w.label || "window").replace(/[^a-z0-9]/gi, "").slice(0, 12),
      percent: Math.min(100, positive(w.percent)), resets_at: positive(w.resets_at),
    })),
    block: p.block ? { started_at: positive(p.block.started_at), resets_at: positive(p.block.resets_at) } : null,
  }));
}
