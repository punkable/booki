/* Where a floating box goes relative to the bar.
 *
 * Five things get placed beside the dock — the context menu, the popovers, the
 * note editor, the update pill, the group flyout — and each used to carry its
 * own copy of this arithmetic. The copies drifted: only the context menu
 * clamped both axes, which is why a long menu near a corner was sliced while
 * the same situation was fine for a popover. One implementation, one test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { placeBesideBar, transformOrigin, isVerticalEdge } from "../src/dock/placement.js";

const VIEW = { width: 1000, height: 600 };
// A bar 400 wide sitting centred along the bottom of that window.
const BOTTOM_BAR = { left: 300, top: 540, width: 400, height: 60 };
const LEFT_BAR = { left: 0, top: 200, width: 60, height: 200 };

test("edges are classified by axis, not by name", () => {
  assert.equal(isVerticalEdge("left"), true);
  assert.equal(isVerticalEdge("right"), true);
  assert.equal(isVerticalEdge("bottom"), false);
  assert.equal(isVerticalEdge("top"), false);
  assert.equal(isVerticalEdge(undefined), false);
});

test("a box sits on the outward side of the bar", () => {
  const box = { width: 200, height: 100 };
  const opts = { box, viewport: VIEW, gap: 10 };

  const bottom = placeBesideBar({ ...opts, bar: BOTTOM_BAR, edge: "bottom" });
  assert.equal(bottom.top, 540 - 100 - 10, "bottom dock opens upward");

  const top = placeBesideBar({ ...opts, bar: { ...BOTTOM_BAR, top: 0 }, edge: "top" });
  assert.equal(top.top, 60 + 10, "top dock opens downward");

  const left = placeBesideBar({ ...opts, bar: LEFT_BAR, edge: "left" });
  assert.equal(left.left, 60 + 10, "left dock opens rightward");

  const right = placeBesideBar({ ...opts, bar: { ...LEFT_BAR, left: 940 }, edge: "right" });
  assert.equal(right.left, 940 - 200 - 10, "right dock opens leftward");
});

test("without an anchor the box centres on the bar, not the window", () => {
  // A slot-aligned dock sits off-centre; centring on the window would leave
  // the popover visibly detached from the bar it belongs to.
  const offCentre = { left: 40, top: 540, width: 200, height: 60 };
  const { left } = placeBesideBar({
    bar: offCentre,
    box: { width: 100, height: 40 },
    edge: "bottom",
    viewport: VIEW,
  });
  assert.equal(left, 40 + 100 - 50, "centred on the bar");
  assert.notEqual(left, VIEW.width / 2 - 50);
});

test("an anchor point overrides the bar's centre", () => {
  // The context menu opens at the cursor, not at the middle of the dock.
  const { left } = placeBesideBar({
    bar: BOTTOM_BAR,
    box: { width: 120, height: 200 },
    edge: "bottom",
    viewport: VIEW,
    along: 650,
  });
  assert.equal(left, 650 - 60);
});

test("both axes are clamped into the window", () => {
  // The drift that mattered: a tall menu opened near a corner used to be
  // sliced at the window edge, worst on vertical docks.
  const tall = placeBesideBar({
    bar: LEFT_BAR,
    box: { width: 200, height: 560 },
    edge: "left",
    viewport: VIEW,
    along: 580, // near the bottom
    pad: 8,
  });
  assert.equal(tall.top, 600 - 560 - 8, "pushed up to fit");
  assert.ok(tall.top >= 8);

  const wide = placeBesideBar({
    bar: BOTTOM_BAR,
    box: { width: 300, height: 100 },
    edge: "bottom",
    viewport: VIEW,
    along: 980, // near the right edge
  });
  assert.equal(wide.left, 1000 - 300 - 8);
});

test("a box larger than the window still lands at the padding, not off-screen", () => {
  // Degenerate but reachable: a long menu on a short screen. The old inline
  // copies could produce a negative coordinate here.
  const { left, top } = placeBesideBar({
    bar: BOTTOM_BAR,
    box: { width: 1400, height: 900 },
    edge: "bottom",
    viewport: VIEW,
    pad: 8,
  });
  assert.equal(left, 8);
  assert.equal(top, 8);
});

test("the transform origin is the trigger, clamped to the box", () => {
  const box = { left: 100, top: 100, width: 200, height: 80 };
  assert.deepEqual(transformOrigin(box, 150, 140), { x: 50, y: 40 });
  // A cursor outside the box would otherwise shear the open animation.
  assert.deepEqual(transformOrigin(box, 50, 90), { x: 0, y: 0 });
  assert.deepEqual(transformOrigin(box, 999, 999), { x: 200, y: 80 });
});
