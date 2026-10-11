/* Mutable state the dock modules share.
 *
 * A module cannot reassign a `let` it imports, so every variable that more
 * than one part of the dock reads and writes lives on this one object
 * (`S.cfg`, `S.hiddenState`, …). State that only one module uses stays
 * private to that module.
 */
export const S = {
  // The live configuration, replaced on every reload.
  cfg: null,
  nativeSupport: {},
  appPollTick: null,

  // Visibility (auto-hide, notch summon, fullscreen).
  hiddenState: false,
  hideTimer: null,
  previewing: false,
  pinnedReveal: false, // user CLICKED the notch → keep the dock open to use it
  pinTouched: false, // the pointer actually visited the dock since the pin
  fullscreen: false, // dock suppressed for a fullscreen blackout (not raw FS signal)
  draggingFile: false, // an OS file drag is over the dock → keep it open
  manualHide: false, // user swiped the bar away → hover must not bring it back
  pointerInside: false,
  displayOff: false,

  // Gestures on the bar.
  editMode: false,
  dragging: false,
  press: null, // { el, item, startX, startY, longTimer, moved }
  edgeMove: null,

  // Window frame and hit regions.
  lastFull: null,
  lastHitSig: "",
  magDockRect: null,
  // When the dock window finishes resizing (async, after applyFrame), re-place the
  // overlay that's currently open so it can't be left clipped by a slow resize.
  pendingReplace: null,

  // Menus, popovers and panels.
  menuGeneration: 0,
  trashPop: null,
  productivityPanel: null,

  // The #stack flyout (folders, groups, add panel, launcher, clipboard).
  stackOpen: false,
  stackItemId: null,
  stackRefreshPins: null,
  // The clipboard flyout's search debounce; closeStack clears it.
  clipSearchTimer: null,

  pollTimer: null,
};
