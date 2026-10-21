/* global document, window */
/* Real frontend, deterministic example data. No user's desktop or private data.
 * Native Windows acrylic is outside this browser capture's scope. */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertBuilt, serveDist, launchBrowser, openPage, makeConfig } from "../tests/harness.mjs";
import { root, version, hash, sourceFingerprint } from "./release-docs.mjs";

if (process.env.BOOKI_EDITION === "dev" || process.env.VITE_BOOKI_EDITION === "dev") throw new Error("Public screenshots require the official frontend build, not Booki Dev.");
assertBuilt();
if (readFileSync(join(root, "dist/settings.html"), "utf8").includes("Booki Dev")) throw new Error("Rebuild the official frontend before capturing public screenshots.");
const files = {};
const { srv, port } = await serveDist();
const browser = await launchBrowser();
const pinned = [
  { id: "files", kind: "app", name: "Files", path: "C:/Examples/Files.exe", icon: "lib:folder:badge" },
  { id: "browser", kind: "app", name: "Browser", path: "C:/Examples/Browser.exe", icon: "lib:globe:badge" },
  { id: "work", kind: "group", name: "Work", style: { color: "#d5b487" }, children: [{ id: "notes", kind: "widget", widget: "notes", style: { note: "Example project notes" } }] },
  { id: "clock", kind: "widget", widget: "clock" },
  { id: "system", kind: "widget", widget: "system", style: { metrics: ["cpu", "ram"] } },
  { id: "focus", kind: "widget", widget: "focus", style: { minutes: 25 } },
  { id: "collector", kind: "widget", widget: "collector" },
];
const fixedClock = `{
  const RealDate = Date; const at = new RealDate("2026-10-21T09:41:00").getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [at])); } static now() { return at; } };
}`;
async function capture(page, name, language, errors) {
  if (errors.length) throw new Error(`${name}/${language}: ${errors.join("; ")}`);
  const path = `docs/presentation/${name}-${language}.jpg`;
  await page.screenshot({ path: join(root, path), type: "jpeg", quality: 90 });
  files[path] = hash(path);
}
try {
  for (const language of ["en", "es"]) {
    const cfg = makeConfig({ language, theme: "light", pinned, notchVisibility: "always", notchMode: "smart" });
    const dock = await openPage(browser, port, "index.html", { cfg, viewport: { width: 1200, height: 240 }, initScript: fixedClock });
    await dock.page.evaluate(() => { document.body.style.background = "#dbd9d4"; });
    await capture(dock.page, "hero", language, dock.errors);
    await dock.page.close();
    const notch = await openPage(browser, port, "notch.html", { cfg, viewport: { width: 640, height: 80 }, initScript: fixedClock });
    await notch.page.evaluate(() => {
      document.body.style.background = "#dbd9d4";
      for (const cb of window.__listeners["booki://agent-activity"] || []) cb({ payload: { provider: "claude", state: "working", since: Date.now() } });
    });
    await notch.page.waitForTimeout(450);
    await capture(notch.page, "island", language, notch.errors);
    await notch.page.close();
    const settings = await openPage(browser, port, "settings.html", { cfg, viewport: { width: 1180, height: 760 }, initScript: fixedClock });
    const nav = settings.page.locator(".nav .nav-item:not(.nav-quit)");
    for (const [name, index] of [["settings", 0], ["groups", 3], ["widgets", 2]]) {
      await nav.nth(index).click();
      await settings.page.waitForTimeout(350);
      await capture(settings.page, name, language, settings.errors);
    }
    await settings.page.close();
    const dark = await openPage(browser, port, "settings.html", { cfg: { ...cfg, theme: "dark" }, viewport: { width: 1180, height: 760 }, initScript: fixedClock });
    await dark.page.locator(".nav .nav-item:not(.nav-quit)").nth(1).click();
    await dark.page.waitForTimeout(350);
    await capture(dark.page, "dark", language, dark.errors);
    await dark.page.close();
  }
  writeFileSync(join(root, "docs/presentation/release-captures.json"), `${JSON.stringify({ version, edition: "official", source: sourceFingerprint(), kind: "browser frontend with example data; native blur not verified", files }, null, 2)}\n`);
  console.log(`Captured ${Object.keys(files).length} current README images for ${version}.`);
} finally { await browser.close(); srv.close(); }
