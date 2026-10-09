const internal = new Set(['revision','seenVersion','settingsRev','settingsIntroSeen','onboarded','lastProfile']);
/** @param {Record<string, unknown>} current @param {Record<string, unknown>} snapshot */
export function changedSnapshotFields(current, snapshot) {
  return Object.keys(snapshot).filter(key=>!internal.has(key) && JSON.stringify(current[key])!==JSON.stringify(snapshot[key]));
}
const labels = {
  pinned:'workspace.pinned',theme:'ap.theme',accent:'ap.accent',surfaceStyle:'premium.finishes',surfaceTint:'ap.surfaceTint',materialStrength:'ap.solidity',iconSize:'ap.iconSize',spacing:'ap.spacing',cornerRadius:'ap.radius',edge:'be.position',autoHide:'be.autoHide',autoHideDelay:'be.hideDelay',monitor:'be.monitor',monitorName:'be.monitor',notchMode:'be.notchMode',notchStyle:'be.notchMode',notchSize:'ap.notchSize',magnification:'be.magnify',zoom:'be.zoom',language:'ap.language',autostart:'be.autostart',hotkey:'sc.global',positionHotkeys:'sc.positions',clipboardMemory:'clip.memory',usageRecommendationsEnabled:'premium.localRecommendations',reduceTransparency:'overhaul.reduceTransparency',captureVisible:'gen.captureVisible'
};
/** @param {string} key @param {(key:string)=>string} t */
export function snapshotFieldLabel(key,t) { return t(labels[/** @type {keyof typeof labels} */ (key)] || 'overhaul.system'); }
