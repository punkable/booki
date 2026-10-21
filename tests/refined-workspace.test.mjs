import test from "node:test";
import assert from "node:assert/strict";
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";
import { DOCK_PRESETS } from "../src/dock/presets.js";
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const widget = (type) => ({ id: type, kind: "widget", widget: type });

test("appearance presets leave content, profiles and monitor choices alone", () => {
  for (const { patch } of DOCK_PRESETS) {
    for (const key of ["pinned", "monitor", "monitorName", "profileRules", "lastProfile", "autoHideMode"]) assert.equal(Object.hasOwn(patch, key), false);
  }
});

test("the widget panel contains live cards and opens the existing mixer", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [widget("battery"), widget("volume")] }) });
  await page.locator("#dock").dispatchEvent("contextmenu", { clientX: 400, clientY: 400 });
  await page.getByRole("menuitem", { name: "Widget panel", exact: true }).click();
  const hub = page.getByRole("dialog", { name: "Widget panel", exact: true });
  assert.equal(await hub.locator(".tile.widget").count(), 2);
  await waitForAsyncCondition(page, () => document.querySelector('.widget-hub [data-widget="battery"] .w-ring-num')?.textContent !== "—");
  await hub.locator('[data-widget="volume"]').click();
  await page.getByRole("slider", { name: "Volume", exact: true }).waitFor();
  assert.equal(await page.locator(".widget-hub:not(.is-closing)").count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test("Collector queues multiple links, waits for native cancellation and exposes file actions", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget("collector")] }),
    initScript: `window.__jobs=[]; window.__cancel=[]; const old=window.__TAURI__.core.invoke; window.__TAURI__.core.invoke=(cmd,args)=>{
      if(cmd==='plugin_download') return new Promise((resolve,reject)=>window.__jobs.push({args,resolve,reject}));
      if(cmd==='plugin_cancel_download'){window.__cancel.push(args.id);return Promise.resolve(true);}
      return old(cmd,args);
    };`,
  });
  await page.locator('#dock > [data-id="collector"]').click();
  await page.getByRole("textbox", { name: "Paste a link" }).fill("https://example.com/a.pdf\nhttps://example.com/b.pdf");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await waitForAsyncCondition(page, () => window.__jobs.length === 1);
  assert.equal(await page.locator(".collector-job").count(), 2);
  await page.locator(".collector-job").first().getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__jobs.length), 1);
  await page.evaluate(() => window.__jobs[0].reject("download cancelled"));
  await waitForAsyncCondition(page, () => window.__jobs.length === 2);
  await page.evaluate(() => window.__jobs[1].resolve("C:/Downloads/b.pdf"));
  await page.locator('.collector-job[data-state="done"]').waitFor();
  assert.equal(await page.locator('.collector-job[data-state="cancelled"]').count(), 1);
  assert.equal(await page.locator('.collector-job[data-state="done"]').getByRole("button", { name: "Open file", exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.__cancel[0] === window.__jobs[0].args.jobId), true);
  assert.deepEqual(errors, []); await page.close();
});

test("Collector default format is saved from its gear panel and used for automatic media jobs", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget("collector")] }),
    initScript: `window.__jobs=[]; const old=window.__TAURI__.core.invoke; window.__TAURI__.core.invoke=(cmd,args)=>cmd==='plugin_download' ? (window.__jobs.push(args),Promise.resolve('C:/Downloads/audio.m4a')) : old(cmd,args);`,
  });
  await page.locator('#dock > [data-id="collector"]').click();
  await page.getByRole("button", { name: "Collector settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Format for video pages", exact: true }).selectOption("audio");
  await page.getByRole("combobox", { name: "Video quality", exact: true }).selectOption("1080");
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).collectorFormat === "audio");
  await page.getByRole("textbox", { name: "Paste a link" }).fill("https://example.com/watch?v=123");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await waitForAsyncCondition(page, () => window.__jobs.length === 1);
  assert.equal(await page.evaluate(() => window.__jobs[0].format), "audio");
  assert.equal(await page.evaluate(() => window.__jobs[0].quality), "1080");
  assert.deepEqual(errors, []); await page.close();
});

test("finished Collector notices on the notch dispatch only their registered file action", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget("collector")] }),
    initScript: `window.__notices=[];window.__opened=[];const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>{
      if(cmd==='plugin_download')return Promise.resolve('C:/Downloads/report.pdf');
      if(cmd==='notch_notice'){window.__notices.push(args);return Promise.resolve(true);}
      if(cmd==='open_location'){window.__opened.push(args);return Promise.resolve();}
      return old(cmd,args);
    };`,
  });
  await page.locator('#dock > [data-id="collector"]').click();
  await page.getByRole("textbox", { name: "Paste a link" }).fill("https://example.com/report.pdf");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await waitForAsyncCondition(page, () => window.__notices.some((notice) => notice.actionId));
  const notice = await page.evaluate(() => window.__notices.find((notice) => notice.actionId));
  assert.equal(notice.actionLabels.length, 3);
  assert.equal(JSON.stringify(notice).includes("C:/Downloads"), false);
  await page.evaluate(async (id) => { for (const cb of window.__listeners['booki://notice-action'] || []) await cb({ payload: { id, index: 0 } }); }, notice.actionId);
  await waitForAsyncCondition(page, () => window.__opened.length === 1);
  assert.deepEqual(errors, []); await page.close();
});
