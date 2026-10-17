import test from "node:test";
import assert from "node:assert/strict";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";
assertBuilt();
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const pin = (widget) => ({ id: widget, kind: "widget", widget, name: "", path: "" });
const emit = (page, event, payload) => page.evaluate(([event, payload]) => { for (const cb of window.__listeners[event] || []) cb({ payload }); }, [event, payload]);

test("native mixer targets session identifiers and commits volume and mute", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("volume")] }),
    initScript: `window.__audioWrites = []; const invoke = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd, args) => {
        if (cmd === "app_volumes") return Promise.resolve([{id:"session-42-A",name:"Browser",percent:65,muted:false}]);
        if (cmd === "app_volume_set") { window.__audioWrites.push(args); return Promise.resolve(); }
        return invoke(cmd,args);
      };`,
  });
  await page.locator('.tile[data-id="volume"]').click();
  await waitForAsyncCondition(page, () => !!document.querySelector('input[aria-label="Browser"]'));
  await page.getByRole("slider", { name: "Browser", exact: true }).evaluate((el) => { el.value = "27"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
  await waitForAsyncCondition(page, () => window.__audioWrites.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__audioWrites[0]), { id: "session-42-A", percent: 27, muted: false });
  await page.getByRole("checkbox", { name: "Browser · Muted" }).check();
  await waitForAsyncCondition(page, () => window.__audioWrites.length === 2);
  assert.equal(await page.evaluate(() => window.__audioWrites.at(-1).muted), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".system-widget-panel").count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test("an unavailable device provider installs only after its inline button is pressed", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("devices")] }),
    initScript: `window.__pluginInstalls = []; let installed = false; const invoke = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd,args) => {
        if (cmd === "plugin_status") return Promise.resolve({installed,version:installed?"4.1.0":null});
        if (cmd === "plugin_install") { installed=true; window.__pluginInstalls.push(args.id); return Promise.resolve("4.1.0"); }
        return invoke(cmd,args);
      };`,
  });
  await page.locator('.tile[data-id="devices"]').click();
  await page.getByRole("button", { name: "Install plugin", exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__pluginInstalls), []);
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  await waitForAsyncCondition(page, () => document.querySelector(".system-widget-panel")?.textContent.includes("via HeadsetControl"));
  assert.deepEqual(await page.evaluate(() => window.__pluginInstalls), ["headsetcontrol"]);
  assert.deepEqual(errors, []); await page.close();
});

test("a browser link from the Windows drop bridge opens a deliberate download action", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("media")] }),
    initScript: `window.__downloadRequests=[]; const invoke=window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke=(cmd,args)=> {
        if(cmd==="plugin_status") return Promise.resolve({installed:true,version:"test"});
        if(cmd==="plugin_download") {window.__downloadRequests.push(args);return Promise.resolve();}
        return invoke(cmd,args);
      };`,
  });
  await emit(page, "booki://link-drop", "https://example.com/video");
  await page.getByRole("button", { name: "Download video…" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Video link (HTTP or HTTPS)" }).inputValue(), "https://example.com/video");
  assert.deepEqual(await page.evaluate(() => window.__downloadRequests), [], "a drop must never start a download or execute a tool");
  await page.keyboard.press("Escape");
  await emit(page, "booki://link-drop", "file:///C:/private.txt");
  assert.equal(await page.locator(".system-widget-panel").count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test("late native responses cannot resurrect a closed widget panel", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("volume")] }),
    initScript: `const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==="app_volumes"?new Promise((resolve)=>{window.__finishSessions=resolve;}):invoke(cmd,args);`,
  });
  await page.locator('.tile[data-id="volume"]').click();
  await waitForAsyncCondition(page, () => typeof window.__finishSessions === "function");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__finishSessions([{ id: "late", name: "Late", percent: 10, muted: false }]));
  assert.equal(await page.locator(".system-widget-panel").count(), 0);
  assert.deepEqual(errors, []); await page.close();
});
