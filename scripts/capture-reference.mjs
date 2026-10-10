/* Reference screenshots of every finish and every Settings page, in light and
   dark, from the built frontend with the tests' fake bridge. Compare a new
   build against docs/quality/reference/ by eye before a release.

   Browser renders cannot show native blur or Mica (those come from Windows),
   so the glass and Mica captures show the page-side fallback, not the final
   look on a desktop. Run `npm run build` first. */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, makeConfig, assertBuilt } from "../tests/harness.mjs";
import { FINISH_PRESETS } from "../src/surface.js";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "quality", "reference");
mkdirSync(out, { recursive: true });
assertBuilt();

const pinned = [
  { id: "a1", kind: "app", name: "Files", path: "C:/Examples/Files.exe" },
  { id: "a2", kind: "app", name: "Browser", path: "C:/Examples/Browser.exe" },
  { id: "a3", kind: "app", name: "Mail", path: "C:/Examples/Mail.exe" },
  { id: "s1", kind: "separator" },
  { id: "g1", kind: "group", name: "Work", children: [{ id: "k1", kind: "app", name: "Notes", path: "C:/Examples/Notes.exe" }] },
  { id: "w1", kind: "widget", widget: "clock" },
  { id: "w2", kind: "widget", widget: "system", style: { metrics: ["cpu", "ram"] } },
  { id: "w3", kind: "widget", widget: "focus" },
];
// A fixed 9:41 clock, so a new capture differs only where the UI changed.
const fixedClock = `{
  const fixed = new Date("2026-10-10T09:41:00").getTime();
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
}`;
const PAGES = ["home", "dock", "widgets", "apps", "system"];
const written = [];

const { srv, port } = await serveDist();
const browser = await launchBrowser();
const failOn = (name, errors) => {
  if (errors.length) throw new Error(`${name}:\n${errors.join("\n")}`);
};
try {
  for (const theme of ["light", "dark"]) {
    for (const finish of FINISH_PRESETS) {
      const cfg = makeConfig({ theme, pinned, ...finish.patch });
      const { page, errors } = await openPage(browser, port, "index.html", { cfg, viewport: { width: 1200, height: 360 }, initScript: fixedClock });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      const bar = await page.locator("#dock").boundingBox();
      const file = `dock-${finish.id}-${theme}.png`;
      await page.screenshot({ path: resolve(out, file), clip: { x: bar.x - 24, y: bar.y - 24, width: bar.width + 48, height: bar.height + 48 } });
      failOn(file, errors);
      written.push(file);
      await page.close();
    }
    const { page, errors } = await openPage(browser, port, "settings.html", { cfg: makeConfig({ theme, pinned }), viewport: { width: 1180, height: 760 }, initScript: fixedClock });
    const nav = page.locator(".nav .nav-item:not(.nav-quit)");
    for (const [index, id] of PAGES.entries()) {
      await nav.nth(index).click();
      await page.waitForTimeout(350);
      const file = `settings-${id}-${theme}.png`;
      await page.screenshot({ path: resolve(out, file) });
      written.push(file);
    }
    failOn(`settings-${theme}`, errors);
    await page.close();
  }
  console.log(`Wrote ${written.length} reference screenshots to docs/quality/reference/.`);
} finally {
  await browser.close();
  srv.close();
}
