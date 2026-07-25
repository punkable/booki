/* Truth table for the dock's visibility policy.
 *
 * These run in plain Node — no browser, no Tauri — because decideVisible is a
 * pure function. Each case below is a behaviour that was previously encoded
 * implicitly across reveal(), tryTuck() and onOcclusionSignal(), and several
 * are bugs that shipped and had to be re-fixed. Writing them down as a table is
 * the point of the refactor: the next change to hide/reveal has to keep all of
 * them true at once, which the old scattered conditions never guaranteed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { decideVisible, wantsHidden } from "../src/dock/visibility-policy.js";

/** Defaults: smart mode, click trigger, nothing going on. */
const base = {
  mode: "smart",
  trigger: "click",
  fullscreen: false,
  previewing: false,
  occluded: false,
  manualHide: false,
  summoned: false,
  draggingFile: false,
  pointerInside: false,
};
const S = (over) => ({ ...base, ...over });

test("fullscreen blacks the dock out, over everything else", () => {
  assert.equal(decideVisible(S({ fullscreen: true })), false);
  assert.equal(decideVisible(S({ fullscreen: true, mode: "off" })), false);
  // Even an explicit summon must not paint over a fullscreen game.
  assert.equal(decideVisible(S({ fullscreen: true, summoned: true })), false);
  assert.equal(decideVisible(S({ fullscreen: true, draggingFile: true })), false);
});

test("a live position preview owns visibility", () => {
  assert.equal(decideVisible(S({ previewing: true })), null);
  assert.equal(decideVisible(S({ previewing: true, occluded: true })), null);
});

test("auto-hide off means always visible", () => {
  assert.equal(decideVisible(S({ mode: "off" })), true);
  assert.equal(decideVisible(S({ mode: "off", occluded: true })), true);
  assert.equal(decideVisible(S({ mode: "off", manualHide: true })), true);
});

test("a file drag keeps the dock out so the drop has a target", () => {
  assert.equal(decideVisible(S({ draggingFile: true, occluded: true })), true);
  assert.equal(decideVisible(S({ draggingFile: true, mode: "edge" })), true);
  // But not over a fullscreen app — covered above.
});

test("an explicit summon beats a previous swipe-away", () => {
  assert.equal(decideVisible(S({ manualHide: true })), false);
  assert.equal(decideVisible(S({ manualHide: true, summoned: true })), true);
});

test("swiping the bar away keeps it away until asked for", () => {
  // Not hover, not a clearing desktop — this was the "it comes back by itself"
  // complaint.
  assert.equal(decideVisible(S({ manualHide: true, occluded: false })), false);
  assert.equal(
    decideVisible(S({ manualHide: true, occluded: false, trigger: "hover" })),
    false
  );
  assert.equal(decideVisible(S({ manualHide: true, pointerInside: true, mode: "edge" })), false);
});

test("edge mode follows the pointer", () => {
  assert.equal(decideVisible(S({ mode: "edge", pointerInside: true })), true);
  assert.equal(decideVisible(S({ mode: "edge", pointerInside: false })), false);
  // The trigger only governs how it comes back, not whether leaving hides it.
  assert.equal(
    decideVisible(S({ mode: "edge", trigger: "hover", pointerInside: false })),
    false
  );
});

test("smart mode hides while another window covers the dock", () => {
  assert.equal(decideVisible(S({ occluded: true })), false);
  assert.equal(decideVisible(S({ occluded: true, trigger: "hover" })), false);
  // A dock summoned from the notch still tucks once you go back to an app —
  // summon is not a permanent pin.
  assert.equal(decideVisible(S({ occluded: true, summoned: false })), false);
});

test("a clear desktop only auto-reveals in hover mode", () => {
  // The distinction that `null` exists for: in click mode the tucked dock must
  // stay tucked until the notch is clicked, even though nothing covers it.
  assert.equal(decideVisible(S({ occluded: false, trigger: "click" })), null);
  assert.equal(decideVisible(S({ occluded: false, trigger: "hover" })), true);
});

test("wantsHidden only reports a definite hide", () => {
  assert.equal(wantsHidden(S({ occluded: true })), true);
  assert.equal(wantsHidden(S({ mode: "edge", pointerInside: false })), true);
  // `null` is not a request to hide.
  assert.equal(wantsHidden(S({ occluded: false, trigger: "click" })), false);
  assert.equal(wantsHidden(S({ mode: "off" })), false);
  assert.equal(wantsHidden(S({ previewing: true })), false);
});

test("the answer never depends on argument order or extra keys", () => {
  // Guards against someone reintroducing order-sensitivity by reading mutable
  // state instead of the argument.
  const a = decideVisible(S({ occluded: true, manualHide: true }));
  const b = decideVisible(S({ manualHide: true, occluded: true }));
  assert.equal(a, b);
});
