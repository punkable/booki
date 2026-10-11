/* The dock's style, fill and accent (each from its own source), the
   suggested palette, and dragging apps into a group's members in Settings. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from "./harness.mjs";
import { resolveLook, colorSource, surfaceColor } from "../src/look-model.js";
import { ACCENT_PALETTE, paletteEntry } from "../src/palette.js";
import { placePin } from "../src/pins.js";

const app = (id, name) => ({ id, kind: "app", name, path: `C:/${name}.exe`, args: [] });

const PLATFORM = (over = {}) => ({ accent: "#0078d4", accentOnTaskbar: false, systemLight: false, ...over });

test("the accent comes from its own source and never decides the dock's fill", () => {
  const cfg = { colorSource: "custom", accent: "#a47864", theme: "dark", surfaceStyle: "glass", surfaceColor: "auto" };
  const custom = resolveLook(cfg, { platform: PLATFORM({ accentOnTaskbar: true }), wallpaper: "#336699" });
  assert.equal(custom.accent, "#a47864");
  assert.equal(custom.glassTint, "#1c1c1c", "glass keeps its neutral tint");
  const windows = resolveLook({ ...cfg, colorSource: "windows" }, { platform: PLATFORM({ accentOnTaskbar: true }) });
  assert.equal(windows.accent, "#0078d4");
  assert.equal(windows.glassTint, custom.glassTint, "following the Windows accent leaves the fill alone");
  // No Windows accent: fall back to the wallpaper, then to the picked accent.
  assert.equal(resolveLook({ ...cfg, colorSource: "windows" }, { platform: PLATFORM({ accent: null }), wallpaper: "#336699" }).accent, "#336699");
  assert.equal(resolveLook({ ...cfg, colorSource: "windows" }, { platform: null }).accent, "#a47864");
  assert.equal(colorSource({}), "custom");
  assert.equal(colorSource({ colorSource: "nonsense" }), "custom");
});

test("the taskbar style paints the dock with the taskbar's own colour and mode", () => {
  const cfg = { colorSource: "custom", accent: "#dfaa75", theme: "system", surfaceStyle: "taskbar", surfaceColor: "#ff0000" };
  const dark = resolveLook(cfg, { platform: PLATFORM() });
  assert.equal(dark.theme, "dark", "the dock follows the Windows mode, like the taskbar");
  assert.equal(dark.glassTint, "#202020", "a plain dark taskbar, whatever fill was picked");
  assert.equal(resolveLook(cfg, { platform: PLATFORM({ systemLight: true }) }).glassTint, "#eeeeee");
  const accented = resolveLook(cfg, { platform: PLATFORM({ accentOnTaskbar: true }) });
  assert.match(accented.glassTint, /^#[0-9a-f]{6}$/);
  assert.notEqual(accented.glassTint, "#0078d4", "an accent taskbar uses a deep shade");
  // An explicit theme stays the user's: light means the light taskbar fill,
  // never a dark bar under light-theme ink.
  const light = resolveLook({ ...cfg, theme: "light" }, { platform: PLATFORM({ accentOnTaskbar: true }) });
  assert.equal(light.theme, "light");
  assert.equal(light.glassTint, "#eeeeee");
});

test("each style is visibly different over the same wallpaper", async () => {
  const { surfaceAlpha } = await import("../src/surface.js");
  const alphas = ["solid", "taskbar", "glass", "clear"].map((surfaceStyle) => surfaceAlpha({ surfaceStyle, materialStrength: 60 }));
  for (let i = 1; i < alphas.length; i++) assert.ok(alphas[i - 1] - alphas[i] >= 0.12, `${alphas}`);
  assert.equal(surfaceAlpha({ surfaceStyle: "solid", materialStrength: 0 }), 1);
});

test("the fill can follow the wallpaper, the accent or a picked colour", () => {
  const cfg = { colorSource: "custom", accent: "#3366cc", theme: "dark", surfaceStyle: "glass" };
  const lum = (hex) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  const wallDark = resolveLook({ ...cfg, surfaceColor: "wallpaper" }, { wallpaper: "#33cc66" }).glassTint;
  const wallLight = resolveLook({ ...cfg, theme: "light", surfaceColor: "wallpaper" }, { wallpaper: "#33cc66" }).glassTint;
  assert.ok(lum(wallDark) < lum("#33cc66") && lum(wallLight) > lum("#33cc66"), "darker on dark, lighter on light");
  const accent = resolveLook({ ...cfg, surfaceColor: "accent" }, {}).glassTint;
  assert.ok(lum(accent) < lum("#3366cc"));
  assert.equal(resolveLook({ ...cfg, surfaceColor: "#223344" }, {}).glassTint, "#223344");
  // Before the wallpaper is sampled, the style's own tint stands in.
  assert.equal(resolveLook({ ...cfg, surfaceColor: "wallpaper" }, {}).glassTint, "#1c1c1c");
  // Configs from before rev 11 carry the picked colour in surfaceTint.
  assert.equal(surfaceColor({ surfaceTint: "#0B1A2A" }), "#0b1a2a");
  assert.equal(surfaceColor({ surfaceColor: "nonsense" }), "auto");
});

test("older finishes read as their closest style", async () => {
  const { resolveSurfaceStyle, resolveGlassTint } = await import("../src/surface.js");
  assert.equal(resolveSurfaceStyle({ surfaceStyle: "mica" }), "solid");
  assert.equal(resolveSurfaceStyle({ surfaceStyle: "acrylic" }), "glass");
  assert.equal(resolveSurfaceStyle({ surfaceStyle: "clear" }), "clear");
  assert.equal(resolveGlassTint({ glassTint: "#ABCDEF" }), "#abcdef");
  assert.equal(resolveGlassTint({ surfaceColor: "#123456" }), "#123456");
  assert.equal(resolveGlassTint({ surfaceColor: "auto" }), "");
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

test("resting on a group opens it in place, and an app drops between its members", async () => {
  const group = { id: "g", kind: "group", name: "Work", path: "", args: [], children: [app("a", "Alpha"), app("b", "Beta")] };
  const { page, errors } = await openPage(browser, port, "settings.html", { cfg: makeConfig({ pinned: [group, app("c", "Gamma")] }), viewport: { width: 1200, height: 800 } });
  await page.getByRole("navigation").getByRole("button", { name: "Apps & folders", exact: true }).click();
  const source = page.locator(".library-pin").filter({ hasText: "Gamma" });
  const groupPin = page.locator(".library-pin").filter({ has: page.locator(".library-group-count") });
  // Hold over the group: the strip itself turns into the group's members.
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  const box = await groupPin.boundingBox();
  for (let i = 0; i < 12 && !(await page.locator(".library-pin-strip.in-group").count()); i++) {
    // The strip can switch to the group between the check and this event, which
    // removes the group pin; don't wait the full default timeout for it.
    await groupPin.dispatchEvent("dragover", { dataTransfer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }, { timeout: 500 }).catch(() => {});
    await page.waitForTimeout(100);
  }
  await page.locator(".library-pin-strip.in-group").waitFor();
  assert.equal(await page.locator(".library-inspector .library-group-members").count(), 0, "nothing unfolds below the strip");
  const beta = page.locator(".library-pin-strip.in-group .library-pin").filter({ hasText: "Beta" });
  const target = await beta.boundingBox();
  await beta.dispatchEvent("dragover", { dataTransfer, clientX: target.x + 4, clientY: target.y + 20 });
  await beta.dispatchEvent("drop", { dataTransfer, clientX: target.x + 4, clientY: target.y + 20 });
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).pinned.length === 1);
  const rows = await page.evaluate(async () => (await window.__TAURI__.core.invoke("get_config")).pinned);
  assert.deepEqual(rows[0].children.map((p) => p.id), ["a", "c", "b"]);
  // Back to the dock: the strip shows the dock's pins again.
  await page.getByRole("button", { name: "In your dock" }).click();
  await page.locator(".library-pin-strip:not(.in-group)").waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});
