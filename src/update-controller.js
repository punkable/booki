/* Downloading is independent of Settings navigation; applying is explicit.
   The native lock spans both phases so another WebView cannot run an update. */
import { updateProgress } from './update-state.js';
/** @typedef {'idle'|'checking'|'available'|'none'|'error'|'downloading'|'ready'|'installing'} UpdatePhase */
/** @typedef {{event: string, data: {contentLength?: number, chunkLength?: number}}} DownloadEvent */
/** @typedef {{available: boolean, version: string, body?: string, download: (onProgress: (event: DownloadEvent) => void) => Promise<void>, install: () => Promise<void>}} SignedUpdate */
/** @typedef {{phase: UpdatePhase, update: SignedUpdate|null, pct: number|null, error: unknown}} UpdateState */
/** @param {{check: () => Promise<SignedUpdate|null>, acquire: () => Promise<boolean>, release: () => Promise<unknown>, backup: () => Promise<unknown>}} dependencies */
export function createUpdateController(dependencies) {
  const { check, acquire, release, backup } = dependencies;
  /** @type {UpdateState} */
  let state = { phase: 'idle', update: null, pct: null, error: null };
  /** @type {Set<(state: UpdateState) => void>} */
  const listeners = new Set();
  /** @type {Promise<SignedUpdate|null>|null} */
  let checking = null;
  /** @type {Promise<void>|null} */
  let downloading = null;
  /** @type {Promise<void>|null} */
  let applying = null;
  let locked = false;
  /** @param {Partial<UpdateState>} patch */
  const publish = (patch) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  const unlock = async () => { if (locked) { await release(); locked = false; } };
  const checkUpdate = () => {
    if (checking) return checking;
    if (['downloading', 'ready', 'installing'].includes(state.phase)) return Promise.resolve(state.update);
    publish({ phase: 'checking', error: null });
    checking = Promise.resolve().then(check).then((update) => {
      const available = update?.available ? update : null;
      publish({ phase: available ? 'available' : 'none', update: available, pct: null }); return available;
    }, (error) => { publish({ phase: 'error', error }); throw error; }).finally(() => { checking = null; });
    return checking;
  };
  const download = () => {
    if (downloading) return downloading;
    if (state.phase === 'ready' || state.phase === 'installing') return Promise.resolve();
    const update = state.update;
    if (!update || typeof update.download !== 'function') return Promise.reject(new Error('No downloadable update'));
    publish({ phase: 'downloading', pct: null, error: null });
    downloading = Promise.resolve().then(async () => {
      if (!await acquire()) throw new Error('An update is already active in another window');
      locked = true;
      let total = 0, received = 0;
      await update.download((event) => {
        if (event.event === 'Started') { total = event.data.contentLength || 0; received = 0; }
        if (event.event === 'Progress') received += Math.max(0, event.data.chunkLength || 0);
        publish({ pct: updateProgress(total, received) });
      });
      publish({ phase: 'ready', pct: 1 });
    }).catch(async (error) => { try { await unlock(); } finally { publish({ phase: 'available', error, pct: null }); } throw error; })
      .finally(() => { downloading = null; });
    return downloading;
  };
  /** @param {() => Promise<void>} [beforeApply] */
  const apply = (beforeApply = async () => {}) => {
    if (applying) return applying;
    const update = state.update;
    if (state.phase !== 'ready' || !update) return Promise.reject(new Error('Download the update first'));
    publish({ phase: 'installing', error: null });
    applying = Promise.resolve().then(async () => {
      await beforeApply();
      await backup();
      // NSIS /UPDATE /S /R replaces the current installation and restarts it.
      await update.install();
    }).catch((error) => { publish({ phase: 'ready', error }); throw error; }).finally(() => { applying = null; });
    return applying;
  };
  return { snapshot: () => state, subscribe: (/** @type {(state: UpdateState) => void} */ listener) => { listeners.add(listener); return () => listeners.delete(listener); }, check: checkUpdate, download, apply };
}
