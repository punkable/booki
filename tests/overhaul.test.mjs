import test from "node:test";
import assert from "node:assert/strict";
import { serveDist, launchBrowser, openPage, makeConfig } from "./harness.mjs";
let srv, port, browser;
test.before(async () => { ({ srv, port } = await serveDist()); browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); srv?.close(); });
const pin = (widget, style = {}) => ({ id: `w-${widget}`, kind: "widget", widget, style });

test("dashboard applies scenarios without replacing pins and stays inside a small window", async () => {
  const cfg = makeConfig({ pinned: [pin("clock")] });
  const { page, errors } = await openPage(browser, port, "settings.html", { cfg, viewport: { width: 520, height: 650 } });
  const navigation = await page.locator(".s-navitem").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()));
  assert.ok(navigation.every((rect) => rect.y >= 0 && rect.bottom <= 650), "navigation stays on screen");
  await page.getByRole("button", { name: /^Smart Moves/ }).click();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.equal(saved.autoHideMode, "smart"); assert.deepEqual(saved.pinned, cfg.pinned);
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  assert.equal(await page.locator(".widget-store-card").count(), 15);
  assert.equal(await page.locator(".widget-store-preview .w-card").count(), 15);
  assert.deepEqual(errors, []); await page.close();
});

test("adding apps displays local usage in order and reaches installed apps beyond the first page", async () => {
  const { page, errors } = await openPage(browser, port, "settings.html");
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === "frequent_apps") return Promise.resolve([{ name: "Zed", path: "C:/zed.exe", runs: 50 }, { name: "Atom", path: "C:/atom.exe", runs: 3 }]);
      if (cmd === "list_installed_apps") return Promise.resolve([{ name: "Apps", items: Array.from({ length: 90 }, (_, i) => ({ name: `App ${String(i).padStart(3, "0")}`, path: `C:/app${i}.lnk` })) }]);
      return old(cmd, args);
    };
  });
  await page.getByRole("button", { name: "Apps & folders", exact: true }).click();
  await page.locator(".app-library-card").first().waitFor();
  assert.deepEqual((await page.locator(".app-library-card > span:nth-child(2)").allTextContents()).slice(0, 2), ["Zed", "Atom"]);
  await page.getByRole("button", { name: "Add app: Zed", exact: true }).click();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config")); assert.equal(saved.pinned[0].name, "Zed");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.equal(await page.locator(".app-library-card").filter({ hasText: "App 089" }).count(), 1);
  assert.deepEqual(errors, []); await page.close();
});

test("local timer and task panel persist and Escape closes the panel", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [pin("focus"), pin("calendar")] }), viewport: { width: 1200, height: 600 } });
  await page.locator('#dock > [data-widget="focus"]').click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForTimeout(250);
  let saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config")); assert.ok(saved.pinned[0].style.endsAt > Date.now());
  await page.keyboard.press("Escape"); assert.equal(await page.locator(".productivity-panel").count(), 0);
  await page.locator('#dock > [data-widget="focus"]').click();
  await page.getByRole("textbox", { name: "Add task" }).fill('<img src=x onerror=alert(1)>');
  await page.getByRole("button", { name: "Add task" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".focus-task img").count(), 0);
  await page.locator('.focus-task input[type="checkbox"]').check(); await page.waitForTimeout(250);
  saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config")); assert.equal(saved.pinned[0].style.tasks[0].done, true);
  await page.keyboard.press("Escape");
  await page.locator('#dock > [data-widget="calendar"]').click(); assert.ok(await page.locator(".focus-calendar .today").count());
  assert.deepEqual(errors, []); await page.close();
});

test("weather stays offline until a city is chosen and requests are cached", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [pin("weather")] }), viewport: { width: 1200, height: 600 } });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke; window.__weatherRequests = 0;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === "weather_search") return Promise.resolve([{ name: "Santiago", country: "Chile", latitude: -33.45, longitude: -70.66 }]);
      if (cmd === "weather_current") { window.__weatherRequests++; return Promise.resolve({ temperature_2m: 22 }); }
      return old(cmd, args);
    };
  });
  await page.waitForTimeout(1500); assert.equal(await page.evaluate(() => window.__weatherRequests), 0);
  await page.locator('#dock > [data-widget="weather"]').click();
  await page.getByRole("textbox", { name: "City", exact: true }).fill("Santiago");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Santiago, Chile", exact: true }).click();
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(() => window.__weatherRequests), 1);
  assert.match(await page.locator('#dock > [data-widget="weather"]').innerText(), /22°/);
  assert.deepEqual(errors, []); await page.close();
});

