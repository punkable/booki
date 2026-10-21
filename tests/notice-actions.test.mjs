import test from "node:test";
import assert from "node:assert/strict";
import { createNoticeActions } from "../src/dock/notice-actions.js";

test("notch notices expose only labels and a token; callbacks expire and reject foreign actions", async () => {
  let time = 100, calls = 0, serial = 0;
  const registry = createNoticeActions({ now: () => time, token: () => `notice-${++serial}` });
  const notice = registry.register([{ label: "Open file", run: () => { calls++; } }]);
  assert.deepEqual(notice, { id: "notice-1", labels: ["Open file"] });
  assert.equal(await registry.dispatch(null), false);
  assert.equal(await registry.dispatch({ id: "other", index: 0 }), false);
  assert.equal(await registry.dispatch({ id: notice.id, index: -1 }), false);
  assert.equal(await registry.dispatch({ id: notice.id, index: "0" }), false);
  assert.equal(await registry.dispatch({ id: notice.id, index: 0 }), true);
  assert.equal(calls, 1);
  time += 12001;
  assert.equal(await registry.dispatch({ id: notice.id, index: 0 }), false);
  assert.equal(calls, 1);
});

test("revoked and superseded callbacks cannot be invoked", async () => {
  let serial = 0;
  const registry = createNoticeActions({ token: () => `notice-${++serial}` });
  const first = registry.register([{ label: "a", run: () => { throw new Error("stale action"); } }]);
  for (let i = 0; i < 5; i++) registry.register([{ label: "b", run: () => {} }]);
  assert.equal(await registry.dispatch({ id: first.id, index: 0 }), false);
  registry.revoke("notice-6");
  assert.equal(await registry.dispatch({ id: "notice-6", index: 0 }), false);
});
