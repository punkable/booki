import test from "node:test";
import assert from "node:assert/strict";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig } from "./harness.mjs";
assertBuilt();
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

const mock = `{
  const at = Math.floor(Date.now() / 1000) - 60;
  localStorage.setItem("booki.usageResets", JSON.stringify({ at: Date.now() - 60000, providers: [{ id: "codex", windows: [{ label: "week", percent: 100, resets_at: at }] }], seen: [] }));
  window.__usageNotices = []; window.__usageReads = 0;
  const old = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = (cmd, args) => {
    if (cmd === "ai_usage") { window.__usageReads++; return Promise.resolve([{ id: "codex", name: "Codex", windows: [{ label: "week", percent: 0, resets_at: 0 }] }]); }
    if (cmd === "notch_notice") { window.__usageNotices.push(args.title); return Promise.resolve(true); }
    return old(cmd, args);
  };
}`;
test("a remembered reset notifies without an AI tile, and a restart does not repeat it", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [], autoHideMode: "always" }), initScript: mock });
  assert.deepEqual(await page.evaluate(() => window.__usageNotices), ["Codex: scheduled reset time reached"]);
  assert.equal(await page.evaluate(() => window.__usageReads), 1, "one coalesced native read");
  const saved = await page.evaluate(() => localStorage.getItem("booki.usageResets"));
  assert.equal(JSON.parse(saved).seen.length, 1);
  assert.deepEqual(errors, []);
  await page.close();
  const restarted = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [] }), initScript: `${mock}\nlocalStorage.setItem("booki.usageResets", ${JSON.stringify(saved)});` });
  assert.deepEqual(await restarted.page.evaluate(() => window.__usageNotices), []);
  assert.deepEqual(restarted.errors, []);
  await restarted.page.close();
});
test("turning agent notices off also disables the background usage reader", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [], notchAgents: false }), initScript: mock });
  assert.equal(await page.evaluate(() => window.__usageReads), 0);
  assert.deepEqual(await page.evaluate(() => window.__usageNotices), []);
  assert.deepEqual(errors, []);
  await page.close();
});
