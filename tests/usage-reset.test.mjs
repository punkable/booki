import test from "node:test";
import assert from "node:assert/strict";
import { usageResets, usageSnapshot } from "../src/usage-reset.js";

const claude = (resets_at, started_at = 1) => ({
  id: "claude", name: "Claude", windows: [], block: { resets_at, started_at, tokens: 10, elapsed_percent: 80 },
});
const codex = (percent, resets_at) => ({
  id: "codex", name: "Codex", windows: [{ label: "week", percent, resets_at }], block: null,
});

test("the first snapshot never says a plan just reset", () => {
  assert.deepEqual(usageResets(null, [claude(100)], 200), []);
  assert.deepEqual(usageResets([], [codex(0, 0)], 200), []);
});

test("a window that was in use notifies once when its reset time passes", () => {
  const before = [codex(90, 1_000), claude(1_000)];
  const after = [codex(0, 0), { id: "claude", name: "Claude", windows: [], block: null }];
  const events = usageResets(before, after, 1_000);
  assert.deepEqual(events.map((e) => e.key), ["codex:week:1000", "claude:block:1000"]);
  assert.equal(events[0].name, "Codex");
  assert.equal(events[0].kind, "plan");
  assert.equal(events[1].kind, "block", "a local Claude block is not a recovered plan quota");
  assert.deepEqual(usageResets(after, after, 1_200), [], "a later poll of the fresh window is quiet");
});

test("restart snapshots retain reset metadata without copying private material", () => {
  const providers = [{ ...codex(100, 5000), name: "private account", token: "secret", path: "private", messages: ["private"] }, claude(6000)];
  const saved = JSON.parse(JSON.stringify(usageSnapshot(providers)));
  assert.equal(saved[0].name, "Codex");
  assert.equal(saved[0].windows[0].resets_at, 5000);
  assert.ok(!JSON.stringify(saved).includes("private"));
  assert.ok(!JSON.stringify(saved).includes("secret"));
  assert.equal(saved[1].block.tokens, undefined);
  assert.deepEqual(usageSnapshot(null), []);
  assert.deepEqual(usageResets(saved, [codex(0, 0), { id: "claude", block: null }], 6000).map((e) => e.kind), ["plan", "block"]);
});

test("a discharging window and a block that is still running stay quiet", () => {
  const before = [codex(0, 5_000), claude(5_000)];
  assert.deepEqual(usageResets(before, before, 1_000), []);
  assert.deepEqual(usageResets([codex(40, 5_000)], [codex(40, 5_000)], 1_000), []);
});
