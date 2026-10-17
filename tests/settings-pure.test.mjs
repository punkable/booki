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
  { id: "w1", kind: "widget", widget: "clock", style: { variant: "glass" } },
  {
    id: "g1",
    kind: "group",
    name: "Group",
    children: [
      { id: "k1", kind: "app", name: "Kid" },
      { id: "w2", kind: "widget", widget: "clock", style: { variant: "solid" } },
    ],
  },
];

test("widgetRefs finds the same widget on the bar and inside a group", () => {
  const refs = widgetRefs(pinned, "clock");
  assert.equal(refs.length, 2);
  assert.equal(refs[0].type, "top");
  assert.equal(refs[0].id, "w1");
  assert.equal(refs[1].type, "child");
  assert.equal(refs[1].groupId, "g1");
  assert.equal(refs[1].id, "w2");
});

test("widgetRefs copes with an empty or missing list", () => {
  assert.deepEqual(widgetRefs([], "clock"), []);
  assert.deepEqual(widgetRefs(null, "clock"), []);
  assert.deepEqual(widgetRefs(pinned, "battery"), []);
});

test("widgetRefs finds a widget saved under a name it replaced", () => {
  const legacy = [{ id: "old", kind: "widget", widget: "cpu" }, { id: "t", kind: "widget", widget: "tasks" }];
  assert.deepEqual(widgetRefs(legacy, "system").map((ref) => ref.id), ["old"]);
  assert.deepEqual(widgetRefs(legacy, "focus").map((ref) => ref.id), ["t"]);
});


test("groups saved with the old Apple palette show the matching Windows shade", async () => {
  const { groupAppearance, GROUP_PALETTE } = await import("../src/group-style.js");
  assert.equal(groupAppearance({ style: { color: "#0A84FF" } }).color, "#0078d4");
  assert.equal(groupAppearance({ style: { color: "#123456" } }).color, "#123456");
  const shades = GROUP_PALETTE.flatMap(([, s]) => s);
  for (const old of ["#8fc2ff", "#ff453a", "#3a3a3c"]) assert.ok(shades.includes(groupAppearance({ style: { color: old } }).color));
});
