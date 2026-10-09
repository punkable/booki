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
import { normalizeGroups as normalizePinned } from "../pins.js";
import { updates } from "../update.js";
import { setLang, ensureLang } from "../i18n.js";

function paint(cfg) {
  applyTheme(cfg);
  applySurfaceVars(cfg);
}

export function useSettingsStore() {
  const [cfg, setCfg] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [closeError, setCloseError] = useState(false);
  const [configConflict, setConfigConflict] = useState(null);
  const cfgRef = useRef(null);
  const saveTimer = useRef(null);
  const dirtyKeys = useRef(new Set());
  const dirtyBase = useRef(new Map());
  const savingKeys = useRef(new Set());
  const closing = useRef(false);
  const afterSaveCb = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  cfgRef.current = cfg;

  const performSave = async () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const keys = [...dirtyKeys.current];
    const base = Object.fromEntries(keys.map((key) => [key, dirtyBase.current.get(key)]));
    for (const key of keys) dirtyBase.current.delete(key);
    dirtyKeys.current.clear();
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
      await emitConfigChanged();
      if (!dirtyKeys.current.size) cfgRef.current = toSave;
      // Keep any edits typed while the save was in flight.
      setCfg((prev) => (!prev ? toSave : dirtyKeys.current.size ? prev : { ...prev, ...toSave }));
      setSaveState("saved");
      setConfigConflict(null);
      if (typeof cb === "function") cb(toSave);
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
  const settled = async () => { await flushSave(); return !dirtyKeys.current.size; };

  /** Apply a patch now; save it shortly (or immediately with `flush`). */
  const set = (patch, opts = {}) => {
    const prev = cfgRef.current;
    const next = { ...prev, ...patch };
    if (patch.pinned) next.pinned = normalizePinned(patch.pinned);
    // Record the draft synchronously: a native close can arrive before React
    // renders the edit, and must still wait for those keys to reach disk.
    for (const key of Object.keys(patch)) {
      if (!dirtyKeys.current.has(key)) dirtyBase.current.set(key, structuredClone(prev?.[key]));
      dirtyKeys.current.add(key);
    }
    cfgRef.current = next;
    setCfg(next);
    if (prev && prev.language !== next.language) {
      ensureLang(next.language).then(() => { setLang(next.language); setCfg((c) => ({ ...c })); });
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
    paint(fresh);
    await emitConfigChanged();
    return fresh;
  };

  const finishClose = async () => {
    if (closing.current) return;
    closing.current = true;
    setCloseError(false);
    const keepAlive = ["downloading", "ready", "installing"].includes(updates.snapshot().phase);
    try { await closeSelf({ keepAlive }); }
    catch (_) { setCloseError(true); }
    finally { closing.current = false; }
  };
  const close = async () => { if (await settled()) finishClose(); };

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

  // First load.
  useEffect(() => {
    configApi.get().then(async (c) => {
      await ensureLang(c.language);
      let next = c;
      // Migrate the legacy localStorage intro flag into persisted config once.
      try {
        if (!c.settingsIntroSeen && localStorage.getItem("booki.introSeen") === "1") {
          next = { ...c, settingsIntroSeen: true };
          configApi.save(next).catch(() => {});
        }
      } catch (_) {}
      setCfg(next);
      paint(next);
    });
  }, []);

  // A native close waits for the last edit.
  useEffect(() => {
    let disposed = false;
    let unlisten;
    onCloseRequest((event) => {
      event.preventDefault();
      flushSave().then(() => { if (!dirtyKeys.current.size) finishClose(); });
    }).then((un) => { if (disposed) un(); else unlisten = un; });
    return () => {
      disposed = true;
      unlisten?.();
      clearTimeout(saveTimer.current);
      if (dirtyKeys.current.size) flushSave();
    };
  }, []);

  // Reflect dock-side changes without clobbering in-progress edits. One-way
  // progress flags always move forward.
  useEffect(() => {
    let un;
    onConfigChanged(() => {
      configApi.get().then((c) =>
        setCfg((prev) => {
          if (!prev) return c;
          const next = { ...c };
          for (const key of new Set([...savingKeys.current, ...dirtyKeys.current])) next[key] = prev[key];
          next.onboarded = prev.onboarded || c.onboarded;
          next.settingsIntroSeen = prev.settingsIntroSeen || c.settingsIntroSeen;
          next.seenVersion = c.seenVersion || prev.seenVersion;
          paint(next);
          ensureLang(next.language).then(() => setCfg((current) => ({ ...current })));
          cfgRef.current = next;
          return next;
        })
      );
    }).then((u) => (un = u));
    return () => un && un();
  }, []);

  return {
    cfg, set, saveState, closeError, configConflict,
    flushSave, settled, close, finishClose, resolveConfigConflict,
    prepareConfigOperation, applySnapshot, reset,
    applyProfile: (name, expected) => applySnapshot(() => dockApi.profileApply(name, expected)),
    importProfile: (path, expected) => applySnapshot(() => dockApi.importConfig(path, expected)),
    startFresh: () => applySnapshot(() => invoke("start_fresh_config")),
  };
}
