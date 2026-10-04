import test from "node:test";
import assert from "node:assert/strict";
import { chooseFitSize, widgetWidth, countContent } from "../src/dock/layout-model.js";
import { toggleTimer, timerSeconds, calendarMonth, tasksSummary } from "../src/dock/productivity.js";
import { singleFlight } from "../src/dock/async-cache.js";
import { rank } from "../src/dock/add-panel.js";
import { updateProgress } from "../src/update-state.js";

test("timer deadlines survive hidden periods and pause/resume preserves remaining seconds", () => {
  const running = toggleTimer({ minutes: 25 }, 1000);
  assert.equal(timerSeconds(running, 61000), 1440);
  const paused = toggleTimer(running, 61000);
  assert.equal(timerSeconds(paused, 9999999), 1440);
  assert.equal(timerSeconds(toggleTimer(paused, 100000), 160000), 1380);
  assert.equal(timerSeconds(running, 1600000), 0);
  assert.equal(timerSeconds({ remaining: 0 }, 0), 0);
});
test("calendar handles leap years and Monday-first alignment", () => {
  const feb = calendarMonth(new Date(2024, 1, 1));
  assert.equal(feb.filter(Boolean).length, 29);
  assert.equal(feb.indexOf(1), 3);
  assert.equal(feb.length % 7, 0);
});
test("tasks report the next open item", () => {
  assert.deepEqual(tasksSummary([{ done: true, text: "Done" }, { text: "Next" }]), { total: 2, done: 1, next: "Next" });
});
test("scroll overflow preserves chosen size and adaptive overflow keeps a readable minimum", () => {
  assert.equal(chooseFitSize(48, 1500, 700, "scroll"), 48);
  assert.equal(chooseFitSize(48, 1500, 700, "adapt"), 30);
  assert.equal(widgetWidth("clock", 48, 6), 102);
  assert.equal(widgetWidth("clock", 48, 6, { span: 3 }), 156);
  assert.deepEqual(countContent([{ kind: "group", children: [{ kind: "widget" }, { kind: "app" }] }]), { apps: 1, widgets: 1, groups: 1 });
});
test("usage ordering is preserved without a query", () => {
  const list = [{ name: "Zed" }, { name: "Atom" }];
  assert.deepEqual(rank(list, ""), list);
});
test("overlapping polls share the request and recover after a failure", async () => {
  let calls = 0, release;
  const fn = singleFlight(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const one = fn(), two = fn(); await Promise.resolve();
  assert.equal(one, two); assert.equal(calls, 1); release(42); assert.equal(await two, 42);
  const three = fn(); await Promise.resolve(); assert.equal(calls, 2); release(43); await three;
  let failures = 0; const fail = singleFlight(() => { failures++; throw new Error("retry"); });
  await assert.rejects(fail()); await assert.rejects(fail()); assert.equal(failures, 2);
});
test("update progress supports unknown sizes and clamps incorrect metadata", () => {
  assert.equal(updateProgress(0, 40), null);
  assert.equal(updateProgress(100, 150), 1);
  assert.equal(updateProgress(100, 25), .25);
});
