/** Serializes durable drafts; typing during a save keeps its newer value. */
export function createDraftSaver(save, onState = () => {}, delay = 300) {
  let version = 0, savedVersion = 0, value, timer, pending = null;
  const flush = () => {
    clearTimeout(timer);
    if (pending) return pending;
    pending = (async () => {
      while (savedVersion !== version) {
        const currentVersion = version, current = value;
        onState('saving');
        try {
          if (await save(current) === false) throw new Error('draft not saved');
          savedVersion = currentVersion;
        } catch {
          onState('error');
          return false;
        }
      }
      onState('saved');
      return true;
    })().finally(() => { pending = null; });
    return pending;
  };
  return {
    change(next) { value = next; version++; onState('saving'); clearTimeout(timer); timer = setTimeout(flush, delay); },
    flush,
    cancelTimer() { clearTimeout(timer); },
  };
}
