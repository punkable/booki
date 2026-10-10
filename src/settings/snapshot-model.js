const internal = new Set(['revision','seenVersion','settingsRev','settingsIntroSeen','onboarded','lastProfile','profileRules']);
/** @param {Record<string, unknown>} current @param {Record<string, unknown>} snapshot */
export function changedSnapshotFields(current, snapshot) {
  return Object.keys(snapshot).filter(key=>!internal.has(key) && JSON.stringify(current[key])!==JSON.stringify(snapshot[key]));
}
const labels = {
  pinned:'workspace.pinned',theme:'ap.theme',accent:'ap.accent',surfaceStyle:'premium.finishes',surfaceTint:'ap.surfaceTint',materialStrength:'ap.solidity',iconSize:'ap.iconSize',spacing:'ap.spacing',cornerRadius:'ap.radius',edge:'be.position',autoHide:'be.autoHide',autoHideDelay:'be.hideDelay',monitor:'be.monitor',monitorName:'be.monitor',notchMode:'be.notchMode',notchStyle:'be.notchMode',notchSize:'ap.notchSize',magnification:'be.magnify',zoom:'be.zoom',language:'ap.language',autostart:'be.autostart',hotkey:'sc.global',launcherHotkey:'sc.launcher',positionHotkeys:'sc.positions',clipboardMemory:'clip.memory',usageRecommendationsEnabled:'premium.localRecommendations',reduceTransparency:'overhaul.reduceTransparency',captureVisible:'gen.captureVisible'
};
/** @param {string} key @param {(key:string)=>string} t */
export function snapshotFieldLabel(key,t) { return t(labels[/** @type {keyof typeof labels} */ (key)] || 'overhaul.system'); }

/** Group related changes once instead of repeating generic labels for every field.
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} snapshot
 * @param {(key:string)=>string} t
 */
export function snapshotChangeGroups(current, snapshot, t) {
  /** @type {Map<string, {label:string, fields:string[]}>} */
  const groups = new Map();
  for (const field of changedSnapshotFields(current, snapshot)) {
    const label = snapshotFieldLabel(field, t);
    const group = groups.get(label) || { label, fields: [] };
    group.fields.push(field); groups.set(label, group);
  }
  return [...groups.values()];
}
/** Compact comparable values; documents and arrays remain in the dock previews.
 * @param {unknown} value
 * @param {(key:string)=>string} t
 */
export function snapshotScalar(value, t) {
  if (typeof value === 'boolean') return t(value ? 'integral.enabled' : 'integral.disabled');
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value || '—';
  return null;
}
