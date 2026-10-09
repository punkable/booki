import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig } from './harness.mjs';
import { previousReleases } from '../src/release-notes.js';
import { WIDGET_ORDER } from '../src/widgets-meta.js';

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

/* Match serde's actual Option serialization, including explicit nulls. */
const nativePins = WIDGET_ORDER.map((widget) => ({ id: widget, name: widget, path: '', args: [], kind: 'widget', widget, style: null, icon: null, children: [], recents: [] }));
test('Home and every Settings section accept unstyled native widget records', async () => {
  const cfg = makeConfig({ pinned: nativePins });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg, viewport: { width: 960, height: 760 } });
  assert.equal(await page.locator('.hero').count(), 1);
  assert.equal(await page.locator('.live-preview-bar .widget').count(), WIDGET_ORDER.length);
  const nav = page.getByRole('navigation');
  const names = await nav.locator('button').allTextContents();
  for (const name of names) {
    await nav.getByRole('button', { name: name.trim(), exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.settings-recovery').count(), 0, name);
    assert.ok(await page.locator('.settings-main').innerText(), name);
  }
  assert.deepEqual((await page.evaluate(() => window.__TAURI__.core.invoke('get_config'))).pinned, nativePins);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the current changelog renders every section icon as SVG', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  await page.locator('.about').getByRole('button', { name: "What's new", exact: true }).click();
  await page.locator('.release-section h3').first().waitFor();
  await page.locator('.release-history > summary').click();
  const history = page.locator('.release-history-entry');
  for (let i = 0; i < previousReleases().length; i++) {
    await history.nth(i).locator('summary').click();
    await history.nth(i).locator('.release-section h3').first().waitFor();
  }
  const titles = page.locator('.release-section h3');
  assert.ok(await titles.count() > 0);
  assert.equal(await titles.locator('.release-icon svg').count(), await titles.count());
  assert.equal(await page.locator('.release-section h3 .release-icon').allTextContents().then((texts) => texts.join('')), '');
  assert.deepEqual(errors, []);
  await page.close();
});

test('native material reports four corners and retains fallback after failure', async () => {
  const { page, errors } = await openPage(browser, port, 'notch.html', { cfg: makeConfig({ notchMode: 'attached', notchPeek: true }) });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__materialReports = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'set_material') { window.__materialReports.push(args); return Promise.resolve(false); }
      return old(cmd, args);
    };
    window.__TAURI__.core.invoke('save_config', { patch: { surfaceTint: '#aa2233' } }).then(() => {
      for (const cb of window.__listeners['booki://config-changed'] || []) cb({ payload: {} });
    });
  });
  await page.waitForTimeout(400);
  const reports = await page.evaluate(() => window.__materialReports);
  assert.ok(reports.length);
  const shape = reports.find((r) => r.shapes.length)?.shapes[0];
  assert.equal(shape?.length, 8);
  assert.equal(shape[6], 0); assert.equal(shape[7], 0);
  assert.ok(shape[4] > 0 && shape[5] > 0);
  assert.equal(await page.locator('body.native-material').count(), 0);
  assert.ok(reports.length <= 3, 'failed material must not retry every animation frame');
  assert.deepEqual(errors, []);
  await page.close();
});

test('a late material reply cannot re-enable glass after the user disables it', async () => {
  const { page, errors } = await openPage(browser, port, 'notch.html');
  await page.evaluate(async () => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'set_material' && args.shapes.length) return new Promise((resolve) => { window.__resolveMaterial = resolve; });
      return old(cmd, args);
    };
    await old('save_config', { patch: { surfaceTint: '#223344' } });
    for (const cb of window.__listeners['booki://config-changed'] || []) cb({ payload: {} });
  });
  await page.waitForFunction(() => !!window.__resolveMaterial);
  await page.evaluate(async () => {
    await window.__TAURI__.core.invoke('save_config', { patch: { nativeMaterial: false } });
    for (const cb of window.__listeners['booki://config-changed'] || []) cb({ payload: {} });
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__resolveMaterial(true));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('body.native-material').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('an injected Home render failure preserves navigation without rewriting settings', async () => {
  // A pinned list that is not a list makes Home's summary throw while rendering.
  const cfg = makeConfig({ pinned: { invalid: true } });
  const { page } = await openPage(browser, port, 'settings.html', { cfg });
  await page.locator('.settings-recovery').waitFor();
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await page.locator('.settings-recovery').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__TAURI__.core.invoke('get_config')), cfg);
  await page.close();
});

test('native blur keeps the configured dock fill and single CSS outline', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ surfaceStyle: 'tinted', surfaceTint: '#223344', cornerRadius: 22 }) });
  const read = () => page.locator('.dock').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fill: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
  });
  const before = await read();
  await page.evaluate(() => document.body.classList.add('native-material'));
  await page.waitForTimeout(250);
  const after = await read();
  assert.equal(after.fill, before.fill);
  assert.equal(after.border, '1px');
  assert.equal(after.radius, before.radius);
  assert.equal(after.shadow.includes('inset'), false);
  assert.deepEqual(errors, []);
  await page.close();
});
