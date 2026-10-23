/* Opaque callbacks for a short-lived notice in the separate notch window.
   Only a token and labels cross that window boundary, never paths or code. */
export function createNoticeActions({ now = Date.now, token = () => crypto.randomUUID() } = {}) {
  const pending = new Map();
  const prune = () => { for (const [id, notice] of pending) if (notice.until <= now()) pending.delete(id); };
  return {
    register(actions) {
      prune();
      const id = token();
      const entries = actions.slice(0, 3);
      pending.set(id, { actions: entries, running: new Set(), until: now() + 12000 });
      while (pending.size > 5) pending.delete(pending.keys().next().value);
      return { id, labels: entries.map((action) => String(action.label).slice(0, 80)) };
    },
    revoke(id) { pending.delete(id); },
    async dispatch(payload) {
      if (!payload || typeof payload !== "object") return false;
      const { id, index } = payload;
      prune();
      const notice = pending.get(id);
      if (!notice || !Number.isInteger(index) || index < 0 || index >= notice.actions.length || notice.running.has(index)) return false;
      notice.running.add(index);
      try { await notice.actions[index].run(); return true; }
      finally { notice.running.delete(index); }
    },
  };
}
