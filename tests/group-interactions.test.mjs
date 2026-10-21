import test from "node:test";
import assert from "node:assert/strict";
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const app = (n) => ({ id: `a${n}`, kind: "app", name: `App ${n}`, path: `C:/app${n}.exe`, args: [] });
const group = (n) => ({ id: "group", kind: "group", name: "Work", children: Array.from({ length: n }, (_, i) => app(i)) });
const event = (page, name, payload) => page.evaluate(async ([name, payload]) => {
  for (const cb of window.__listeners[name] || []) await cb({ payload });
}, [name, payload]);

test("desktop files land directly in a large open group; only the content scrolls", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ magnification: false, pinned: [group(48)] }),
    initScript: `{ const old = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd, args) => cmd === "is_dir" ? Promise.resolve(args.path.endsWith("/Folder")) : old(cmd, args); }`,
  });
  await page.locator('#dock > [data-id="group"]').click();
  await page.locator("#stack.open").waitFor();
  const grid = page.locator("#stack .stack-grid");
  assert.equal(await page.locator("#stack .stack-rm").count(), 0);
  const geometry = await grid.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return { height: el.clientHeight, content: el.scrollHeight, scroll: el.scrollTop, headTop: document.querySelector(".stack-head").getBoundingClientRect().top };
  });
  assert.ok(geometry.content > geometry.height && geometry.scroll > 0, JSON.stringify(geometry));
  const bounds = await grid.boundingBox();
  const position = await page.evaluate(({ x, y }) => ({ x: (x + 20) * devicePixelRatio, y: (y + 20) * devicePixelRatio }), bounds);
  await event(page, "tauri://drag-enter", { position });
  await event(page, "tauri://drag-over", { position });
  assert.equal(await page.locator("#stack.drop-target").count(), 1);
  await event(page, "tauri://drag-drop", { position, paths: ["C:/Desktop/New.pdf", "C:/Desktop/Folder"] });
  await page.locator("#stack.open").waitFor();
  const pins = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].children.length, 50);
  assert.equal(pins[0].children[49].kind, "folder");
  assert.equal(await page.locator("#stack .stack-item").count(), 50);
  assert.ok(await grid.evaluate((el) => el.scrollTop) > 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the header opens Pantone colours and editing a group retains live widget elements", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [group(6), { id: "battery", kind: "widget", widget: "battery" }] }),
  });
  await page.locator('#dock > [data-id="group"]').click();
  await page.locator("#stack.open").waitFor();
  await page.evaluate(() => { window.__batteryElement = document.querySelector('#dock > [data-id="battery"]'); });
  await page.locator("#stack .stack-head-icon").click();
  await page.getByRole("button", { name: "Mocha Mousse · 17-1230", exact: true }).click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned[0].style?.color === "#a47864");
  assert.equal(await page.evaluate(() => window.__batteryElement === document.querySelector('#dock > [data-id="battery"]')), true);
  assert.equal(await page.locator('#dock > [data-id="group"]').evaluate((el) => el.style.getPropertyValue("--group-color")), "#a47864");
  assert.equal(await page.locator("#stack.open.tinted").count(), 1);
  await page.locator("#stack .stack-head-icon").click();
  await page.locator("#ctx-menu .menu-glyphs button").nth(1).click();
  await waitForAsyncCondition(page, async () => !!(await window.__TAURI__.core.invoke("get_config")).pinned[0].style?.glyph);
  assert.equal(await page.evaluate(() => window.__batteryElement === document.querySelector('#dock > [data-id="battery"]')), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("an unavailable device stops displaying its old charge on the next reading", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [{ id: "keys", kind: "widget", widget: "devices", style: { device: "MX Keys Mini", deviceKind: "keyboard" } }] }),
    initScript: `window.__connected = true; const old = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (c, a) => c === "device_batteries" ? Promise.resolve(window.__connected ? [{ name: "MX Keys Mini", kind: "keyboard", level: 15, charging: true }] : []) : old(c, a);`,
  });
  await page.locator('[data-id="keys"] .w-ring-num', { hasText: "15" }).waitFor();
  await page.evaluate(() => { window.__connected = false; });
  await page.clock.install();
  await page.clock.fastForward(16000);
  await page.locator('[data-id="keys"] .w-ring-num', { hasText: "?" }).waitFor();
  assert.match(await page.locator('[data-id="keys"]').getAttribute("aria-label"), /Disconnected/);
  assert.equal(await page.locator('[data-id="keys"].charging').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a paused media card retires after one minute and becomes available again on playback", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", {
    cfg: makeConfig({ notchVisibility: "always" }),
    initScript: `window.__playing = true; const old = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (c, a) => c === "media_info" ? Promise.resolve({ title: "Video", artist: "Browser", playing: window.__playing }) : old(c, a);`,
  });
  await page.evaluate(() => { window.__playing = false; });
  await event(page, "booki://media-changed", null);
  await page.clock.install();
  await page.clock.fastForward(65000);
  await event(page, "booki://media-changed", null);
  await page.locator("#notch-pill").hover();
  await page.clock.fastForward(1000);
  assert.equal(await page.evaluate(() => document.body.classList.contains("card")), false);
  await page.evaluate(() => { window.__playing = true; });
  await event(page, "booki://media-changed", null);
  await page.mouse.move(0, 0);
  await page.locator("#notch-pill").hover();
  await page.clock.fastForward(1000);
  assert.equal(await page.evaluate(() => document.body.classList.contains("card")), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a grouped widget can be taken out from its own right-click menu", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [{ id: "group", kind: "group", name: "Work", children: [{ id: "clock", kind: "widget", widget: "clock" }] }] }),
  });
  await page.locator('#dock > [data-id="group"]').click();
  await page.locator('#stack [data-widget="clock"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Take out of group", exact: true }).click();
  await page.locator('#dock > [data-id="clock"]').waitFor();
  const pins = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.equal(pins.find((pin) => pin.id === "group").children.length, 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("group search preserves live cells and Ctrl+wheel changes a persisted Explorer-style view", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [group(24)] }) });
  await page.locator('#dock > [data-id="group"]').click();
  await page.locator("#stack.open").waitFor();
  await page.evaluate(() => { window.__groupCell = document.querySelector('#stack [data-child-id="a1"]'); });
  await page.getByRole("searchbox", { name: "Search this group" }).fill("App 1");
  assert.equal(await page.locator("#stack .stack-cell:visible").count(), 11);
  assert.equal(await page.evaluate(() => window.__groupCell === document.querySelector('#stack [data-child-id="a1"]')), true);
  await page.locator("#stack .stack-grid").dispatchEvent("wheel", { deltaY: -120, ctrlKey: true });
  assert.equal(await page.locator("#stack .stack-grid").getAttribute("data-view"), "large");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("searchbox", { name: "Search this group" }).inputValue(), "");
  await page.getByRole("combobox", { name: "Group view" }).selectOption("list");
  await page.locator("#stack .stack-head > .stack-close").last().click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned[0].style?.groupView === "list");
  await page.locator('#dock > [data-id="group"]').click();
  await page.locator("#stack.open").waitFor();
  assert.equal(await page.locator("#stack .stack-grid").getAttribute("data-view"), "list");
  assert.deepEqual(errors, []); await page.close();
});

