/** Serializes native mutations and applies only the newest response. */
export function createLatestTask(run, apply, onError = () => {}) {
  let revision = 0, desired = null, pending = null;
  const pump = () => {
    if (pending || !desired) return;
    const current = desired; desired = null;
    pending = Promise.resolve().then(() => run(current.input)).then(
      value => { if (current.revision === revision) apply(value,current.input); },
      error => { if (current.revision === revision) onError(error); }
    ).finally(() => { pending = null; pump(); });
  };
  return { request(input) { desired = { input, revision: ++revision }; pump(); }, async settled() { while (pending) await pending; } };
}
