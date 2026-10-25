import { serveDist, launchBrowser, openPage, makeConfig } from "./harness.mjs";
const srv = await serveDist(); const browser = await launchBrowser();
const cfg = makeConfig({ pinned: [{ id: "g", kind: "group", name: "Hub", children: [{ id: "v", kind: "widget", widget: "volume" }, { id: "c", kind: "widget", widget: "clock" }] }] });
const { page, errors } = await openPage(browser, srv.port, "index.html", { cfg, viewport: { width: 1000, height: 800 } });
await page.waitForTimeout(1000);
await page.locator(".tile.group").click(); await page.locator("#stack.open").waitFor();
for (const id of ["v", "c"]) {
  await page.locator(`#stack [data-child-id="${id}"]`).click(); await page.waitForTimeout(600);
  const panel = await page.evaluate(() => !!document.querySelector(".productivity-panel.is-open"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(700);
  console.log(id, "panel:", panel, "group back:", await page.evaluate(() => !!document.querySelector("#stack.open")));
}
await page.mouse.click(5, 5); await page.waitForTimeout(500);
console.log(errors);
await browser.close(); process.exit(0);
