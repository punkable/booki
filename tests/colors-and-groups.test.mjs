/* Booki 0.83: colours that follow Windows or the wallpaper, the suggested
   palette, and dragging apps into a group's members in Settings. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";
import { resolveLook, colorSource } from "../src/look-model.js";
import { ACCENT_PALETTE, paletteEntry } from "../src/palette.js";
import { placePin } from "../src/pins.js";

const app = (id, name) => ({ id, kind: "app", name, path: `C:/${name}.exe`, args: [] });

test("custom colours paint exactly what was picked", () => {
  const cfg = { colorSource: "custom", accent: "#a47864", theme: "system", surfaceTint: "" };
  assert.equal(resolveLook(cfg, { platform: { accent: "#0078d4", accentOnTaskbar: true }, wallpaper: "#336699" }), cfg);
  assert.equal(colorSource({}), "custom");
  assert.equal(colorSource({ colorSource: "nonsense" }), "custom");
});

test("following Windows takes its accent, mode and taskbar colour", () => {
  const cfg = { colorSource: "windows", accent: "#dfaa75", theme: "system", surfaceTint: "" };
  const plain = resolveLook(cfg, { platform: { accent: "#0078D4", accentOnTaskbar: false, systemLight: false } });
  assert.equal(plain.accent, "#0078d4");
  assert.equal(plain.theme, "dark", "the dock follows the Windows mode, like the taskbar");
  assert.equal(plain.surfaceTint, "", "a plain taskbar keeps the theme's glass");
  const tinted = resolveLook(cfg, { platform: { accent: "#0078d4", accentOnTaskbar: true, systemLight: false } });
  assert.match(tinted.surfaceTint, /^#[0-9a-f]{6}$/);
  assert.notEqual(tinted.surfaceTint, "#0078d4", "an accent taskbar uses a deep shade");
  // An explicit theme and an explicit glass colour stay the user's.
  const mine = resolveLook({ ...cfg, theme: "light", surfaceTint: "#000000" }, { platform: { accent: "#0078d4", accentOnTaskbar: true, systemLight: false } });
  assert.equal(mine.theme, "light");
  assert.equal(mine.surfaceTint, "#000000");
  // No Windows accent: fall back to the wallpaper, then to the picked accent.
  assert.equal(resolveLook(cfg, { platform: { accent: null }, wallpaper: "#336699" }).accent, "#336699");
  assert.equal(resolveLook(cfg, { platform: null }).accent, "#dfaa75");
});

test("following the wallpaper tints the glass for the current theme", () => {
  const cfg = { colorSource: "wallpaper", accent: "#dfaa75", theme: "dark", surfaceTint: "" };
  const dark = resolveLook(cfg, { wallpaper: "#3366cc" });
  assert.equal(dark.accent, "#3366cc");
  const light = resolveLook({ ...cfg, theme: "light" }, { wallpaper: "#3366cc" });
  const lum = (hex) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  assert.ok(lum(dark.surfaceTint) < lum("#3366cc"), "darker on a dark theme");
  assert.ok(lum(light.surfaceTint) > lum("#3366cc"), "lighter on a light theme");
});

test("the suggested palette is unique, valid and led by Booki's tan", () => {
  assert.equal(ACCENT_PALETTE[0].hex, "#dfaa75");
  const hexes = ACCENT_PALETTE.map((entry) => entry.hex);
  assert.equal(new Set(hexes).size, hexes.length);
  for (const entry of ACCENT_PALETTE) {
    assert.match(entry.hex, /^#[0-9a-f]{6}$/);
    if (entry.code) assert.match(entry.code, /^\d{2}-\d{4}$/);
  }
  assert.equal(paletteEntry("#A47864").name, "Mocha Mousse");
  assert.equal(paletteEntry("#123456"), null);
});

test("an app can be placed between a group's members", () => {
  const group = { id: "g", kind: "group", name: "Work", children: [app("a", "A"), app("b", "B")] };
  const next = placePin([group, app("c", "C")], app("c", "C"), { groupId: "g", beforeId: "b" });
  assert.deepEqual(next.map((p) => p.id), ["g"]);
  assert.deepEqual(next[0].children.map((p) => p.id), ["a", "c", "b"]);
  // Reordering inside the same group.
  const moved = placePin(next, next[0].children[2], { groupId: "g", beforeId: "a" });
  assert.deepEqual(moved[0].children.map((p) => p.id), ["b", "a", "c"]);
});

test("the Settings window lets HTML drag and drop reach the page on Windows", () => {
  const source = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const builder = source.slice(source.indexOf('WebviewWindowBuilder::new(app, "settings"'));
  assert.match(builder.slice(0, builder.indexOf(".build()")), /\.disable_drag_drop_handler\(\)/);
});

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

test("choosing 'Like Windows' hides the palette and paints the Windows accent", async () => {
  const platform = `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "platform_capabilities"
    ? Promise.resolve({ build: 22631, systemBackdrop: true, highContrast: false, animations: true, transparency: true, accent: "#0078d4", accentOnTaskbar: false, systemLight: true })
    : old(c, a); }`;
  const { page, errors } = await openPage(browser, port, "settings.html", { cfg: makeConfig({ accent: "#a47864" }), viewport: { width: 1200, height: 900 }, initScript: platform });
  await page.getByRole("navigation").getByRole("button", { name: "Dock", exact: true }).click();
  const palette = page.getByRole("group", { name: "Accent color" });
  await palette.waitFor();
  assert.equal(await page.getByText("Mocha Mousse · PANTONE 17-1230").count(), 1, "the picked colour is named");
  await page.getByRole("radio", { name: "Like Windows" }).click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).colorSource === "windows");
  assert.equal(await palette.count(), 0);
  await waitForAsyncCondition(page, () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#0078d4");
  assert.deepEqual(errors, []);
  await page.close();
});

test("resting on a group opens it, and an app drops between its members", async () => {
  const group = { id: "g", kind: "group", name: "Work", path: "", args: [], children: [app("a", "Alpha"), app("b", "Beta")] };
  const { page, errors } = await openPage(browser, port, "settings.html", { cfg: makeConfig({ pinned: [group, app("c", "Gamma")] }), viewport: { width: 1200, height: 800 } });
  await page.getByRole("navigation").getByRole("button", { name: "Apps & folders", exact: true }).click();
  const source = page.locator(".library-pin").filter({ hasText: "Gamma" });
  const groupPin = page.locator(".library-pin").filter({ has: page.locator(".library-group-drop") });
  // Hold over the group: its members show up in the inspector.
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  const box = await groupPin.boundingBox();
  for (let i = 0; i < 8; i++) {
    await groupPin.dispatchEvent("dragover", { dataTransfer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
    await page.waitForTimeout(100);
  }
  const beta = page.locator(".library-group-member").filter({ hasText: "Beta" });
  await beta.waitFor();
  const target = await beta.boundingBox();
  await beta.dispatchEvent("dragover", { dataTransfer, clientX: target.x + 20, clientY: target.y + 4 });
  await beta.dispatchEvent("drop", { dataTransfer, clientX: target.x + 20, clientY: target.y + 4 });
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned.length === 1);
  const rows = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.deepEqual(rows[0].children.map((p) => p.id), ["a", "c", "b"]);
  assert.deepEqual(errors, []);
  await page.close();
});
