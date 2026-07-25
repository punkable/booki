/* Geometry invariants for the dock bar.

   Every assertion here corresponds to a bug that actually shipped:
     - widget tiles taller than app tiles made the vertical bar grow and look
       ragged ("crece verticalmente el dock ... está desalineado");
     - the ring gauge and the preview icon square were sized from the raw icon
       size rather than the space left inside the card, so the artwork was
       silently clipped at the default icon size;
     - pinning the clipboard widget changed the bar's thickness. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBuilt,
  serveDist,
  launchBrowser,
  openPage,
  makeConfig,
  everyKindPinned,
  measureTiles,
  measureArtOverflow,
} from "./harness.mjs";

assertBuilt();

const { srv, port } = await serveDist();
const browser = await launchBrowser();

test.after(async () => {
  await browser.close();
  srv.close();
});

test("horizontal bar: every tile is the same height", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ edge: "bottom", pinned: everyKindPinned() }),
  });
  const { tiles } = await measureTiles(page);
  await page.close();

  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);
  assert.ok(tiles.length >= 14, `expected the full tile set, got ${tiles.length}`);

  const heights = [...new Set(tiles.filter((t) => t.id !== "sep1").map((t) => t.h))];
  assert.equal(
    heights.length,
    1,
    `tiles have ${heights.length} different heights (${heights.join(", ")}):\n` +
      tiles.map((t) => `  ${t.widget || t.id}: ${t.h}`).join("\n")
  );
});

test("vertical bar: every tile is the same width, and none is wider than the bar", async () => {
  for (const edge of ["left", "right"]) {
    const { page, errors } = await openPage(browser, port, "index.html", {
      cfg: makeConfig({ edge, pinned: everyKindPinned() }),
      viewport: { width: 500, height: 1000 },
    });
    const { dock, tiles } = await measureTiles(page);
    await page.close();

    assert.equal(errors.length, 0, `[${edge}] JS errors: ${errors.join("\n")}`);

    const widths = [...new Set(tiles.filter((t) => t.id !== "sep1").map((t) => t.w))];
    assert.equal(
      widths.length,
      1,
      `[${edge}] tiles have ${widths.length} different widths (${widths.join(", ")}):\n` +
        tiles.map((t) => `  ${t.widget || t.id}: ${t.w}`).join("\n")
    );

    for (const t of tiles) {
      assert.ok(
        t.w <= dock.w + 0.5,
        `[${edge}] ${t.widget || t.id} is ${t.w}px wide but the bar is only ${dock.w}px`
      );
    }
  }
});

test("vertical bar: widget tiles are the same height as app tiles", async () => {
  const { page, errors } = await openPage(browser, port, "index.html", {
    cfg: makeConfig({ edge: "left", pinned: everyKindPinned() }),
    viewport: { width: 500, height: 1000 },
  });
  const { tiles } = await measureTiles(page);
  await page.close();

  assert.equal(errors.length, 0, `JS errors: ${errors.join("\n")}`);

  const appH = tiles.find((t) => t.id === "app1").h;
  const offenders = tiles
    .filter((t) => t.kind === "widget" && Math.abs(t.h - appH) > 0.5)
    .map((t) => `${t.widget}: ${t.h} (app tile is ${appH})`);
  assert.deepEqual(offenders, [], `widget tiles do not match the app tile height:\n  ${offenders.join("\n  ")}`);
});

test("pinning a widget never changes the bar's thickness", async () => {
  const base = [{ id: "app1", kind: "app", name: "One", path: "C:/one.exe" }];

  for (const edge of ["bottom", "left"]) {
    const vertical = edge === "left";
    const viewport = vertical ? { width: 500, height: 1000 } : { width: 1600, height: 400 };
    const thickness = (box) => (vertical ? box.w : box.h);

    const bare = await openPage(browser, port, "index.html", {
      cfg: makeConfig({ edge, pinned: base }),
      viewport,
    });
    const bareBox = (await measureTiles(bare.page)).dock;
    await bare.page.close();

    for (const w of ["clipboard", "notes", "cpu", "media"]) {
      const withWidget = await openPage(browser, port, "index.html", {
        cfg: makeConfig({ edge, pinned: [...base, { id: `w-${w}`, kind: "widget", widget: w }] }),
        viewport,
      });
      const box = (await measureTiles(withWidget.page)).dock;
      await withWidget.page.close();

      assert.equal(
        thickness(box),
        thickness(bareBox),
        `[${edge}] pinning "${w}" changed the bar from ${thickness(bareBox)}px to ${thickness(box)}px`
      );
    }
  }
});

test("widget artwork fits inside its card at every icon size", async () => {
  // 30 is the floor fitDock() can shrink to; 48 is the default; 64 is the max.
  for (const iconSize of [30, 48, 64]) {
    const { page, errors } = await openPage(browser, port, "index.html", {
      cfg: makeConfig({ iconSize, pinned: everyKindPinned() }),
    });
    const art = await measureArtOverflow(page);
    await page.close();

    assert.equal(errors.length, 0, `[size ${iconSize}] JS errors: ${errors.join("\n")}`);
    assert.ok(art.length > 0, `[size ${iconSize}] no ring/preview widgets measured`);

    const clipped = art.filter((a) => a.overflow > 0.5);
    assert.deepEqual(
      clipped,
      [],
      `[size ${iconSize}] artwork is clipped by its card:\n` +
        clipped.map((a) => `  ${a.widget}: art ${a.art}px in a ${a.box}px box (+${a.overflow})`).join("\n")
    );
  }
});
