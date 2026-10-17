/* The Devices widget shows the connected device closest to running out. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig } from "./harness.mjs";

assertBuilt();
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => {
  await browser.close();
  srv.close();
});

const widget = { id: "dev", name: "Devices", path: "", args: [], kind: "widget", widget: "devices" };

test("the devices widget shows the lowest battery and lists every device in its hint", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "device_batteries"
      ? Promise.resolve([{ name: "Arctis Nova 7", level: 15 }, { name: "MX Master 3S", level: 60 }]) : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="dev"]');
  await card.locator(".w-ring-num", { hasText: "15" }).waitFor();
  assert.equal((await card.locator(".w-label").textContent()).trim(), "Arctis Nova 7");
  const hint = await card.getAttribute("aria-label");
  assert.ok(String(hint).includes("MX Master 3S · 60%"), `hint lists every device: ${hint}`);
  assert.deepEqual(errors, []);
  await page.close();
});

test("with no device reporting a battery the widget says so instead of a number", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [widget] }) });
  const card = page.locator('.tile[data-id="dev"]');
  await card.locator(".w-ring-num", { hasText: "—" }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});
