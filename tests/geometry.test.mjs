/* The geometry both windows share.
 *
 * The dock and the notch each grew their own byte-identical copies of these,
 * so a fix could land in one window and quietly miss the other. Now there is
 * one copy and it has a test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pointInRect, hitSignature } from "../src/dock/geometry.js";

test("a rect owns its top-left corner but not its bottom-right", () => {
  const r = [10, 20, 100, 50]; // x, y, w, h
  assert.equal(pointInRect(10, 20, r), true, "top-left is inside");
  assert.equal(pointInRect(109, 69, r), true, "last pixel inside");
  // Half-open on the far edge: adjacent tiles must not both claim the seam,
  // or a click between two icons hits whichever is tested first.
  assert.equal(pointInRect(110, 45, r), false);
  assert.equal(pointInRect(60, 70, r), false);
  assert.equal(pointInRect(9, 45, r), false);
  assert.equal(pointInRect(60, 19, r), false);
});

test("a missing rect contains nothing", () => {
  assert.equal(pointInRect(0, 0, null), false);
  assert.equal(pointInRect(0, 0, undefined), false);
});

test("the hit signature ignores sub-pixel drift", () => {
  // Both windows re-measure every frame while something animates; a tenth of a
  // pixel is not a change anyone can click on, and treating it as one would
  // put an IPC call on every frame.
  const a = hitSignature([[10.02, 20.4, 100, 50]], false);
  const b = hitSignature([[9.98, 20.1, 100, 50]], false);
  assert.equal(a, b);
});

test("the hit signature changes when a rect really moves", () => {
  const a = hitSignature([[10, 20, 100, 50]], false);
  assert.notEqual(hitSignature([[10, 24, 100, 50]], false), a);
  assert.notEqual(hitSignature([[10, 20, 100, 50], [1, 2, 3, 4]], false), a);
  assert.notEqual(hitSignature([], false), a);
});

test("the whole-window state has one signature regardless of rects", () => {
  // "all" means the backend keeps the entire stage interactive, so which rects
  // were measured is irrelevant — and must not cause repeat IPC mid-gesture.
  assert.equal(hitSignature([[1, 2, 3, 4]], true), hitSignature([], true));
  assert.notEqual(hitSignature([], true), hitSignature([], false));
});
