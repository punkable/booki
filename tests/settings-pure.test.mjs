/* Unit tests for the parts of Settings that are pure logic.
 *
 * These needed no browser and no React the moment they stopped living in the
 * middle of a 3600-line component file — which is the practical argument for
 * the extraction. Both modules back user-visible behaviour that had zero
 * coverage: the settings search box, and finding a widget that may be on the
 * bar or nested inside a group.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { findSettings } from "../src/settings/search.js";
import {
  widgetRefs,
  itemForWidgetRef,
  updateWidgetStyleForRef,
} from "../src/settings/pin-model.js";

// ── search ────────────────────────────────────────────────────────────────

test("search returns nothing for an empty query", () => {
  assert.deepEqual(findSettings(""), []);
  assert.deepEqual(findSettings("   "), []);
});

test("search finds a setting and says which tab hosts it", () => {
  const hits = findSettings("theme");
  assert.ok(hits.length > 0, "expected a hit for 'theme'");
  assert.ok(hits[0].tab, "a hit must carry its tab");
  assert.ok(hits[0].label, "a hit must carry its label");
});

test("search ignores accents and case", () => {
  // The dock ships in five languages; a Spanish user typing "translucidez"
  // without the accent, or in caps, must still find it.
  const plain = findSettings("translucency");
  const shouty = findSettings("TRANSLUCENCY");
  assert.deepEqual(
    plain.map((h) => h.key),
    shouty.map((h) => h.key)
  );
});

test("search caps its result list", () => {
  // A very loose query used to be able to return the whole index.
  const hits = findSettings("e");
  assert.ok(hits.length <= 8, `expected at most 8 hits, got ${hits.length}`);
});

test("search returns nothing for gibberish", () => {
  assert.deepEqual(findSettings("qqzzxxjjkk"), []);
});

// ── pin model ─────────────────────────────────────────────────────────────

const pinned = [
  { id: "a", kind: "app", name: "One" },
  { id: "w1", kind: "widget", widget: "cpu", style: { variant: "glass" } },
  {
    id: "g1",
    kind: "group",
    name: "Group",
    children: [
      { id: "k1", kind: "app", name: "Kid" },
      { id: "w2", kind: "widget", widget: "cpu", style: { variant: "solid" } },
    ],
  },
];

test("widgetRefs finds the same widget on the bar and inside a group", () => {
  const refs = widgetRefs(pinned, "cpu");
  assert.equal(refs.length, 2);
  assert.equal(refs[0].type, "top");
  assert.equal(refs[0].id, "w1");
  assert.equal(refs[1].type, "child");
  assert.equal(refs[1].groupId, "g1");
  assert.equal(refs[1].id, "w2");
});

test("widgetRefs copes with an empty or missing list", () => {
  assert.deepEqual(widgetRefs([], "cpu"), []);
  assert.deepEqual(widgetRefs(null, "cpu"), []);
  assert.deepEqual(widgetRefs(pinned, "ram"), []);
});

test("itemForWidgetRef resolves both kinds of reference", () => {
  const [top, child] = widgetRefs(pinned, "cpu");
  assert.equal(itemForWidgetRef(pinned, top).id, "w1");
  assert.equal(itemForWidgetRef(pinned, child).id, "w2");
  assert.equal(itemForWidgetRef(pinned, null), null);
  assert.equal(itemForWidgetRef(pinned, { type: "top", id: "nope" }), null);
});

test("updateWidgetStyleForRef edits without mutating the original", () => {
  const [top] = widgetRefs(pinned, "cpu");
  const next = updateWidgetStyleForRef(pinned, top, { variant: "outline" });
  assert.equal(next.find((i) => i.id === "w1").style.variant, "outline");
  // The caller keeps the old tree for undo/diffing, so it must be untouched.
  assert.equal(pinned.find((i) => i.id === "w1").style.variant, "glass");
});

test("updateWidgetStyleForRef reaches a widget nested in a group", () => {
  const [, child] = widgetRefs(pinned, "cpu");
  const next = updateWidgetStyleForRef(pinned, child, { variant: "minimal" });
  const group = next.find((i) => i.id === "g1");
  assert.equal(group.children.find((c) => c.id === "w2").style.variant, "minimal");
  // Siblings and the bar-level widget are left alone.
  assert.equal(group.children.find((c) => c.id === "k1").name, "Kid");
  assert.equal(next.find((i) => i.id === "w1").style.variant, "glass");
});

test("updateWidgetStyleForRef is a no-op without a reference", () => {
  assert.equal(updateWidgetStyleForRef(pinned, null, {}), pinned);
});
