/* Reduced-motion, read as a live signal instead of a boot-time snapshot.
 *
 * The CSS side already reacts to `prefers-reduced-motion` through media
 * queries, but everything the dock animates in JS (magnify transforms, the
 * marquee builders, the number tweens) used to read the setting exactly once,
 * when the module loaded. Toggling the accessibility setting therefore did
 * nothing until Booki was restarted — the one place where a user who needs the
 * setting is least likely to look for it.
 */
const query =
  typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

let reduced = !!query?.matches;

// addEventListener is the modern form; addListener is the fallback older
// WebView2 builds still ship. Either way a missing API just leaves the boot
// value in place, which is the previous behaviour.
if (query) {
  const onChange = (e) => {
    reduced = e.matches;
  };
  if (query.addEventListener) query.addEventListener("change", onChange);
  else if (query.addListener) query.addListener(onChange);
}

/** True while the user asks for reduced motion. Call it, don't cache it. */
export function reduceMotion() {
  return reduced;
}
