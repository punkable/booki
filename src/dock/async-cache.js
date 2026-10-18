/* Coalesce slow native calls. A hidden/rebuilt dock cannot stack requests. */
export function singleFlight(fn) {
  let pending = null;
  return (...args) => {
    if (pending) return pending;
    pending = Promise.resolve().then(() => fn(...args)).finally(() => { pending = null; });
    return pending;
  };
}

/* Bounded, coalesced cache and extraction queue shared by every icon consumer. */
export function createAsyncCache(fetcher, { maximum = 256, ttl = 300000, negativeTtl = 5000, concurrency = 4 } = {}) {
  const entries = new Map(); const queue = []; let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift(); active++;
      Promise.resolve().then(() => fetcher(job.key)).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  };
  const get = (key) => {
    const cached = entries.get(key);
    if (cached && (cached.pending || cached.until > Date.now())) { entries.delete(key); entries.set(key, cached); return cached.promise; }
    const entry = { pending: true, until: Infinity, promise: null };
    entry.promise = new Promise((resolve, reject) => { queue.push({ key, resolve, reject }); pump(); }).then((value) => { entry.pending = false; entry.until = Date.now() + (value ? ttl : negativeTtl); return value; }, (error) => { if (entries.get(key) === entry) entries.delete(key); throw error; });
    entries.set(key, entry);
    for (const [old, item] of entries) { if (entries.size <= maximum) break; if (!item.pending) entries.delete(old); }
    entry.promise.finally(() => { for (const [old, item] of entries) { if (entries.size <= maximum) break; if (!item.pending) entries.delete(old); } }).catch(() => {});
    return entry.promise;
  };
  return { get, clear: () => entries.clear() };
}

/* Last reading of a slow native query, shared by the card and its panel: a
   reader gets the cached value at once and an in-flight query is joined, not
   repeated. `fresh(ms)` resolves to a reading no older than `ms`. */
export function sharedReading(fetcher) {
  let value; let at = 0; let pending = null;
  const listeners = new Set();
  const refresh = () => {
    if (pending) return pending;
    pending = Promise.resolve().then(fetcher).then((next) => {
      value = next; at = Date.now();
      for (const fn of listeners) { try { fn(next); } catch (_) { /* a closed panel */ } }
      return next;
    }).finally(() => { pending = null; });
    return pending;
  };
  return {
    refresh,
    fresh: (ms) => (at && Date.now() - at < ms ? Promise.resolve(value) : refresh()),
    get last() { return at ? value : undefined; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
