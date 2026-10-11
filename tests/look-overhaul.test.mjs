/* The dock's look, reworked: four styles that differ at a glance, picked
   from Settings or from the dock's own menu, which the notch now opens too,
   and a notch that steps out of the way without leaving half a tab behind. */
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

const fire = (page, name, payload = null) => page.evaluate(([name, payload]) => {
  for (const cb of window.__listeners[name] || []) cb({ payload });
}, [name, payload]);
const app = (id, name) => ({ id, kind: "app", name, path: `C:/${id}.exe`, args: [] });
const pins = [app("a", "Alpha"), app("b", "Beta"), app("c", "Gamma")];

test("a playing notch hides completely over a maximized app, never cut in half", async () => {
  for (const notchMode of ["attached", "floating", "smart"]) {
    const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({ notchVisibility: "auto", notchMode }), viewport: { width: 320, height: 68 } });
    await page.evaluate(() => {
      const real = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd, args) => cmd === "media_info"
        ? Promise.resolve({ title: "Song", artist: "Band", playing: true, thumb: "" }) : real(cmd, args);
    });
    await fire(page, "booki://media-changed");
    await waitForAsyncCondition(page, () => document.body.classList.contains("live"));
    // The window is shown again: the entrance animation runs, then ends.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await fire(page, "booki://screen-busy", true);
    await waitForAsyncCondition(page, () => {
      const cs = getComputedStyle(document.querySelector(".notch-pill"));
      return document.body.classList.contains("away") && cs.opacity === "0" && cs.visibility === "hidden";
    });
    assert.deepEqual(errors, [], notchMode);
    await page.close();
  }
});

test("right-clicking the notch asks the dock to open its menu", async () => {
  const { page, errors } = await openPage(browser, port, "notch.html", { cfg: makeConfig({}), viewport: { width: 320, height: 68 } });
  await page.evaluate(() => {
    const real = window.__TAURI__.core.invoke;
    window.__asked = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === "notch_reveal_for_menu") { window.__asked.push(cmd); return Promise.resolve(true); }
      return real(cmd, args);
    };
  });
  await page.locator(".notch-pill").click({ button: "right", force: true });
  await waitForAsyncCondition(page, () => window.__asked.length === 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the dock's menu changes its style in one click, and the notch opens the same menu", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: pins, surfaceStyle: "glass" }) });
  await page.locator("#dock").waitFor();
  await fire(page, "booki://notch-menu");
  const styles = page.locator("#ctx-menu .menu-styles [role=menuitemradio]");
  await waitForAsyncCondition(page, () => !document.getElementById("ctx-menu").classList.contains("hidden"));
  assert.equal(await styles.count(), 4);
  assert.equal(await page.locator('#ctx-menu [data-style="glass"]').getAttribute("aria-checked"), "true");
  assert.ok(await page.locator("#ctx-menu").getByRole("menuitem", { name: "App library" }).count() >= 1);
  await page.locator('#ctx-menu [data-style="clear"]').click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke("get_config")).surfaceStyle === "clear");
  assert.equal(await page.evaluate(() => document.body.classList.contains("look-clear")), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the taskbar style paints the bar with the taskbar's colour, without a sheen", async () => {
  const platform = `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "platform_capabilities"
    ? Promise.resolve({ build: 22631, systemBackdrop: true, highContrast: false, animations: true, transparency: true, accent: "#0078d4", accentOnTaskbar: false, systemLight: false })
    : old(c, a); }`;
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned: pins, theme: "system", surfaceStyle: "taskbar" }), initScript: platform });
  await waitForAsyncCondition(page, () => document.documentElement.style.getPropertyValue("--glass-tint") === "#202020");
  const look = await page.locator(".dock").evaluate((el) => {
    el.style.transition = "none";
    return { fill: getComputedStyle(el).backgroundColor, sheen: getComputedStyle(el, "::before").content };
  });
  assert.match(look.fill, /0\.12549 0\.12549 0\.12549 \/ 0\.82/, "the dark taskbar fill at the taskbar's opacity");
  assert.ok(look.sheen === "none" || look.sheen === "normal", `no gloss layer: ${look.sheen}`);
  assert.deepEqual(errors, []);
  await page.close();
});
