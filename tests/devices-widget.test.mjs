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
      ? Promise.resolve([{ name: "Arctis Nova 7", level: 15, source: "headsetcontrol" }, { name: "MX Master 3S", level: 60, source: "logitech" }]) : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="dev"]');
  await card.locator(".w-ring-num", { hasText: "15" }).waitFor();
  assert.equal((await card.locator(".w-label").textContent()).trim(), "Arctis Nova 7");
  const hint = await card.getAttribute("aria-label");
  assert.ok(String(hint).includes("MX Master 3S · 60%"), `hint lists every device: ${hint}`);
  assert.ok(String(hint).includes("Arctis Nova 7 · 15%") && !String(hint).includes("HeadsetControl"), `the hint names devices, not plugins: ${hint}`);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the devices widget turns to the next device with its kind icon", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "device_batteries"
      ? Promise.resolve([{ name: "Arctis Nova 7", level: 15, source: "headsetcontrol", kind: "headset" }, { name: "MX Master 3S", level: 60, source: "logitech", kind: "mouse" }]) : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="dev"]');
  await card.locator(".w-ring-num", { hasText: "15" }).waitFor();
  assert.equal(await card.getAttribute("data-glyph"), "device-headset");
  await page.mouse.move(0, 0);
  await card.locator(".w-ring-num", { hasText: "60" }).waitFor({ timeout: 8000 });
  assert.equal(await card.getAttribute("data-glyph"), "device-mouse");
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

const ai = { id: "ai", name: "AI", path: "", args: [], kind: "widget", widget: "ai" };

test("the AI widget shows the window closest to its limit and lists every window", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [ai] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "ai_usage"
      ? Promise.resolve([
          { id: "claude", name: "Claude", windows: [{ label: "5h", percent: 42.4, resets_at: 0 }, { label: "week", percent: 81, resets_at: 0 }], error: null },
          { id: "chatgpt", name: "ChatGPT", windows: [{ label: "5h", percent: 12, resets_at: 0 }], error: null }])
      : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="ai"]');
  await card.locator(".w-ring-num", { hasText: "81" }).waitFor();
  assert.match((await card.locator(".w-label").textContent()).trim(), /^Claude · /);
  const hint = await card.getAttribute("aria-label");
  assert.ok(hint.includes("Claude 5h · 42%") && hint.includes("ChatGPT 5h · 12%"), hint);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the AI widget keeps Claude listed with a reason when its sign-in has lapsed", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [ai] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "ai_usage"
      ? Promise.resolve([
          { id: "claude", name: "Claude", windows: [], error: "expired" },
          { id: "chatgpt", name: "ChatGPT", windows: [{ label: "5h", percent: 12, resets_at: 0 }], error: null }])
      : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="ai"]');
  await card.locator(".w-ring-num", { hasText: "12" }).waitFor();
  const hint = await card.getAttribute("aria-label");
  assert.ok(hint.includes("ChatGPT 5h · 12%") && /Claude · .*Claude Code/.test(hint), hint);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the AI widget explains what to do when nothing is signed in", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [ai] }) });
  const card = page.locator('.tile[data-id="ai"]');
  await card.locator(".w-ring-num", { hasText: "—" }).waitFor();
  assert.match(await card.getAttribute("aria-label"), /Claude Code|Codex/);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a device can get its own card that follows only it, under a short name", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "device_batteries"
      ? Promise.resolve([{ name: "SteelSeries Arctis Nova 7", level: 15, kind: "headset" }, { name: "Logitech MX Master 3S", level: 60, kind: "mouse" }]) : old(c, a); }`,
  });
  await page.locator('.tile[data-id="dev"]').click();
  const panel = page.locator(".system-widget-panel");
  await panel.getByRole("button", { name: "Own card on the dock" }).first().waitFor();
  await panel.locator(".reading-card", { hasText: "Logitech MX Master 3S" }).getByRole("button", { name: "Own card on the dock" }).click();
  const own = page.locator('#dock > .tile[data-widget="devices"]').nth(1);
  await own.locator(".w-ring-num", { hasText: "60" }).waitFor();
  assert.equal((await own.locator(".w-label").textContent()).trim(), "MX Master 3S");
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.equal(saved.pinned[1].style.device, "Logitech MX Master 3S", "placed beside the card it came from");
  assert.deepEqual(errors, []);
  await page.close();
});
