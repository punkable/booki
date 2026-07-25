/* Cost of doing nothing, and cost of hovering.

   These assert ceilings rather than exact numbers — the point is to catch a
   regression that reintroduces per-frame work, not to freeze today's figures.

   The magnify one exists because reporting hit rects was wired into the
   magnify rAF: every frame did a querySelectorAll, a forced layout read of
   every tile, and an IPC round trip. On a 144Hz screen with a full bar that is
   ~2200 rect reads and 144 IPC calls per second, for as long as the cursor
   rests on the dock. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBuilt,
  serveDist,
  launchBrowser,
  openPage,
  makeConfig,
  everyKindPinned,
} from "./harness.mjs";

assertBuilt();

const { srv, port } = await serveDist();
const browser = await launchBrowser();

test.after(async () => {
  await browser.close();
  srv.close();
});

/** Count backend calls the page makes over a window of time. */
async function countInvokes(page, ms) {
  await page.evaluate(() => {
    window.__invokeLog = [];
    const core = window.__TAURI__.core;
    if (!core.__wrapped) {
      const inner = core.invoke;
      core.invoke = (cmd, args) => {
        window.__invokeLog.push(cmd);
        return inner(cmd, args);
      };
      core.__wrapped = true;
    }
    window.__invokeLog.length = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const counts = {};
    for (const c of window.__invokeLog) counts[c] = (counts[c] || 0) + 1;
    return counts;
  });
}

test("an idle dock stays quiet", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: everyKindPinned() }),
  });
  // Settle first: boot legitimately fetches icons, windows, stats.
  await page.waitForTimeout(1500);
  const counts = await countInvokes(page, 5000);
  await page.close();

  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const detail = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}=${n}`)
    .join(" ");

  // Five seconds of a dock nobody is touching, with every widget pinned. The
  // live widgets legitimately poll (stats ~2.4s, media ~3s, volume and
  // clipboard ~4s, running apps ~5s); anything much past that is a leak.
  assert.ok(total <= 30, `idle dock made ${total} backend calls in 5s: ${detail}`);
});

test("hovering the bar does not emit hit rects per frame", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: everyKindPinned(), magnify: true, magnification: true }),
  });
  await page.waitForTimeout(1200);

  const box = await page.evaluate(() => {
    const r = document.getElementById("dock").getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2, w: r.width - 40 };
  });

  await page.evaluate(() => {
    window.__invokeLog = [];
    const core = window.__TAURI__.core;
    if (!core.__wrapped) {
      const inner = core.invoke;
      core.invoke = (cmd, args) => {
        window.__invokeLog.push(cmd);
        return inner(cmd, args);
      };
      core.__wrapped = true;
    }
    window.__invokeLog.length = 0;
  });

  // A slow sweep across the bar: 60 discrete moves, each its own frame.
  const STEPS = 60;
  for (let i = 0; i <= STEPS; i++) {
    await page.mouse.move(box.x + (box.w * i) / STEPS, box.y);
  }
  await page.waitForTimeout(400);

  const hits = await page.evaluate(
    () => window.__invokeLog.filter((c) => c === "set_hit_rects").length
  );
  await page.close();

  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
  // One region per gesture, not one per frame. The allowance covers the enter
  // and the settle afterwards; it must not scale with STEPS.
  assert.ok(
    hits <= 6,
    `sweeping the bar emitted ${hits} set_hit_rects calls over ${STEPS} moves — ` +
      `it should be a small constant, not per-frame`
  );
});
