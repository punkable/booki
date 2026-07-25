/* The widget card's formatting rules, now that they are pure functions.
 *
 * These ran only inside a browser before, as a side effect of a poll tick, so
 * none of them had a test. Two shipped as bugs: every marquee used one fixed
 * duration regardless of how long the title was, and the clock had no notion
 * of "nothing changed" so it reformatted itself sixty times a minute.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  fmtRate,
  fmtUptime,
  dockPreviewSnippet,
  marqueeDuration,
  volumeStep,
  clockParts,
  RING_C,
} from "../src/dock/widget-view.js";

test("network rate switches unit at a megabyte", () => {
  assert.equal(fmtRate(0), "0 KB/s");
  assert.equal(fmtRate(999), "999 KB/s");
  assert.equal(fmtRate(1023), "1023 KB/s");
  assert.equal(fmtRate(1024), "1.0 MB/s");
  assert.equal(fmtRate(5120), "5.0 MB/s");
});

test("uptime shows the two largest units that matter", () => {
  assert.equal(fmtUptime(0), "0m");
  assert.equal(fmtUptime(59), "0m"); // under a minute is still "0m", not blank
  assert.equal(fmtUptime(3600), "1h 0m");
  assert.equal(fmtUptime(7260), "2h 1m");
  assert.equal(fmtUptime(90000), "1d 1h");
});

test("preview snippet collapses whitespace and fits the budget", () => {
  assert.equal(dockPreviewSnippet("  a\n\tb   c "), "a b c");
  const long = "x".repeat(300);
  const cut = dockPreviewSnippet(long, 20);
  assert.equal(cut.length, 20);
  assert.ok(cut.endsWith("..."));
  // Anything at or under the budget is passed through untouched.
  assert.equal(dockPreviewSnippet("short", 20), "short");
  assert.equal(dockPreviewSnippet(null), "");
});

test("marquee duration scales with distance, within bounds", () => {
  // The bug this replaced: one fixed 9s for every title, so long tracks raced.
  const short = marqueeDuration(50);
  const mid = marqueeDuration(400);
  const long = marqueeDuration(5000);
  assert.ok(mid > short, "a longer title must take longer to scroll");
  assert.ok(long >= mid);
  // Clamped at both ends so nothing crawls forever or flies past.
  assert.equal(short, marqueeDuration(1));
  assert.equal(long, marqueeDuration(999999));
  // Speed stays constant in the middle of the range: double the distance,
  // double the time.
  assert.ok(Math.abs(marqueeDuration(600) / marqueeDuration(300) - 2) < 0.01);
});

test("volume wheel steps further on a firm flick", () => {
  assert.equal(volumeStep(10), 3);
  assert.equal(volumeStep(-10), 3);
  assert.equal(volumeStep(120), 5);
  assert.equal(volumeStep(-120), 5);
});

test("clock key only changes when the visible text does", () => {
  const at = (h, m, s) => new Date(2026, 6, 25, h, m, s);
  const a = clockParts(at(9, 30, 0), "en");
  const b = clockParts(at(9, 30, 59), "en"); // 59 wasted repaints avoided
  assert.equal(a.key, b.key);
  assert.equal(a.time, b.time);

  assert.notEqual(clockParts(at(9, 31, 0), "en").key, a.key);
  assert.notEqual(clockParts(at(10, 30, 0), "en").key, a.key);
  // Switching language must repaint even though the instant is identical.
  assert.notEqual(clockParts(at(9, 30, 0), "es").key, a.key);
});

test("clock formats in the chosen language and falls back to English", () => {
  const noon = new Date(2026, 6, 25, 12, 5, 0);
  for (const lang of ["es", "en", "pt", "fr", "de"]) {
    const { time, date } = clockParts(noon, lang);
    assert.ok(time.includes("12"), `${lang} time looked wrong: ${time}`);
    assert.ok(date.length > 0);
  }
  assert.equal(clockParts(noon, "zz").time, clockParts(noon, "en").time);
});

test("the ring's circumference matches its radius", () => {
  // The gauge is drawn by offsetting a dash the length of the whole circle;
  // if these drift apart the ring reads full when it should read empty.
  assert.ok(Math.abs(RING_C - 2 * Math.PI * 15.5) < 1e-9);
});
