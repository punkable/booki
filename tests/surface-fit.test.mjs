import test from 'node:test';
import assert from 'node:assert/strict';
import { containedShape } from '../src/material-geometry.js';
import { serveDist, openPage, launchBrowser, makeConfig, everyKindPinned, assertBuilt } from './harness.mjs';

test('native material never extends past the rounded CSS outline', () => {
  const [x, y, w, h, ...radii] = containedShape([10, 20, 400, 60, 20, 20, 20, 20]);
  const d = 20 * (1 - Math.SQRT1_2);
  assert.ok(Math.abs(x - (10 + d)) < 1e-9 && Math.abs(y - (20 + d)) < 1e-9);
  assert.ok(Math.abs(w - (400 - 2 * d)) < 1e-9 && Math.abs(h - (60 - 2 * d)) < 1e-9);
  // The square corner of the inset rectangle lies on (or inside) the CSS arc.
  const cx = 10 + 20, cy = 20 + 20;
  assert.ok(Math.hypot(x - cx, y - cy) <= 20 + 1e-9);
  assert.ok(radii.every((r) => r >= 0 && r < 20));
  // An attached notch keeps its flush edge: only rounded sides move in.
  const notch = containedShape([0, 0, 120, 30, 12, 12, 0, 0]);
  assert.equal(notch[1] + notch[3] < 30 + 1e-9, true);
  assert.ok(Math.abs(notch[1] + notch[3] - 30) < 1e-9);
  assert.equal(containedShape([0, 0, 4, 4, 40, 40, 40, 40]), null);
});

test('settings dock previews scale to fit instead of scrolling', async () => {
  assertBuilt();
  const { srv, port } = await serveDist();
  const browser = await launchBrowser();
  try {
    for (const edge of ['bottom', 'left']) {
      const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ edge, pinned: everyKindPinned() }), viewport: { width: 900, height: 700 } });
      const scrollers = await page.evaluate(() => [...document.querySelectorAll('.live-preview-scene, .live-preview-scene *')]
        .filter((el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowX + s.overflowY); }).map((el) => el.className));
      assert.deepEqual(scrollers, [], `${edge}: preview must not scroll`);
      const fits = await page.evaluate(() => [...document.querySelectorAll('.live-preview-fit')].every((frame) => {
        const bar = frame.querySelector('.live-preview-bar').getBoundingClientRect();
        const box = frame.getBoundingClientRect();
        return bar.left >= box.left - 1 && bar.right <= box.right + 1;
      }));
      assert.ok(fits, `${edge}: whole bar visible`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); srv.close(); }
});