test("group dragging keeps a named preview visible, marks its destination and Escape cancels", async () => {
  const other = { ...group(2), id: "destination", name: "Design" };
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [group(6), other] }) });
  await page.locator('#dock > [data-id="group"]').click();
  const cell = page.locator('#stack [data-child-id="a0"]');
  await cell.waitFor();
  const origin = await cell.boundingBox();
  const destination = await page.locator('#dock > [data-id="destination"]').boundingBox();
  await page.mouse.move(origin.x + origin.width / 2, origin.y + 20);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 25, origin.y + 25, { steps: 5 });
  const preview = page.locator(".group-drag-preview");
  await preview.waitFor();
  assert.match(await preview.textContent(), /App 0/);
  assert.equal(await cell.evaluate((el) => el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true }))), false, "native image dragging must not cancel the pointer gesture");
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 10 });
  assert.match(await preview.textContent(), /Design/);
  assert.equal(await page.locator('#dock > [data-id="destination"].merge-target').count(), 1);
  const bounds = await preview.boundingBox(); assert.ok(bounds.width >= 112 && bounds.height >= 54);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await preview.count(), 0);
  assert.equal(await page.locator(".merge-target, .group-drop-before, .group-drop-after").count(), 0);
  assert.equal(await page.locator('#stack [data-child-id="a0"]').count(), 1);
  const pins = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.equal(pins[0].children.length, 6); assert.equal(pins[1].children.length, 2);
  assert.deepEqual(errors, []); await page.close();
});


test("groups retain search across reopening and keyboard navigation follows visible list entries", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [group(24)] }) });
  await page.locator('#dock > [data-id="group"]').click();
  const search = page.getByRole("searchbox", { name: "Search this group" });
  await search.fill("App 1");
  await page.getByRole("combobox", { name: "Group view" }).selectOption("list");
  const first = page.locator('#stack .stack-item:visible').first();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.childId), "a10");
  await page.locator("#stack .stack-head > .stack-close").last().click();
  await page.locator('#dock > [data-id="group"]').click();
  await search.waitFor();
  assert.equal(await search.inputValue(), "App 1");
  assert.equal(await page.locator("#stack .stack-cell:visible").count(), 11);
  assert.deepEqual(errors, []); await page.close();
});
