/* The visibility policy driven through the real dock.
 *
 * visibility-policy.test.mjs proves the decision is right; this proves the dock
 * is actually wired to it. Backend signals (occlusion, fullscreen, the notch
 * click) are pushed through the same listener path the real app uses, and the
 * observable result is the `tucked` class the bar animates with.
 */
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

const PINS = [
  { id: "app1", kind: "app", name: "One", path: "C:/one.exe" },
  { id: "app2", kind: "app", name: "Two", path: "C:/two.exe" },
];

/** Push a backend event at the page, the way Rust would. */
async function signal(page, name, payload) {
  await page.evaluate(
    ([n, p]) => {
      for (const cb of window.__listeners[n] || []) cb({ event: n, payload: p });
    },
    [name, payload]
  );
  await page.waitForTimeout(250);
}

const tucked = (page) => page.evaluate(() => document.body.classList.contains("tucked"));

test("smart mode: covered by a window tucks the dock away", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "smart", notchTrigger: "click", pinned: PINS }),
  });
  assert.equal(await tucked(page), false, "should start visible on a clear desktop");

  await signal(page, "booki://occlusion", true);
  assert.equal(await tucked(page), true, "a window covering the dock should tuck it");

  await page.close();
  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
});

test("smart + click trigger: a clear desktop does NOT bring it back on its own", async () => {
  // This is the case the policy returns `null` for. Getting it wrong in either
  // direction is a bug users reported: popping out by itself mid alt-tab, or
  // never coming back at all.
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "smart", notchTrigger: "click", pinned: PINS }),
  });
  await signal(page, "booki://occlusion", true);
  assert.equal(await tucked(page), true);

  await signal(page, "booki://occlusion", false);
  await page.waitForTimeout(1500); // longer than the smart-reveal debounce
  assert.equal(await tucked(page), true, "click trigger must wait to be asked");

  await page.close();
  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
});

test("smart + hover trigger: a clear desktop brings it back", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "smart", notchTrigger: "hover", pinned: PINS }),
  });
  await signal(page, "booki://occlusion", true);
  assert.equal(await tucked(page), true);

  await signal(page, "booki://occlusion", false);
  await page.waitForTimeout(1500); // the debounce is deliberate, not a bug
  assert.equal(await tucked(page), false, "hover trigger should reveal once the desktop settles");

  await page.close();
  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
});

test("fullscreen blacks it out and releasing restores it", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "off", pinned: PINS }),
  });
  assert.equal(await tucked(page), false, "auto-hide off starts visible");

  await signal(page, "booki://fullscreen", true);
  assert.equal(await tucked(page), true, "a fullscreen app should black the dock out");

  await signal(page, "booki://fullscreen", false);
  await page.waitForTimeout(400);
  assert.equal(await tucked(page), false, "leaving fullscreen should restore it");

  await page.close();
  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
});

test("auto-hide off ignores occlusion entirely", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ autoHideMode: "off", pinned: PINS }),
  });
  await signal(page, "booki://occlusion", true);
  assert.equal(await tucked(page), false, "off means off");

  await page.close();
  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
});
