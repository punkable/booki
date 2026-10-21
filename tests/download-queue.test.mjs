import test from "node:test";
import assert from "node:assert/strict";
import { createDownloadQueue } from "../src/dock/download-queue.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const runs = [], cancels = [], completed = [];
  const queue = createDownloadQueue({ run: (job) => new Promise((resolve, reject) => runs.push({ job, resolve, reject })), cancel: async (id) => { cancels.push(id); return true; }, completed: (job) => completed.push(job.id) });
  return { queue, runs, cancels, completed };
}
test("queue serializes native jobs and rejects late progress from another job", async () => {
  const { queue, runs, completed } = fixture();
  const [a, b] = queue.enqueue([{ url: "a", format: "video" }, { url: "b", format: "audio" }]);
  assert.equal(runs.length, 1);
  queue.progress({ id: b.id, state: "progress", percent: 70 });
  assert.equal(a.percent, 0);
  queue.progress({ id: a.id, state: "progress", percent: 35 });
  assert.equal(a.percent, 35);
  runs[0].resolve("a.mp4"); await tick();
  assert.equal(runs.length, 2);
  queue.progress({ id: a.id, state: "progress", percent: 95 });
  assert.equal(b.percent, 0);
  runs[1].resolve("b.mp3"); await tick();
  assert.deepEqual(completed, [a.id, b.id]);
  assert.equal(queue.active, null);
});
test("cancelling active work waits for the native process; queued cancellation starts no tool", async () => {
  const { queue, runs, cancels } = fixture();
  const [a, b, c] = queue.enqueue([{ url: "a" }, { url: "b" }, { url: "c" }]);
  await queue.cancel(b.id); assert.equal(b.state, "cancelled");
  assert.deepEqual(cancels, []);
  await queue.cancel(a.id); assert.deepEqual(cancels, [a.id]);
  assert.equal(runs.length, 1);
  runs[0].reject(new Error("download cancelled")); await tick();
  assert.equal(a.state, "cancelled"); assert.equal(runs[1].job.id, c.id);
  runs[1].resolve("c"); await tick();
});
test("failed work is retained, retry gets a new identity, and clear keeps pending work", async () => {
  const { queue, runs } = fixture();
  const [a] = queue.enqueue([{ url: "a", directory: "target", format: "audio" }]);
  runs[0].reject(new Error("offline")); await tick();
  assert.equal(a.state, "error"); assert.equal(a.error, "offline");
  const [retry] = queue.retry(a.id);
  assert.notEqual(retry.id, a.id); assert.equal(retry.directory, "target");
  queue.clear(); assert.deepEqual(queue.jobs.map((job) => job.id), [retry.id]);
  runs[1].resolve("ok"); await tick();
});
test("queue capacity is atomic and never evicts pending jobs", () => {
  const { queue } = fixture();
  queue.enqueue(Array.from({ length: 49 }, (_, i) => ({ url: String(i) })));
  assert.throws(() => queue.enqueue([{ url: "a" }, { url: "b" }]));
  assert.equal(queue.jobs.length, 49);
});
