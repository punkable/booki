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
  await page.locator('.tile[data-id="volume"]').click({ button: "right" });
  await page.locator("#ctx-menu").getByText("Controls", { exact: true }).click();
  await waitForAsyncCondition(page, () => !!document.querySelector('input[aria-label="Browser"]'));
  await page.getByRole("slider", { name: "Browser", exact: true }).evaluate((el) => { el.value = "27"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
  await waitForAsyncCondition(page, () => window.__audioWrites.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__audioWrites[0]), { id: "session-42-A", percent: 27, muted: false });
  await page.getByRole("button", { name: "Browser · Muted" }).click();
  await waitForAsyncCondition(page, () => window.__audioWrites.length === 2);
  assert.equal(await page.evaluate(() => window.__audioWrites.at(-1).muted), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".system-widget-panel:not(.is-closing)").count(), 0);
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
  await page.locator(".device-offer > summary").click();
  await page.getByRole("button", { name: "Turn on", exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__pluginInstalls), []);
  assert.equal(await page.getByRole("button", { name: "Turn on", exact: true }).isDisabled(), true, "nothing installs before the terms are accepted");
  await page.getByRole("checkbox", { name: /I accept the plugin terms/ }).check();
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await waitForAsyncCondition(page, () => !document.querySelector(".system-widget-panel .device-offer"));
  assert.deepEqual(await page.evaluate(() => window.__pluginInstalls), ["headsetcontrol"]);
  assert.equal((await page.evaluate(() => window.__TAURI__.core.invoke("get_config"))).pluginTerms, 1);
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
  await page.getByRole("combobox", { name: "What to save", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Paste a link" }).inputValue(), "https://example.com/video");
  assert.deepEqual(await page.evaluate(() => window.__downloadRequests), [], "a drop must never start a download or execute a tool");
  await page.getByRole("combobox", { name: "What to save", exact: true }).selectOption("audio");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await waitForAsyncCondition(page, () => window.__downloadRequests.length === 1);
  assert.equal(await page.evaluate(() => window.__downloadRequests[0].format), "audio");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await emit(page, "booki://link-drop", "file:///C:/private.txt");
  assert.equal(await page.locator(".system-widget-panel:not(.is-closing)").count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test("the Collector picks the tool from the link: files and galleries start, videos ask", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("collector")] }),
    initScript: `window.__downloadRequests=[]; const invoke=window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke=(cmd,args)=> {
        if(cmd==="plugin_status") return Promise.resolve({installed:true,version:"test"});
        if(cmd==="plugin_download") {window.__downloadRequests.push(args);return Promise.resolve("C:/Users/me/Downloads/x");}
        return invoke(cmd,args);
      };`,
  });
  await emit(page, "booki://link-drop", "https://example.com/files/report.pdf");
  await waitForAsyncCondition(page, () => window.__downloadRequests.length === 1);
  assert.equal(await page.evaluate(() => window.__downloadRequests[0].format), "file");
  await page.keyboard.press("Escape");
  await emit(page, "booki://link-drop", "https://www.pinterest.com/pin/123/");
  await waitForAsyncCondition(page, () => window.__downloadRequests.length === 2);
  assert.equal(await page.evaluate(() => window.__downloadRequests[1].format), "gallery");
  await page.keyboard.press("Escape");
  await emit(page, "booki://link-drop", "https://www.youtube.com/watch?v=abc");
  await page.getByRole("combobox", { name: "What to save", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__downloadRequests.length), 2);
  assert.deepEqual(errors, []); await page.close();
});

test("a device crossing 10% is announced once beside the dock", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("devices")] }),
    initScript: `const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==="device_batteries"?Promise.resolve([{name:"MX Master 3S",level:8,source:"logitech",kind:"mouse",charging:false}]):invoke(cmd,args);`,
  });
  const toast = page.locator(".undo-toast .notice-copy");
  await toast.waitFor();
  assert.match(await toast.innerText(), /Low battery[\s\S]*MX Master 3S · 8%/);
  assert.deepEqual(errors, []); await page.close();
});

test("Updates counts apps with an update and updates them all from its panel", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("updates")] }),
    initScript: `window.__updates=[];const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==="app_updates"?Promise.resolve([{name:"Firefox",id:"Mozilla.Firefox",current:"130",available:"131"},{name:"7-Zip",id:"7zip.7zip",current:"23",available:"24"}]):cmd==="app_update"?(window.__updates.push(args),Promise.resolve()):invoke(cmd,args);`,
  });
  const card = page.locator('.tile[data-id="updates"]');
  await card.locator(".w-ring-num", { hasText: "2" }).waitFor();
  await card.click();
  await page.getByRole("button", { name: "Update all", exact: true }).click();
  // winget runs one install at a time: Update all goes row by row.
  await waitForAsyncCondition(page, () => window.__updates.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__updates.map((u) => u.id)), ["Mozilla.Firefox", "7zip.7zip"]);
  assert.deepEqual(errors, []); await page.close();
});

