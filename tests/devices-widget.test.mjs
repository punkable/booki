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
  await card.locator(".w-ring-num", { hasText: "?" }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

const ai = { id: "ai", name: "AI", path: "", args: [], kind: "widget", widget: "ai" };

test("the AI widget shows remaining Codex quota and never presents Claude elapsed time as quota", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [ai] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "ai_usage"
      ? Promise.resolve([
          { id: "codex", name: "Codex", windows: [{ label: "5h", percent: 42.4, resets_at: 0 }, { label: "week", percent: 81, resets_at: 0 }], block: null, week_tokens: 5000, last_activity: 1 },
          { id: "claude", name: "Claude", windows: [], block: { tokens: 1234567, started_at: 0, resets_at: 0, elapsed_percent: 37.2 }, week_tokens: 4100000, last_activity: 1 }])
      : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="ai"]');
  await card.locator(".w-ring-num", { hasText: "19%" }).waitFor();
  assert.match((await card.locator(".w-label").textContent()).trim(), /^Codex · /);
  const hint = await card.getAttribute("aria-label");
  assert.ok(hint.includes("Codex 5h · 42%") && hint.includes("Codex week · 81%"), hint);
  assert.ok(hint.includes("Claude · 5-h block: 1.2 M tokens") && hint.includes("37% of the 5-h block elapsed") && hint.includes("4.1 M tokens"), hint);
  assert.match(hint, /nothing leaves your PC/);
  // Claude's turn: token counts are known; the remaining allowance is not.
  await page.mouse.move(0, 0);
  await card.locator(".w-ring-num", { hasText: "~1.2 M" }).waitFor({ timeout: 8000 });
  assert.equal((await card.locator(".w-label").textContent()).trim(), "Claude · Approx. recorded usage");
  assert.deepEqual(errors, []);
  await page.close();
});

test("the AI widget lists a detected tool with no recent activity", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [ai] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "ai_usage"
      ? Promise.resolve([
          { id: "claude", name: "Claude", windows: [], block: null, week_tokens: 0, last_activity: 0 },
          { id: "codex", name: "Codex", windows: [{ label: "5h", percent: 12, resets_at: 0 }], block: null, week_tokens: 0, last_activity: 1 }])
      : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="ai"]');
  await card.locator(".w-ring-num", { hasText: "88%" }).waitFor();
  const hint = await card.getAttribute("aria-label");
  assert.ok(hint.includes("Codex 5h · 12%") && hint.includes("Claude · No activity in the last 5 h"), hint);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the AI widget says when no AI tool is found on this PC", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: [ai] }) });
  const card = page.locator('.tile[data-id="ai"]');
  await card.locator(".w-ring-num", { hasText: "—" }).waitFor();
  assert.match(await card.getAttribute("aria-label"), /Claude Code or Codex not found/);
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
  await panel.locator(".reading-card", { hasText: "Logitech MX Master 3S" }).locator("summary").click();
  await panel.locator(".reading-card", { hasText: "Logitech MX Master 3S" }).getByRole("button", { name: "Own card on the dock" }).click();
  const own = page.locator('#dock > .tile[data-widget="devices"]').nth(1);
  await own.locator(".w-ring-num", { hasText: "60" }).waitFor();
  assert.equal((await own.locator(".w-label").textContent()).trim(), "MX Master 3S");
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke("get_config"));
  assert.equal(saved.pinned[1].style.device, "Logitech MX Master 3S", "placed beside the card it came from");
  assert.deepEqual(errors, []);
  await page.close();
});

test("a device's own card still finds it when Windows names it a little differently", async () => {
  const pins = [
    { id: "h", name: "Devices", path: "", args: [], kind: "widget", widget: "devices", style: { device: "SteelSeries Arctis Nova 7", deviceKind: "headset" } },
    { id: "k", name: "Devices", path: "", args: [], kind: "widget", widget: "devices", style: { device: "G915 Keyboard", deviceKind: "keyboard" } },
  ];
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: pins }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "device_batteries"
      ? Promise.resolve([{ name: "Arctis Nova 7 Wireless", level: 40, kind: "headset" }, { name: "Logitech G915 LIGHTSPEED", level: 70, kind: "keyboard" }]) : old(c, a); }`,
  });
  await page.locator('.tile[data-id="h"] .w-ring-num', { hasText: "40" }).waitFor();
  await page.locator('.tile[data-id="k"] .w-ring-num', { hasText: "70" }).waitFor();
  assert.equal(await page.locator('.tile[data-id="k"]').getAttribute("data-glyph"), "device-keyboard");
  assert.deepEqual(errors, []);
  await page.close();
});

test("a charging device shows the bolt and says it is charging", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [{ ...widget, style: { device: "MX Master 3S", deviceKind: "mouse" } }] }),
    initScript: `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "device_batteries"
      ? Promise.resolve([{ name: "MX Master 3S", level: 35, kind: "mouse", charging: true }]) : old(c, a); }`,
  });
  const card = page.locator('.tile[data-id="dev"]');
  await card.locator(".w-ring-num", { hasText: "35" }).waitFor();
  assert.equal(await card.getAttribute("data-glyph"), "device-charging");
  assert.equal(await card.evaluate((el) => el.classList.contains("charging")), true);
  assert.match(await card.locator(".w-label").textContent(), /charging/i);
  assert.deepEqual(errors, []);
  await page.close();
});

test("manual refresh updates the device panel and dock from the same new reading", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [widget] }),
    initScript: `window.__level = 15; const old = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd, args) => cmd === "device_batteries" ? Promise.resolve([{ name: "MX Keys Mini", level: window.__level, kind: "keyboard", charging: true }]) : old(cmd, args);`,
  });
  const card = page.locator('#dock > [data-id="dev"]');
  await card.locator(".w-ring-num", { hasText: "15" }).waitFor();
  await card.click();
  await page.evaluate(() => { window.__level = 85; });
  await page.locator(".system-widget-panel").getByRole("button", { name: "Refresh data", exact: true }).click();
  await card.locator(".w-ring-num", { hasText: "85" }).waitFor();
  assert.match(await page.locator(".system-widget-panel .reading-card").textContent(), /85%/);
  assert.deepEqual(errors, []);
  await page.close();
});
