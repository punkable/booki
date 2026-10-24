import test from "node:test";
import assert from "node:assert/strict";
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";

let srv, port, browser;
test.before(async () => { ({ srv, port } = await serveDist()); browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); srv?.close(); });

const focus = (style = {}) => ({ id: "w-focus", kind: "widget", widget: "focus", style });

/* A fake Windows Do not disturb: `dnd_state` reads it, `set_dnd` flips it and
   logs the call. */
const mockDnd = (initial) => `
  window.__dnd = ${initial};
  window.__dndCalls = [];
  const realInvoke = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (cmd, args = {}) => {
    if (cmd === "dnd_state") return Promise.resolve(window.__dnd);
    if (cmd === "set_dnd") { window.__dndCalls.push(args.on); const changed = window.__dnd !== args.on; window.__dnd = args.on; return Promise.resolve(changed); }
    if (cmd === "dnd_restore") return Promise.resolve(false);
    return realInvoke(cmd, args);
  };
`;
const calls = (page) => page.evaluate(() => window.__dndCalls.slice());

test("a focus block turns Do not disturb on and gives it back when it ends", async () => {
  const cfg = makeConfig({ pinned: [focus({ minutes: 1, dnd: true, endsAt: Date.now() + 2500 })] });
  const { page, errors } = await openPage(browser, port, "index.html", { cfg, initScript: mockDnd(false) });
  await waitForAsyncCondition(page, () => window.__dndCalls.length >= 1);
  assert.deepEqual(await calls(page), [true]);
  assert.equal(await page.locator('[data-widget="focus"] .focus-dnd-badge').count(), 1, "the Focus card shows the moon");
  await waitForAsyncCondition(page, () => window.__dndCalls.length >= 2, undefined, { timeout: 6000 });
  assert.deepEqual(await calls(page), [true, false]);
  assert.equal(await page.evaluate(() => window.__dnd), false);
  assert.deepEqual(errors, []); await page.close();
});

test("starting and pausing from the panel switches Do not disturb on and off", async () => {
  const cfg = makeConfig({ pinned: [focus({ minutes: 25 })] });
  const { page, errors } = await openPage(browser, port, "index.html", { cfg, viewport: { width: 1200, height: 600 }, initScript: mockDnd(false) });
  await page.locator('#dock > [data-widget="focus"]').click();
  assert.equal(await page.locator(".focus-option-dnd").getAttribute("aria-checked"), "false", "off until chosen");
  await page.locator(".focus-option-dnd").click();
  await page.locator(".focus-primary").click();
  await waitForAsyncCondition(page, () => window.__dndCalls.length >= 1);
  await page.locator(".focus-primary").click();
  await waitForAsyncCondition(page, () => window.__dndCalls.length >= 2);
  assert.deepEqual(await calls(page), [true, false]);
  assert.deepEqual(errors, []); await page.close();
});

test("a Do not disturb the user already has is left alone", async () => {
  const cfg = makeConfig({ pinned: [focus({ minutes: 1, dnd: true, endsAt: Date.now() + 1500 })] });
  const { page, errors } = await openPage(browser, port, "index.html", { cfg, initScript: mockDnd(true) });
  await page.waitForTimeout(2500);
  assert.deepEqual(await calls(page), []);
  assert.equal(await page.evaluate(() => window.__dnd), true);
  assert.deepEqual(errors, []); await page.close();
});

test("with the option off, Do not disturb is never touched", async () => {
  const cfg = makeConfig({ pinned: [focus({ minutes: 1, dnd: false, endsAt: Date.now() + 1500 })] });
  const { page, errors } = await openPage(browser, port, "index.html", { cfg, initScript: mockDnd(false) });
  await page.waitForTimeout(2500);
  assert.deepEqual(await calls(page), []);
  assert.deepEqual(errors, []); await page.close();
});