test("a click on the volume card opens its mixer without changing mute", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("volume")] }),
    initScript: `window.__vol=[];const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==="volume_info"?Promise.resolve([40,false]):cmd==="volume_set_state"?(window.__vol.push(args),Promise.resolve(true)):invoke(cmd,args);`,
  });
  await page.locator('.tile[data-id="volume"]').click();
  await page.locator(".system-widget-panel.is-open").waitFor();
  assert.deepEqual(await page.evaluate(() => window.__vol), []);
  assert.equal(await page.locator(".system-widget-panel:not(.is-closing)").count(), 1);
  assert.deepEqual(errors, []); await page.close();
});

test("late native responses cannot resurrect a closed widget panel", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("volume")] }),
    initScript: `const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==="app_volumes"?new Promise((resolve)=>{window.__finishSessions=resolve;}):invoke(cmd,args);`,
  });
  await page.locator('.tile[data-id="volume"]').click({ button: "right" });
  await page.locator("#ctx-menu").getByText("Controls", { exact: true }).click();
  await waitForAsyncCondition(page, () => typeof window.__finishSessions === "function");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__finishSessions([{ id: "late", name: "Late", percent: 10, muted: false }]));
  assert.equal(await page.locator(".system-widget-panel:not(.is-closing)").count(), 0);
  assert.deepEqual(errors, []); await page.close();
});


test("the master mixer preserves mute in one native edit", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("volume")] }),
    initScript: `window.__masterWrites=[];const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>{
      if(cmd==="volume_info")return Promise.resolve([40,true]);
      if(cmd==="volume_set_state"){window.__masterWrites.push(args);return Promise.resolve();}
      if(cmd==="volume_set"||cmd==="volume_mute")throw new Error("mixer must not transiently unmute");
      return invoke(cmd,args);
    };`,
  });
  await page.locator('.tile[data-id="volume"]').click({ button: "right" });
  await page.locator("#ctx-menu").getByText("Controls", { exact: true }).click();
  const slider = page.getByRole("slider", { name: "Volume", exact: true });
  await slider.waitFor();
  await slider.evaluate((el) => { el.value="55";el.dispatchEvent(new Event("change",{bubbles:true})); });
  await waitForAsyncCondition(page, () => window.__masterWrites.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__masterWrites[0]), {percent:55,muted:true});
  assert.deepEqual(errors, []); await page.close();
});


test("refreshing the mixer ignores an older in-flight session list", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("volume")] }),
    initScript: `window.__sessionReads=[];const invoke=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==="app_volumes"?new Promise((resolve)=>window.__sessionReads.push(resolve)):invoke(cmd,args);`,
  });
  await page.locator('.tile[data-id="volume"]').click({ button: "right" });
  await page.locator("#ctx-menu").getByText("Controls", { exact: true }).click();
  await waitForAsyncCondition(page, () => window.__sessionReads.length === 1);
  await page.getByRole("button", {name:"Refresh data",exact:true}).click();
  await waitForAsyncCondition(page, () => window.__sessionReads.length === 2);
  await page.evaluate(() => window.__sessionReads[1]([{id:"new",name:"New app",percent:50,muted:false}]));
  await page.getByRole("slider", {name:"New app",exact:true}).waitFor();
  await page.evaluate(() => window.__sessionReads[0]([{id:"old",name:"Old app",percent:20,muted:false}]));
  assert.equal(await page.getByRole("slider", {name:"Old app",exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();
});

test("a Cloud card from an older version leaves the dock quietly", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [pin("cloud"), pin("updates")] }) });
  await page.locator('.tile[data-id="updates"]').waitFor();
  assert.equal(await page.locator('.tile[data-widget="cloud"]').count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test("Collector ignores late and foreign progress after the native result", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [pin("collector")] }),
    initScript: `window.__jobs=[]; const old=window.__TAURI__.core.invoke; window.__TAURI__.core.invoke=(cmd,args)=>cmd==="plugin_download" ? new Promise((resolve,reject)=>window.__jobs.push({args,resolve,reject})) : old(cmd,args);`,
  });
  const card = page.locator('#dock > [data-id="collector"]');
  await card.click();
  await page.getByRole("textbox", { name: "Paste a link" }).fill("https://example.com/a.pdf");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await waitForAsyncCondition(page, () => window.__jobs.length === 1);
  const id = await page.evaluate(() => window.__jobs[0].args.jobId);
  await emit(page, "plugin-download", { id, state: "progress", percent: 40, title: "Example" });
  await emit(page, "plugin-download", { id: "foreign", state: "progress", percent: 80 });
  assert.equal(await card.getAttribute("data-state"), "progress");
  await page.evaluate(() => window.__jobs[0].resolve("C:/Examples/example.pdf"));
  await waitForAsyncCondition(page, () => document.querySelector('#dock > [data-id="collector"]').dataset.state === "done");
  await emit(page, "plugin-download", { id, state: "progress", percent: 10 });
  assert.equal(await card.getAttribute("data-state"), "done");
  assert.match(await card.getAttribute("aria-label"), /example\.pdf/);
  assert.equal(await page.locator(".collector-job").count(), 1);
  assert.equal(await page.locator(".collector-job").getByRole("button", { name: "Open file", exact: true }).count(), 1);
  assert.deepEqual(errors, []); await page.close();
});
