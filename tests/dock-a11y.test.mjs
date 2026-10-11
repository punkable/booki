/* The dock as a Windows toolbar: one Tab stop, arrow keys between tiles,
   running state for screen readers, and Windows high contrast. */
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

const app = (id, name) => ({ id, kind: "app", name, path: `C:/${id}.exe`, args: [] });
const sep = (id) => ({ id, kind: "separator", name: "", path: "", args: [] });
const clock = { id: "w", kind: "widget", widget: "clock", name: "", path: "", args: [] };
const pinned = [app("a", "Alpha"), app("b", "Bravo"), sep("s1"), app("c", "Charlie"), sep("s2"), clock];

const focusedId = (page) => page.evaluate(() => document.activeElement?.dataset?.id || null);
const tabStops = (page) => page.evaluate(() =>
  [...document.querySelectorAll("#dock > .tile")].filter((el) => el.tabIndex === 0).map((el) => el.dataset.id));

async function walk(page, keys) {
  const seen = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    seen.push(await focusedId(page));
  }
  return seen;
}

test("a horizontal dock is a toolbar with one Tab stop and arrow keys between tiles", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned }) });
  const bar = await page.evaluate(() => {
    const d = document.getElementById("dock");
    return { role: d.getAttribute("role"), orientation: d.getAttribute("aria-orientation"), label: d.getAttribute("aria-label") };
  });
  assert.deepEqual(bar, { role: "toolbar", orientation: "horizontal", label: "Booki dock" });
  assert.deepEqual(await tabStops(page), ["a"], "only the first tile is tabbable at first");

  await page.locator('#dock > .tile[data-id="a"]').focus();
  // Separators are skipped; the ends do not wrap; the cross-axis arrows do nothing.
  assert.deepEqual(
    await walk(page, ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End", "ArrowUp"]),
    ["b", "c", "w", "w", "w", "c", "a", "w", "w"]
  );
  assert.deepEqual(await tabStops(page), ["w"], "the Tab stop follows focus");

  // Tab leaves the bar instead of walking every tile, and Shift+Tab comes back to the last one.
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest("#dock > .tile")), false);
  await page.locator('#dock > .tile[data-id="b"]').focus();
  assert.deepEqual(await tabStops(page), ["b"]);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a vertical dock moves with Up and Down", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned, edge: "left" }),
    viewport: { width: 400, height: 1000 },
  });
  assert.equal(await page.getAttribute("#dock", "aria-orientation"), "vertical");
  await page.locator('#dock > .tile[data-id="a"]').focus();
  assert.deepEqual(
    await walk(page, ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowUp", "End", "Home"]),
    ["b", "c", "c", "b", "w", "a"]
  );
  assert.deepEqual(errors, []);
  await page.close();
});

test("Enter still launches the tile the arrows landed on", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned }) });
  await page.evaluate(() => {
    const real = window.__TAURI__.core.invoke;
    window.launched = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === "launch_app") window.launched.push(args?.path || "");
      return real(cmd, args);
    };
  });
  await page.locator('#dock > .tile[data-id="a"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await waitForAsyncCondition(page, () => window.launched.includes("C:/b.exe"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("running tiles tell a screen reader they are running", async () => {
  const windows = `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) =>
    (c === "list_windows" || c === "running_windows")
      ? Promise.resolve([{ hwnd: 1, title: "Alpha one", exe: "C:/a.exe" }, { hwnd: 2, title: "Alpha two", exe: "C:/a.exe" }, { hwnd: 3, title: "Bravo", exe: "C:/b.exe" }])
      : old(c, a); }`;
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned }), initScript: windows });
  await waitForAsyncCondition(page, () => document.querySelector('#dock > .tile[data-id="a"]').dataset.running === "true");
  const said = await page.evaluate(() =>
    Object.fromEntries(["a", "b", "c"].map((id) => [id, document.querySelector(`#dock > .tile[data-id="${id}"]`).getAttribute("aria-description")])));
  assert.deepEqual(said, { a: "Running · 2 windows", b: "Running", c: null });
  assert.equal(await page.getAttribute('#dock > .tile[data-id="a"]', "aria-label"), "Alpha", "the name stays the name");
  assert.deepEqual(errors, []);
  await page.close();
});

async function contrastLook(page) {
  return page.evaluate(() => {
    const tile = document.querySelector('#dock > .tile[data-id="a"]');
    const cs = getComputedStyle(tile);
    const dock = getComputedStyle(document.getElementById("dock"));
    const sepLine = getComputedStyle(document.querySelector("#dock .sep-line"));
    return {
      border: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
      outline: `${cs.outlineWidth} ${cs.outlineStyle}`,
      blur: dock.backdropFilter,
      sepVisible: sepLine.backgroundColor !== "rgba(0, 0, 0, 0)",
    };
  });
}

test("Windows high contrast (forced colors) draws tile edges and a focus ring", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned }) });
  await page.emulateMedia({ forcedColors: "active" });
  await page.locator('#dock > .tile[data-id="a"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft"); // keyboard focus, so :focus-visible applies
  assert.deepEqual(await contrastLook(page), { border: "1px solid", outline: "2px solid", blur: "none", sepVisible: true });
  assert.deepEqual(errors, []);
  await page.close();

  for (const file of ["notch.html", "settings.html"]) {
    const other = await openPage(browser, port, file, { cfg: makeConfig({ pinned }), viewport: { width: 1200, height: 800 } });
    await other.page.emulateMedia({ forcedColors: "active" });
    await other.page.waitForTimeout(100);
    assert.deepEqual(other.errors, [], file);
    await other.page.close();
  }
});

test("the high-contrast flag from Windows works when forced colors does not match", async () => {
  const platform = `{ const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c, a) => c === "platform_capabilities"
    ? Promise.resolve({ build: 22631, systemBackdrop: true, highContrast: true, animations: true, transparency: false, accent: "#0078d4", accentOnTaskbar: false, systemLight: false })
    : old(c, a); }`;
  const { page, errors } = await openPage(browser, port, "index.html", { cfg: makeConfig({ pinned }), initScript: platform });
  await waitForAsyncCondition(page, () => document.documentElement.hasAttribute("data-high-contrast"));
  await page.locator('#dock > .tile[data-id="a"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  assert.deepEqual(await contrastLook(page), { border: "1px solid", outline: "2px solid", blur: "none", sepVisible: true });
  assert.deepEqual(errors, []);
  await page.close();

  const settings = await openPage(browser, port, "settings.html", { cfg: makeConfig({ pinned }), viewport: { width: 1200, height: 800 }, initScript: platform });
  await waitForAsyncCondition(settings.page, () => document.documentElement.hasAttribute("data-high-contrast"));
  const ink = await settings.page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--accent").trim());
  assert.equal(ink, "Highlight");
  assert.deepEqual(settings.errors, []);
  await settings.page.close();
});
