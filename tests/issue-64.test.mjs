import test from "node:test";
import assert from "node:assert/strict";
import { serveDist, launchBrowser, openPage, makeConfig } from "./harness.mjs";
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const shortcut = { id: "link", name: "Editor", kind: "app", path: "C:/Users/Test/Desktop/Editor.lnk", args: [] };
const event = (page, name, payload) => page.evaluate(([name, payload]) => {
  for (const cb of window.__listeners[name] || []) cb({ payload });
}, [name, payload]);

test("Win+D desktop signal reveals a smart dock even with click trigger", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ autoHideMode: "smart", pinned: [shortcut] }) });
  await event(page, "booki://occlusion", true);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.body.classList.contains("tucked")), true);
  await event(page, "booki://desktop", true);
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.body.classList.contains("tucked")), false);
  await event(page, "booki://desktop", false);
  await event(page, "booki://occlusion", true);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.body.classList.contains("tucked")), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("shortcut launches as a shortcut and transfer failure leaves the pin intact", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [shortcut] }) });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__calls = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      window.__calls.push({ cmd, args });
      if (cmd === "relocate_shortcut") return Promise.reject("disk full");
      return old(cmd, args);
    };
  });
  const tile = page.locator('#dock > .tile[data-id="link"]');
  await tile.click();
  assert.equal(await page.evaluate(() => window.__calls.find(c => c.cmd === "launch_app").args.path), shortcut.path);
  await tile.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move shortcut into Booki", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await tile.count(), 1);
  assert.equal(await page.locator(".trash-pop").textContent(), "Could not move the shortcut. The original is preserved.");
  assert.deepEqual(errors, []);
  await page.close();
});

test("folder paging reaches later entries without changing sort or losing the previous page", async () => {
  const folder = { id: "folder", kind: "folder", name: "Files", path: "C:/Files" };
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [folder] }) });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    const rows = Array.from({ length: 60 }, (_, i) => ({ name: `File ${String(i).padStart(2, "0")}.txt`, path: `C:/Files/${i}.txt`, is_dir: false }));
    window.__TAURI__.core.invoke = (cmd, args) => cmd === "list_dir" ? Promise.resolve(rows.slice(args.offset, args.offset + args.limit)) : old(cmd, args);
  });
  await page.locator('.tile[data-id="folder"]').click();
  await page.getByRole("button", { name: "Next", exact: true }).waitFor();
  assert.equal(await page.locator(".stack-item").count(), 24);
  assert.equal(await page.getByRole("button", { name: "Previous", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Page 2", { exact: true }).waitFor();
  assert.equal(await page.locator(".stack-name").first().textContent(), "File 24.txt");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Page 3", { exact: true }).waitFor();
  assert.equal(await page.locator(".stack-item").count(), 12);
  assert.equal(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByText("Page 2", { exact: true }).waitFor();
  assert.equal(await page.locator(".stack-name").first().textContent(), "File 24.txt");
  assert.deepEqual(errors, []);
  await page.close();
});

test("changing language refreshes widget names and context menus", async () => {
  const cfg = makeConfig({ language: "es", pinned: [{ id: "clock", kind: "widget", widget: "clock" }] });
  const { page, errors } = await openPage(browser, port, "index.html", { cfg });
  await page.evaluate((cfg) => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => cmd === "get_config" ? Promise.resolve({ ...cfg, language: "en" }) : old(cmd, args);
  }, cfg);
  await event(page, "booki://config-changed", null);
  await page.waitForTimeout(300);
  await page.locator('.tile[data-id="clock"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from dock", exact: true }).waitFor();
  assert.equal(await page.locator(".menu-head strong").textContent(), "Clock");
  assert.equal(await page.getByRole("menuitem", { name: "Remove from dock", exact: true }).count(), 1);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.deepEqual(errors, []);
  await page.close();
});

test("cancelling a group drag leaves the child inside its group", async () => {
  const child = { id: "child", name: "Child", kind: "app", path: "C:/child.exe" };
  const cfg = makeConfig({ pinned: [{ id: "group", name: "Group", kind: "group", children: [child, { ...child, id: "other", name: "Other" }] }] });
  const { page, errors } = await openPage(browser, port, "index.html", { cfg });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__saves = 0;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === "save_config") window.__saves++;
      return old(cmd, args);
    };
  });
  await page.locator('.tile[data-id="group"]').click();
  await page.locator('.stack-item[data-child-id="child"]').waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const cell = document.querySelector('.stack-item[data-child-id="child"]');
    const rect = cell.getBoundingClientRect();
    cell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: rect.x + 10, clientY: rect.y + 10 }));
    cell.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    cell.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
  });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__saves), 0);
  assert.equal(await page.locator('.stack-item[data-child-id="child"]').count(), 1);
  assert.equal(await page.locator('.tile[data-id="child"]').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("dragging a shortcut out offers an explicit desktop action and cancel keeps the pin", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [shortcut] }) });
  const rect = await page.locator('#dock > .tile[data-id="link"]').boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, Math.max(0, rect.y - 110), { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Return shortcut to desktop", exact: true }).waitFor();
  assert.equal(await page.locator('#dock > .tile[data-id="link"]').count(), 1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator('#dock > .tile[data-id="link"]').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test("returning to the desktop from fullscreen restores a previously tucked dock", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ autoHideMode: "smart", pinned: [shortcut] }) });
  await event(page, "booki://occlusion", true);
  await page.waitForTimeout(250);
  await event(page, "booki://fullscreen", true);
  await event(page, "booki://desktop", true);
  await event(page, "booki://fullscreen", false);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.body.classList.contains("tucked")), false);
  assert.deepEqual(errors, []);
  await page.close();
});
