/* The notch steps aside while an app owns the screen, comes back when the
   pointer nears it or something new happens, and the dock makes grouping by
   drag forgiving: a wide middle band, not a bullseye. */
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

const event = (page, name, payload) => page.evaluate(([name, payload]) => {
  for (const cb of window.__listeners[name] || []) cb({ payload });
}, [name, payload]);
const away = (page) => page.evaluate(() => document.body.classList.contains("away"));
const app = (id, name) => ({ id, kind: "app", name, path: `C:/${id}.exe`, args: [] });

test("automatic notch steps aside over a maximized app and returns on approach", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({ notchVisibility: "auto" }) });
  await page.waitForTimeout(200);
  assert.equal(await away(page), false, "visible over the desktop");
  await event(page, "booki://screen-busy", true);
  assert.equal(await away(page), true, "out of the way over a maximized app");
  await event(page, "booki://notch-near", true);
  assert.equal(await away(page), false, "the pointer nearing the edge brings it back");
  await event(page, "booki://notch-near", false);
  assert.equal(await away(page), false, "leaving by a few pixels does not blink it away");
  await waitForAsyncCondition(page, () => document.body.classList.contains("away"));
  await event(page, "booki://screen-busy", false);
  assert.equal(await away(page), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a new song shows the hidden notch for a moment", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({ notchVisibility: "edge", edge: "bottom" }) });
  await page.evaluate(() => {
    const real = window.__TAURI__.core.invoke;
    window.__song = "First";
    window.__TAURI__.core.invoke = (cmd, args) => cmd === "media_info"
      ? Promise.resolve({ title: window.__song, artist: "Band", playing: true, thumb: "" })
      : real(cmd, args);
  });
  await event(page, "booki://media-changed", null);
  await waitForAsyncCondition(page, () => document.body.classList.contains("away"));
  await page.evaluate(() => { window.__song = "Second"; });
  await event(page, "booki://media-changed", null);
  await waitForAsyncCondition(page, () => !document.body.classList.contains("away"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("always keeps the notch on screen", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({ notchVisibility: "always" }) });
  await event(page, "booki://screen-busy", true);
  assert.equal(await away(page), false);
  assert.deepEqual(errors, []);
  await page.close();
});

async function dragTile(page, fromId, to, holdMs = 0) {
  const from = await page.locator(`#dock > .tile[data-id="${fromId}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.move(to.x + 1, to.y, { steps: 2 });
  await page.mouse.up();
}

test("dock files an app into a group anywhere across its middle", async () => {
  const group = { id: "g", kind: "group", name: "Work", path: "", args: [], children: [app("c", "Child")] };
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ magnification: false, pinned: [app("a", "Alpha"), app("b", "Beta"), group] }),
  });
  const pinned = () => page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  const g = await page.locator('#dock > .tile[data-id="g"]').boundingBox();
  // Off-centre and near the top edge of the tile still counts.
  await dragTile(page, "a", { x: g.x + g.width * 0.3, y: g.y + 3 });
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned.length === 2);
  let rows = await pinned();
  assert.deepEqual(rows.find((p) => p.id === "g").children.map((c) => c.id), ["c", "a"]);

  // A group dragged onto an app reorders; groups never nest.
  const b = await page.locator('#dock > .tile[data-id="b"]').boundingBox();
  await dragTile(page, "g", { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 260);
  await page.waitForTimeout(250);
  rows = await pinned();
  assert.equal(rows.filter((p) => p.kind === "group").length, 1);
  assert.equal(rows.find((p) => p.id === "g").children.length, 2);
  assert.deepEqual(errors, []);
  await page.close();
});

test("dock groups two apps after a short hold on the middle", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ magnification: false, pinned: [app("a", "Alpha"), app("b", "Beta"), app("d", "Delta")] }),
  });
  const b = await page.locator('#dock > .tile[data-id="b"]').boundingBox();
  await dragTile(page, "a", { x: b.x + b.width * 0.42, y: b.y + b.height * 0.85 }, 260);
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned.some((p) => p.kind === "group"));
  const rows = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.deepEqual(rows.map((p) => p.kind), ["group", "app"]);
  assert.deepEqual(rows[0].children.map((c) => c.id), ["b", "a"]);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a member dragged out of a group's panel lands where it is dropped on the bar", async () => {
  const group = { id: "g", kind: "group", name: "Work", path: "", args: [], children: [app("c", "Child"), app("e", "Echo")] };
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ magnification: false, pinned: [app("a", "Alpha"), app("b", "Beta"), group] }),
  });
  await page.locator('#dock > .tile[data-id="g"]').click();
  const cell = page.locator('.stack-item[data-child-id="c"]');
  await cell.waitFor();
  const from = await cell.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height + 40, { steps: 6 });
  // The bar can settle once the drag starts; aim at where it is now.
  const a = await page.locator('#dock > .tile[data-id="a"]').boundingBox();
  await page.mouse.move(a.x + 4, a.y + a.height / 2, { steps: 8 });
  await page.mouse.up();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned.length === 4);
  const rows = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.deepEqual(rows.map((p) => p.id), ["c", "a", "b", "g"]);
  assert.deepEqual(rows[3].children.map((p) => p.id), ["e"]);
  assert.deepEqual(errors, []);
  await page.close();
});
