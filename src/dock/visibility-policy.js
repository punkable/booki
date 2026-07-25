/* Should the dock be on screen right now?
 *
 * This is the single place that answers that question, and it is deliberately
 * pure: no DOM, no Tauri, no timers. Everything it needs arrives in one object,
 * so it can be exercised as a truth table in tests/visibility-policy.test.mjs
 * instead of by driving a real window.
 *
 * Why it exists. The answer used to be spread across nine mutable flags and
 * ~130 references in dock.js, with reveal(), tryTuck() and onOcclusionSignal()
 * each checking a different subset of them in a different order. Adding a case
 * to one meant remembering to add it to the others, and that is exactly why the
 * notch/auto-hide subsystem was re-fixed more than twenty times between 0.44
 * and 0.67: every fix was locally right and globally inconsistent.
 *
 * The other half of the old tangle — "can we act on this right now?" (the
 * pointer is on the bar, a drag is in flight, a menu is open) — is NOT here. It
 * is a separate concern, handled by the caller, and the rule it enforces is:
 *
 *     showing is always allowed; hiding waits until the user is done.
 *
 * That sentence already existed as a comment in dock.js. It just was not
 * enforced in one place.
 */

/**
 * @param {object} s
 * @param {"off"|"smart"|"edge"} s.mode      auto-hide mode
 * @param {"click"|"hover"}      s.trigger   how a tucked dock comes back
 * @param {boolean} s.fullscreen   a fullscreen app owns the screen
 * @param {boolean} s.previewing   Settings is driving position live
 * @param {boolean} s.occluded     another window covers the dock's home rect
 * @param {boolean} s.manualHide   the user swiped the bar away
 * @param {boolean} s.summoned     the user asked for it (notch click / hot edge)
 * @param {boolean} s.draggingFile an OS file drag is over the dock
 * @param {boolean} s.pointerInside the pointer is within the dock's live area
 * @returns {boolean|null} true = show, false = hide, null = no opinion (leave
 *   it as it is). `null` is a real answer, not a fallback: in click mode a
 *   tucked dock must NOT pop back out on its own when the desktop clears — only
 *   the notch brings it back.
 */
export function decideVisible(s) {
  // A fullscreen game or video wins over every other consideration, including
  // an explicit summon: Booki must not paint over it.
  if (s.fullscreen) return false;

  // While Settings previews a position, that preview owns the window.
  if (s.previewing) return null;

  // Never auto-hides.
  if (s.mode === "off") return true;

  // A drop needs somewhere to land; vanishing mid-drag loses the file.
  if (s.draggingFile) return true;

  // An explicit summon outranks a previous swipe-away.
  if (s.summoned) return true;

  // Swiped away by hand: only the notch brings it back, never hover or a
  // clearing desktop.
  if (s.manualHide) return false;

  if (s.mode === "edge") {
    // Visible exactly while the pointer is on it. When it is tucked the window
    // is hidden, so pointerInside cannot become true on its own — the way back
    // is the notch or the hot edge, both of which arrive as `summoned`.
    return !!s.pointerInside;
  }

  // smart: tied to whether another window is covering the dock's spot.
  if (s.occluded) return false;
  // Desktop is clear. Hover mode brings the bar back by itself; click mode
  // waits to be asked, which is the `null` case above.
  return s.trigger === "hover" ? true : null;
}

/**
 * Would the current mode want the dock tucked away, ignoring whether the user
 * is mid-gesture? Kept as its own export because the caller needs it to decide
 * whether to even start the auto-hide grace period.
 */
export function wantsHidden(s) {
  return decideVisible(s) === false;
}
