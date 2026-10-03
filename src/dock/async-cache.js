/* Coalesce slow native calls. A hidden/rebuilt dock cannot stack requests. */
export function singleFlight(fn) {
  let pending = null;
  return (...args) => {
    if (pending) return pending;
    pending = Promise.resolve().then(() => fn(...args)).finally(() => { pending = null; });
    return pending;
  };
}
