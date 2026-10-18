/* The theme picked in Booki is the one painted, every surface of a window
   shares one theme, the small notch shapes paint evenly, and a live notch
   opens the dock by stretching into it. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig, everyKindPinned, waitForAsyncCondition } from "./harness.mjs";

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
const theme = (page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const platform = (extra) => `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "platform_capabilities"
  ? Promise.resolve(${JSON.stringify({ build: 22631, systemBackdrop: true, highContrast: false, animations: true, transparency: true, accent: "#0078d4", accentOnTaskbar: true, systemLight: false, ...extra })})
  : old(c, a); }`;

test("a light theme stays light when Windows paints an accent taskbar", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ theme: "light", colorSource: "windows", surfaceStyle: "taskbar" }),
    initScript: platform(),
  });
  await waitForAsyncCondition(page, () => document.documentElement.style.getPropertyValue("--glass-tint") === "#eeeeee");
  assert.equal(await theme(page), "light");
  assert.deepEqual(errors, []);
  await page.close();
});

test("a dark glass colour paints its whole window dark, menus included", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ theme: "light", surfaceStyle: "glass", surfaceColor: "#000000", materialStrength: 70 }),
  });
  assert.equal(await theme(page), "dark", "dark ink, hovers and plates match the black fill");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Settings follows the Windows app mode, not the taskbar's", async () => {
  const { page, errors } = await openPage(browser, port, "settings.html", {
    cfg: makeConfig({ theme: "system", colorSource: "windows", surfaceStyle: "taskbar" }),
    viewport: { width: 1200, height: 900 },
    initScript: platform({ accentOnTaskbar: false }),
  });
  await page.waitForTimeout(200);
  assert.equal(await theme(page), null, "system theme is left to the app mode");
  assert.deepEqual(errors, []);
  await page.close();
});

test("the resting notch paints one even fill without Windows' blur", async () => {
  for (const notchMode of ["attached", "floating", "smart"]) {
    const { page, errors } = await openPage(browser, port, "notch.html", {
      cfg: makeConfig({ notchMode, surfaceStyle: "glass" }),
      initScript: `window.__material = []; { const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => {
        if (c === "set_material") window.__material.push(a.shapes.length);
        return old(c, a); }; }`,
    });
    const pill = await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById("notch-pill"));
      return { image: style.backgroundImage, material: window.__material.filter(Boolean).length };
    });
    assert.equal(pill.image, "none", `${notchMode}: no sheen band across the pill`);
    assert.equal(pill.material, 0, `${notchMode}: no blur rectangle under the small pill`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("the notch tells the dock its settled live shape", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", {
    cfg: makeConfig({ notchMode: "attached", edge: "bottom", notchVisibility: "always" }),
    initScript: `window.__shapes = []; window.__TAURI__.event.emit = (name, payload) => { if (name === "booki://notch-shape") window.__shapes.push(payload); return Promise.resolve(); };
      { const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "media_info"
        ? Promise.resolve({ title: "Song", artist: "Band", playing: true, thumb: "" }) : old(c, a); }`,
  });
  await event(page, "booki://media-changed", null);
  await waitForAsyncCondition(page, () => window.__shapes.at(-1)?.active === true);
  const shape = await page.evaluate(() => window.__shapes.at(-1));
  const { cx, cy, ...size } = shape;
  assert.deepEqual(size, { active: true, width: 150, height: 18, attached: true });
  assert.ok(Number.isFinite(cx) && Number.isFinite(cy), "reports where the capsule sits on screen");
  assert.deepEqual(errors, []);
  await page.close();
});

test("the dock slides out of its edge without clipping or deforming, live notch or not", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "edge", pinned: everyKindPinned().slice(0, 6) }),
    viewport: { width: 1200, height: 300 },
  });
  await waitForAsyncCondition(page, () => document.body.classList.contains("tucked"));
  const tucked = await page.evaluate(() => {
    const style = getComputedStyle(document.getElementById("dock"));
    return { transform: new DOMMatrix(style.transform), clip: style.clipPath, filter: style.filter };
  });
  assert.equal(tucked.transform.a, 1, "no horizontal squash");
  assert.equal(tucked.transform.d, 1, "no vertical squash");
  assert.equal(tucked.transform.b + tucked.transform.c, 0, "no skew");
  assert.ok(tucked.transform.f > 0, "tucked below its bottom edge");
  assert.equal(tucked.clip, "none");
  assert.equal(tucked.filter, "none");
  await event(page, "booki://notch-shape", { active: true, width: 150, height: 18, attached: true });
  await event(page, "booki://reveal", null);
  assert.equal(await page.evaluate(() => document.body.classList.contains("reveal-morph")), false);
  await waitForAsyncCondition(page, () => !document.body.classList.contains("tucked") && !document.body.classList.contains("revealing"));
  await page.waitForFunction(() => getComputedStyle(document.getElementById("dock")).transform === "none" || new DOMMatrix(getComputedStyle(document.getElementById("dock")).transform).isIdentity);
  assert.deepEqual(errors, []);
  await page.close();
});

test("an idle notch keeps the usual reveal", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "edge", pinned: everyKindPinned().slice(0, 6) }),
    viewport: { width: 1200, height: 300 },
  });
  await waitForAsyncCondition(page, () => document.body.classList.contains("tucked"));
  await event(page, "booki://notch-shape", { active: false, width: 112, height: 12, attached: true });
  await event(page, "booki://reveal", null);
  assert.equal(await page.evaluate(() => document.body.classList.contains("reveal-morph")), false);
  assert.deepEqual(errors, []);
  await page.close();
});