test("scroll overflow keeps chosen icon size and new widgets work vertically", async () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `a-${i}`, kind: "app", path: `C:/${i}.exe`, name: `App ${i}` }));
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: items, overflowMode: "scroll", iconSize: 48 }), viewport: { width: 400, height: 500 } });
  assert.equal(await page.locator("body.dock-overflow").count(), 1);
  assert.equal(await page.locator("#dock > .tile").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--size")), "48px");
  assert.deepEqual(errors, []); await page.close();
  const vertical = await openPage(browser, port, "index.html", { cfg: makeConfig({ edge: "left", pinned: [pin("focus"), pin("clock"), pin("calendar"), pin("weather")] }), viewport: { width: 500, height: 900 } });
  const widths = await vertical.page.locator("#dock > .tile.widget").evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().width));
  assert.ok(widths.every((width) => Math.abs(width - widths[0]) < 1)); assert.deepEqual(vertical.errors, []); await vertical.page.close();
});


test("settings preserve edits during a delayed save and an external dock update", async () => {
  const { page, errors } = await openPage(browser, port, "settings.html", { viewport: { width: 960, height: 760 } });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__saving = false;
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd === "save_config") { window.__saving = true; await new Promise((resolve) => setTimeout(resolve, 700)); }
      return old(cmd, args);
    };
  });
  await page.getByRole("button", { name: /^Smart Moves/ }).click();
  await page.waitForFunction(() => window.__saving);
  await page.getByRole("button", { name: /^Reveal at the edge/ }).click();
  await page.evaluate(async () => {
    await window.__TAURI__.core.invoke("save_config", { patch: { pinned: [{ id: "external", kind: "app", name: "External", path: "C:/external.exe" }] } });
    for (const cb of window.__listeners["booki://config-changed"] || []) cb({ payload: null });
  });
  await page.waitForTimeout(1800);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.equal(saved.autoHideMode, "edge"); assert.equal(saved.notchTrigger, "hover");
  assert.equal(saved.pinned[0].name, "External");
  assert.equal(await page.getByRole("button", { name: /^Reveal at the edge/ }).getAttribute("aria-pressed"), "true");
  assert.deepEqual(errors, []); await page.close();
});

test("unavailable media widgets can be recovered from the dock menu", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [pin("clock"), pin("media", { hideWhenUnavailable: true })] }) });
  assert.equal(await page.locator('[data-widget="media"].conditionally-hidden').count(), 1);
  await page.locator("#dock").dispatchEvent("contextmenu", { clientX: 800, clientY: 300 });
  await page.getByRole("menuitem", { name: "Media", exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('[data-widget="media"].conditionally-hidden').count(), 0);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.equal(saved.pinned[1].style.hideWhenUnavailable, false);
  assert.deepEqual(errors, []); await page.close();
});

test("built-in icon previews use SVG data instead of requesting lib URLs", async () => {
  const { page, errors } = await openPage(browser, port, "settings.html", { cfg: makeConfig({ pinned: [{ id: "terminal", kind: "app", name: "Terminal", path: "C:/terminal.exe", icon: "lib:terminal:badge" }] }) });
  const src = await page.locator(".live-preview-app img").getAttribute("src");
  assert.match(src, /^data:image\/svg\+xml/);
  assert.deepEqual(errors, []); await page.close();
});

test("the Home dock preview shows example values instead of empty placeholders", async () => {
  const cfg = makeConfig({ pinned: [pin("clock"), pin("tasks"), pin("weather")] });
  const { page, errors } = await openPage(browser, port, "settings.html", { cfg, viewport: { width: 1180, height: 760 } });
  const values = await page.locator(".preview-static .w-value").allTextContents();
  assert.equal(values.length, 3);
  assert.ok(values.every((value) => value && value !== "…"), `preview values: ${values.join(", ")}`);
  assert.deepEqual(errors, []); await page.close();
});
