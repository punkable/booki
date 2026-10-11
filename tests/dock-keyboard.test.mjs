/* Dock controls that used to work only with a mouse: clipboard rows, the
   take-out control in a group, and the confirm popovers. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";

assertBuilt();
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => {
  await browser.close();
  srv.close();
});

const app = (id, name) => ({ id, kind: "app", name, path: `C:/${id}.exe`, args: [] });

test("clipboard rows copy with Enter and Space, and a failed action says so", async () => {
  const clip = { id: "clip", kind: "widget", widget: "clipboard", name: "Clipboard", path: "", args: [] };
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [clip] }) });
  await page.evaluate(() => {
    const real = window.__TAURI__.core.invoke;
    window.copies = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === "clipboard_history") return Promise.resolve([{ id: 1, text: "first entry", favorite: false, private: false }]);
      if (cmd === "clipboard_copy") { window.copies.push(args.text); return Promise.resolve(); }
      if (cmd === "clipboard_favorite") return Promise.reject(new Error("locked"));
      return real(cmd, args);
    };
  });
  const rejections = [];
  page.on("pageerror", (e) => rejections.push(String(e)));
  await page.evaluate(() => window.addEventListener("unhandledrejection", (e) => window.__bookiErrors.push(String(e.reason))));
  await page.locator('#dock > .tile[data-id="clip"]').click();
  const row = page.locator(".clip-row").first();
  await row.waitFor();
  await row.focus();
  await page.keyboard.press("Enter");
  await waitForAsyncCondition(page, () => window.copies.length === 1);
  await row.focus();
  await page.keyboard.press(" ");
  await waitForAsyncCondition(page, () => window.copies.length === 2);
  assert.deepEqual(await page.evaluate(() => window.copies), ["first entry", "first entry"]);

  await row.hover();
  await row.locator(".clip-act").first().click();
  await page.locator("#undo-toast:not(.hidden)").waitFor();
  assert.equal(await page.locator("#undo-toast").textContent(), "Couldn't save");
  assert.deepEqual(await page.evaluate(() => window.__bookiErrors), []);
  assert.deepEqual(rejections, []);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the take-out control is a real button beside the cell, not inside it", async () => {
  const group = { id: "g", kind: "group", name: "Work", path: "", args: [], children: [app("c", "Child"), app("e", "Echo")] };
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [app("a", "Alpha"), group] }) });
  await page.locator('#dock > .tile[data-id="g"]').click();
  const cell = page.locator('.stack-item[data-child-id="c"]');
  await cell.waitFor();
  const shape = await page.evaluate(() => {
    const out = document.querySelector('.stack-item[data-child-id="c"]').parentElement.querySelector(".stack-rm");
    return { tag: out.tagName, nested: !!out.parentElement.closest("button"), label: out.getAttribute("aria-label") };
  });
  assert.deepEqual(shape, { tag: "BUTTON", nested: false, label: "Take out of group: Child" });
  // Tab order is cell, its take-out button, next cell; Enter takes it out.
  await page.locator('.stack-item[data-child-id="c"]').focus();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return { cls: a.className, of: a.parentElement.querySelector(".stack-item")?.dataset.childId, shown: getComputedStyle(a).opacity };
  });
  assert.deepEqual(focused, { cls: "stack-rm", of: "c", shown: "1" });
  await page.keyboard.press("Enter");
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned.some((p) => p.id === "c"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("a confirm popover is an alertdialog that takes focus", async () => {
  const group = { id: "g", kind: "group", name: "Work", path: "", args: [], children: [app("c", "Child")] };
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [app("a", "Alpha"), group] }) });
  await page.locator('#dock > .tile[data-id="g"]').click({ button: "right" });
  await page.locator("#ctx-menu").getByText("Remove from dock").click();
  const pop = page.locator('.trash-pop[role="alertdialog"]');
  await pop.waitFor();
  const named = await page.evaluate(() => {
    const p = document.querySelector(".trash-pop");
    return document.getElementById(p.getAttribute("aria-labelledby"))?.textContent || "";
  });
  assert.match(named, /Work/);
  await waitForAsyncCondition(page, () => document.activeElement?.classList.contains("tp-btn"));
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Remove");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter"); // Cancel
  await pop.waitFor({ state: "detached" });
  const rows = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.deepEqual(rows.map((p) => p.id), ["a", "g"]);
  assert.deepEqual(errors, []);
  await page.close();
});
