/* Runtime smoke: the three windows boot and the common interactions run
   without throwing.

   The battery case is the reason this file exists. `battery` is a ring widget,
   so its tile has no `.w-value`; the "no battery in this machine" branch called
   a helper that assumes one, so every desktop PC with the widget pinned threw a
   TypeError every 2.4s forever. Nothing caught it because nothing ran the dock. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBuilt,
  serveDist,
  launchBrowser,
  openPage,
  makeConfig,
  everyKindPinned,
  ALL_WIDGETS,
} from "./harness.mjs";

assertBuilt();

const { srv, port } = await serveDist();
const browser = await launchBrowser();

test.after(async () => {
  await browser.close();
  srv.close();
});

test("dock boots with every widget pinned, in both orientations", async () => {
  for (const edge of ["bottom", "top", "left", "right"]) {
    const vertical = edge === "left" || edge === "right";
    const { page, errors } = await openPage(browser, port, "index.html", {
      cfg: makeConfig({ edge, pinned: everyKindPinned() }),
      viewport: vertical ? { width: 500, height: 1000 } : { width: 1600, height: 400 },
    });
    const rendered = await page.evaluate(
      () => [...document.querySelectorAll(".tile.widget")].map((el) => el.dataset.widget)
    );
    await page.close();

    assert.equal(errors.length, 0, `[${edge}] JS errors:\n${errors.join("\n")}`);
    for (const w of ALL_WIDGETS) {
      assert.ok(rendered.includes(w), `[${edge}] widget "${w}" did not render`);
    }
  }
});

test("a machine with no battery does not throw", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: [{ id: "w-battery", kind: "widget", widget: "battery" }] }),
    // What Windows reports on a desktop: no battery present.
    stats: { battery: -1, charging: false },
  });
  // Long enough for several poll ticks — the original bug threw on every one.
  await page.waitForTimeout(2600);
  await page.close();

  assert.equal(errors.length, 0, `JS errors on a batteryless machine:\n${errors.join("\n")}`);
});

test("widgets keep updating across poll ticks", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: everyKindPinned() }),
  });
  await page.waitForTimeout(2600);
  const values = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll(".tile.widget")].map((el) => [
        el.dataset.widget,
        (el.querySelector(".w-ring-num, .w-value, .w-pv-sub")?.textContent || "").trim(),
      ])
    )
  );
  await page.close();

  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
  // Placeholder text means the poll never landed a real value.
  for (const [w, v] of Object.entries(values)) {
    assert.notEqual(v, "…", `widget "${w}" is still showing its placeholder`);
  }
});

test("group flyout, context menu and clipboard panel open and close cleanly", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: everyKindPinned() }),
  });

  await page.click('.tile[data-id="grp1"]');
  await page.waitForTimeout(400);
  assert.ok(
    await page.evaluate(() => document.getElementById("stack").classList.contains("open")),
    "group flyout did not open"
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.click('.tile[data-id="app1"]', { button: "right" });
  await page.waitForTimeout(300);
  assert.ok(
    await page.evaluate(() => !document.getElementById("ctx-menu").classList.contains("hidden")),
    "context menu did not open"
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.click('.tile[data-id="w-clipboard"]');
  await page.waitForTimeout(400);
  assert.ok(
    await page.evaluate(() => document.getElementById("stack").classList.contains("open")),
    "clipboard panel did not open"
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.close();
  assert.equal(errors.length, 0, `JS errors:\n${errors.join("\n")}`);
});

test("hovering the bar (magnify) does not throw", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ pinned: everyKindPinned() }),
  });
  const box = await page.evaluate(() => {
    const r = document.getElementById("dock").getBoundingClientRect();
    return { x: r.left, y: r.top + r.height / 2, w: r.width };
  });
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(box.x + (box.w * i) / 10, box.y);
  }
  await page.waitForTimeout(300);
  await page.close();

  assert.equal(errors.length, 0, `JS errors while magnifying:\n${errors.join("\n")}`);
});

test("the notch window boots on every edge", async () => {
  for (const edge of ["bottom", "top", "left", "right"]) {
    const { page, errors } = await openPage(browser, port, "notch.html", {
      cfg: makeConfig({ edge }),
      viewport: { width: 400, height: 400 },
    });
    const ok = await page.evaluate(() => !!document.getElementById("notch-pill"));
    await page.close();

    assert.ok(ok, `[${edge}] the notch pill did not render`);
    assert.equal(errors.length, 0, `[${edge}] JS errors: ${errors.join("\n")}`);
  }
});

test("Settings mounts and every tab renders", async () => {
  const { page, errors } = await openPage(browser, port, "settings.html", {
    viewport: { width: 1100, height: 850 },
  });

  const tabs = await page.$$(".s-navitem");
  assert.ok(tabs.length >= 5, `expected the full tab list, got ${tabs.length}`);
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].click();
    await page.waitForTimeout(350);
    const filled = await page.evaluate(
      () => (document.querySelector(".s-content")?.textContent || "").trim().length
    );
    assert.ok(filled > 40, `tab ${i} rendered an empty panel`);
  }

  await page.close();
  assert.equal(errors.length, 0, `JS errors in Settings:\n${errors.join("\n")}`);
});
