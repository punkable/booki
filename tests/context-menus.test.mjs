import test from "node:test";
import assert from "node:assert/strict";
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const group = { id: "work", kind: "group", name: "Work", children: [] };

test("group context menus stay compact and customization cancels drafts and restores focus", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [group] }), viewport: { width: 430, height: 520 } });
  const tile = page.locator('#dock > [data-id="work"]'); await tile.focus();
  await tile.click({ button: "right" });
  assert.equal(await page.locator('#ctx-menu .menu-swatches, #ctx-menu .menu-glyphs, #ctx-menu input').count(), 0);
  assert.equal(await page.locator('#ctx-menu [role="menuitem"]').count(), 4);
  await page.getByRole("menuitem", { name: "Customize", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Customize group", exact: true });
  await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Draft name");
  await editor.getByRole("button", { name: "Colour", exact: true }).click();
  await editor.getByRole("button", { name: "Mocha Mousse · 17-1230", exact: true }).click();
  await editor.getByRole("button", { name: "Icon", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await editor.locator('.customizer-picker:visible').count(), 0);
  assert.ok(await editor.isVisible());
  const bounds = await editor.boundingBox(); assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 430 && bounds.y + bounds.height <= 520, JSON.stringify(bounds));
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), "work");
  const saved = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned[0]);
  assert.equal(saved.name, "Work"); assert.equal(saved.style?.color, undefined);
  assert.deepEqual(errors, []); await page.close();
});

test("background profiles are lazy, bounded and return with the keyboard without filling the root", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [group] }), viewport: { width: 600, height: 560 },
    initScript: `window.__profileReads=0;const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='profile_list'){window.__profileReads++;return Promise.resolve(Array.from({length:30},(_,i)=>'Workspace '+i));}return old(cmd,args);};` });
  await page.locator("#dock").dispatchEvent("contextmenu", { clientX: 300, clientY: 500 });
  assert.equal(await page.locator('#ctx-menu [role="menuitem"]').count(), 8);
  assert.equal(await page.locator('#ctx-menu .menu-styles').count(), 0);
  assert.equal(await page.evaluate(() => window.__profileReads), 0);
  await page.getByRole("menuitem", { name: "Dock profiles", exact: true }).click();
  await page.getByRole("menuitem", { name: "Workspace 29", exact: true }).waitFor();
  const box = await page.locator("#ctx-menu").boundingBox(); assert.ok(box.height <= 442 && box.y >= 0 && box.y + box.height <= 560, JSON.stringify(box));
  assert.ok(await page.locator("#ctx-menu").evaluate((el) => el.scrollHeight > el.clientHeight));
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.getByRole("menuitem", { name: "Workspace 29", exact: true }).count(), 0);
  await page.getByRole("menuitem", { name: "Organize", exact: true }).click();
  await page.getByRole("menuitem", { name: "App library", exact: true }).waitFor();
  await page.getByRole("menuitem", { name: "Back", exact: true }).click();
  assert.equal(await page.locator('#ctx-menu [role="menuitem"]').count(), 8);
  assert.deepEqual(errors, []); await page.close();
});

test("a failed group save keeps the staged name and selections available for retry", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [group] }),
    initScript: `window.__failSave=true;const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='save_config'&&args?.patch?.pinned?.some((pin)=>pin.name==='Studio')&&window.__failSave?Promise.reject('test save failure'):old(cmd,args);` });
  await page.locator('#dock > [data-id="work"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Customize", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Customize group", exact: true });
  await editor.getByRole("textbox", { name: "Name", exact: true }).fill("Studio");
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await editor.getByRole("alert").waitFor();
  assert.equal(await editor.getByRole("textbox", { name: "Name", exact: true }).inputValue(), "Studio");
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned[0].name), "Work");
  await page.evaluate(() => { window.__failSave = false; });
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned[0].name === "Studio");
  await editor.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), "work");
  assert.deepEqual(errors, []); await page.close();
});
