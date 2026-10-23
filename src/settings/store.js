/* Settings state: one config draft, debounced saves that merge only the keys
   Settings touched onto the latest disk copy, conflict resolution, and the
   save barrier every snapshot operation (profiles, import, reset) waits on.

   Lifted unchanged in behaviour out of the old 1800-line settings.jsx so the
   pages only receive `cfg` and `set`. */
import { useEffect, useRef, useState } from "react";
import { config as configApi, dock as dockApi, emitConfigChanged, onConfigChanged, closeSelf, invoke, onCloseRequest } from "../api.js";
import { parseConfigConflict } from "./config-conflicts.js";
import { applyTheme } from "../theme.js";
import { applySurfaceVars } from "../surface.js";
import { paintedLook } from "../system-look.js";
import { normalizeGroups, canonicalPins } from "../pins.js";
import { updates } from "../update.js";
import { setLang, ensureLang } from "../i18n.js";

const normalizePinned = (pinned) => canonicalPins(normalizeGroups(pinned));

function paint(cfg) {
  applyTheme(cfg);
  applySurfaceVars(paintedLook(cfg));
}

export function useSettingsStore() {
  const [cfg, setCfg] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  // null, "unsaved" (the last edit failed to save) or "failed" (the window refused to close).
  const [closeError, setCloseErrorState] = useState(null);
  const closeErrorRef = useRef(null);
  const setCloseError = (value) => { closeErrorRef.current = value; setCloseErrorState(value); };
  const [configConflict, setConflictState] = useState(null);
  const conflictRef = useRef(null);
  const setConfigConflict = (value) => { conflictRef.current = value; setConflictState(value); };
  const cfgRef = useRef(null);
  const saveTimer = useRef(null);
  const dirtyKeys = useRef(new Set());
  const dirtyBase = useRef(new Map());
  const savingKeys = useRef(new Set());
  const closing = useRef(false);
  const afterSaveCb = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const flushLatest = useRef(() => Promise.resolve());

  const performSave = async () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const conflicts = new Set(conflictRef.current?.keys || []);
    const keys = [...dirtyKeys.current].filter((key) => !conflicts.has(key));
    const base = Object.fromEntries(keys.map((key) => [key, dirtyBase.current.get(key)]));
    for (const key of keys) { dirtyBase.current.delete(key); dirtyKeys.current.delete(key); }
    savingKeys.current = new Set(keys);
    const cb = afterSaveCb.current;
    afterSaveCb.current = null;
    if (!keys.length) return;
    const snap = cfgRef.current;
    if (!snap) return;
    setSaveState("saving");
    try {
      const patch = {};
      for (const key of keys) if (key in snap) patch[key] = snap[key];
      if (keys.includes("pinned")) patch.pinned = normalizePinned(snap.pinned || []);
      const toSave = await configApi.patch(patch, { base, expectedRevision: snap.revision }) || { ...snap, ...patch };
      // A second edit to the same field started from our pending write, not
      // from another panel. Rebase it on the canonical acknowledgement.
      for (const key of keys) {
        if (dirtyKeys.current.has(key) && JSON.stringify(dirtyBase.current.get(key)) === JSON.stringify(patch[key])) {
          dirtyBase.current.set(key, structuredClone(toSave[key]));
        }
      }
      const draft = cfgRef.current;
      const next = { ...(draft?.revision > toSave.revision ? draft : toSave) };
      for (const key of dirtyKeys.current) next[key] = draft[key];
      cfgRef.current = next;
      setCfg(next);
      setSaveState("saved");
      await emitConfigChanged().catch(() => {});
      if (closeErrorRef.current === "unsaved" && !dirtyKeys.current.size) setCloseError(null);
      // A preview is optional; its failure must not turn a durable save into
      // an unsaved draft or an unhandled rejection.
      if (typeof cb === "function") void Promise.resolve().then(() => cb(toSave)).catch(() => {});
    } catch (error) {
      const conflict = parseConfigConflict(error);
      if (conflict) setConfigConflict(conflict);
      // Preserve the original baseline even if another edit arrived in flight.
      for (const key of keys) { dirtyKeys.current.add(key); dirtyBase.current.set(key, base[key]); }
      setSaveState("error");
    } finally {
      savingKeys.current.clear();
    }
  };
  const flushSave = () => {
    const queued = saveQueue.current.then(() => performSave());
    saveQueue.current = queued.catch(() => {});
    return queued;
  };
  flushLatest.current = flushSave;
  const settled = async () => { await flushSave(); return !dirtyKeys.current.size; };

  /** Apply a patch now; save it shortly (or immediately with `flush`). */
  const set = (patch, opts = {}) => {
    const prev = cfgRef.current;
    patch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(prev?.[key])));
    if (!Object.keys(patch).length) return;
    const next = { ...prev, ...patch };
    if (patch.pinned) next.pinned = normalizePinned(patch.pinned);
    // Record the draft synchronously: a native close can arrive before React
    // renders the edit, and must still wait for those keys to reach disk.
    for (const key of Object.keys(patch)) {
      if (!dirtyKeys.current.has(key)) dirtyBase.current.set(key, structuredClone(prev?.[key]));
      if (conflictRef.current?.keys.includes(key)) {
        // Choosing a new value in this window is an explicit new edit against
        // the latest conflicting value. Other unresolved fields stay pending.
        dirtyBase.current.set(key, structuredClone(conflictRef.current.current[key]));
        const remaining = conflictRef.current.keys.filter((field) => field !== key);
        setConfigConflict(remaining.length ? { ...conflictRef.current, keys: remaining } : null);
      }
      dirtyKeys.current.add(key);
    }
    cfgRef.current = next;
    setCfg(next);
    if (prev && prev.language !== next.language) {
      ensureLang(next.language).then(() => {
        // A slower language pack must not win over a later choice.
        if (cfgRef.current?.language !== next.language) return;
        setLang(next.language);
        setCfg((c) => ({ ...c }));
      });
    } else setLang(next.language);
    paint(next);
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    if (typeof opts.afterSave === "function") afterSaveCb.current = opts.afterSave;
    saveTimer.current = setTimeout(flushSave, opts.flush ? 0 : 120);
  };

  const replace = async (fresh) => {
    await ensureLang(fresh.language);
    cfgRef.current = fresh;
    setCfg(fresh);
    setConfigConflict(null);
    setSaveState("saved");
    setCloseError(null);
    afterSaveCb.current = null;
    paint(fresh);
    await emitConfigChanged().catch(() => {});
    return fresh;
  };

  const finishClose = async () => {
    if (closing.current) return;
    closing.current = true;
    setCloseError(null);
    const keepAlive = ["downloading", "ready", "installing"].includes(updates.snapshot().phase);
    try { await closeSelf({ keepAlive }); }
    catch (_) { setCloseError("failed"); }
    finally { closing.current = false; }
  };
  /** Close once pending edits are on disk. If they can't be saved, say so
      instead of ignoring the click; closing again (or `discard`) drops them. */
  const close = async ({ discard = false } = {}) => {
    if (discard) {
      clearTimeout(saveTimer.current);
      dirtyKeys.current.clear();
      dirtyBase.current.clear();
    } else if (!(await settled())) {
      setCloseError("unsaved");
      return;
    }
    finishClose();
  };

  const resolveConfigConflict = async (keepMine) => {
    if (!configConflict) return;
    clearTimeout(saveTimer.current);
    const next = { ...cfgRef.current };
    for (const key of configConflict.keys) {
      if (keepMine) dirtyBase.current.set(key, structuredClone(configConflict.current[key]));
      else {
        dirtyKeys.current.delete(key);
        dirtyBase.current.delete(key);
        next[key] = configConflict.current[key];
      }
    }
    next.revision = configConflict.current.revision;
    cfgRef.current = next;
    setCfg(next);
    paint(next);
    await ensureLang(next.language);
    setLang(next.language);
    setConfigConflict(null);
    setSaveState("idle");
    await flushSave();
  };

  /** Snapshot operations replace the whole config; pending edits land first. */
  const prepareConfigOperation = async () => {
    if (!(await settled())) throw new Error("pending settings could not be saved");
  };
  const applySnapshot = async (operation) => {
    const recovery = await invoke("config_recovery_status");
    if (!recovery?.blocked) await prepareConfigOperation();
    const fresh = await operation();
    if (!fresh) throw new Error("profile unavailable");
    if (recovery?.blocked) { clearTimeout(saveTimer.current); dirtyKeys.current.clear(); dirtyBase.current.clear(); }
    return replace(fresh);
  };
  const reset = async () => {
    if (!(await settled())) return;
    try {
      const fresh = await configApi.reset();
      if (fresh) await replace(fresh);
    } catch (_) { setSaveState("error"); }
  };

  // First load. A failed read shows an error with Retry instead of an empty window.
  const loadSeq = useRef(0);
  const load = () => {
    const seq = ++loadSeq.current;
    setLoadError(false);
    // A Booki that stopped answering must not leave Settings blank: after a
    // few seconds the read counts as failed and the window offers Retry.
    const answer = Promise.race([
      configApi.get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("config read timed out")), 8000)),
    ]);
    return answer.then(async (c) => {
      await ensureLang(c.language);
      // A config-changed read may already have filled the window.
      if (seq !== loadSeq.current || cfgRef.current) return;
      let next = Array.isArray(c.pinned) ? c : { ...c, pinned: [] };
      // Migrate the legacy localStorage intro flag into persisted config once.
      try {
        if (!c.settingsIntroSeen && localStorage.getItem("booki.introSeen") === "1") {
          next = { ...c, settingsIntroSeen: true };
          // A patch, not a full save: the dock may have changed other fields meanwhile.
          configApi.patch({ settingsIntroSeen: true }).catch(() => {});
        }
      } catch (_) {}
      cfgRef.current = next;
      setCfg(next);
      paint(next);
    }).catch(async () => {
      if (seq !== loadSeq.current) return;
      // No config means no saved language yet: speak the system's.
      await ensureLang("system");
      setLoadError(true);
    });
  };
  useEffect(() => { load(); }, []);

  // A native close waits for the last edit.
  useEffect(() => {
    let disposed = false;
    let unlisten;
    onCloseRequest((event) => {
      event.preventDefault();
      // A second close while the save error is showing means "close anyway".
      close({ discard: closeErrorRef.current === "unsaved" });
    }).then((un) => { if (disposed) un(); else unlisten = un; });
    return () => {
      disposed = true;
      unlisten?.();
      clearTimeout(saveTimer.current);
      // Read at teardown on purpose: these are the edits still unsaved then.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (dirtyKeys.current.size) flushSave();
    };
    // Registered once; close and flushSave only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect dock-side changes without clobbering in-progress edits. One-way
  // progress flags always move forward.
  useEffect(() => {
    let un;
    let disposed = false;
    let latest = 0;
    onConfigChanged(() => {
      // Reads can resolve out of order; only the newest one may land.
      const seq = ++latest;
      configApi.get().then((c) => {
        if (disposed || seq !== latest) return;
        // Merge against the ref, not inside a setCfg updater: StrictMode runs
        // updaters twice, and painting or loading a language is a side effect.
        // cfgRef always holds the newest draft (set() writes it synchronously).
        const prev = cfgRef.current;
        if (prev?.revision > c.revision) return;
        // A remote update may already contain our desired value, or may have
        // returned to our baseline. Neither needs a permanent conflict banner.
        if (conflictRef.current && !savingKeys.current.size) {
          const remaining = conflictRef.current.keys.filter((key) => {
            if (JSON.stringify(c[key]) === JSON.stringify(prev[key])) {
              dirtyKeys.current.delete(key); dirtyBase.current.delete(key); return false;
            }
            return JSON.stringify(c[key]) !== JSON.stringify(dirtyBase.current.get(key));
          });
          setConfigConflict(remaining.length ? { keys: remaining, current: c } : null);
          if (!remaining.length) {
            setSaveState(dirtyKeys.current.size ? "saving" : "saved");
            if (dirtyKeys.current.size) saveTimer.current = setTimeout(() => flushLatest.current(), 0);
          }
        }
        let next = Array.isArray(c.pinned) ? c : { ...c, pinned: [] };
        if (prev) {
          next = { ...c };
          for (const key of new Set([...savingKeys.current, ...dirtyKeys.current])) next[key] = prev[key];
          next.onboarded = prev.onboarded || c.onboarded;
          next.settingsIntroSeen = prev.settingsIntroSeen || c.settingsIntroSeen;
          next.seenVersion = c.seenVersion || prev.seenVersion;
        }
        cfgRef.current = next;
        setCfg(next);
        setLoadError(false);
        paint(next);
        ensureLang(next.language).then(() => {
          if (!disposed) setCfg((current) => (current ? { ...current } : current));
        });
      }).catch(() => {});
    }).then((u) => { if (disposed) u(); else un = u; });
    return () => { disposed = true; un?.(); };
  }, []);

  return {
    cfg, set, saveState, closeError, configConflict, loadError, retryLoad: load,
    flushSave, settled, close, finishClose, resolveConfigConflict,
    prepareConfigOperation, applySnapshot, reset,
    applyProfile: (name, expected) => applySnapshot(() => dockApi.profileApply(name, expected)),
    importProfile: (path, expected) => applySnapshot(() => dockApi.importConfig(path, expected)),
    startFresh: () => applySnapshot(() => invoke("start_fresh_config")),
  };
}
