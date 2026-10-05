import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig } from './harness.mjs';
import { WIDGET_ORDER } from '../src/widgets-meta.js';

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

/* Match serde's actual Option serialization, including explicit nulls. */
const nativePins = WIDGET_ORDER.map((widget) => ({ id: widget, name: widget, path: '', args: [], kind: 'widget', widget, style: null, icon: null, children: [], recents: [] }));
test('Home and every Settings section accept unstyled native widget records', async () => {
  const cfg = makeConfig({ pinned: nativePins });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg, viewport: { width: 960, height: 760 } });
  assert.equal(await page.locator('.dashboard-hero').count(), 1);
  assert.equal(await page.locator('.live-preview-bar .widget').count(), WIDGET_ORDER.length);
  const nav = page.getByRole('navigation');
  const names = await nav.locator('button').allTextContents();
  for (const name of names) {
    await nav.getByRole('button', { name: name.trim(), exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.settings-recovery').count(), 0, name);
    assert.ok(await page.locator('.s-content').innerText(), name);
  }
  assert.deepEqual((await page.evaluate(() => window.__TAURI__.core.invoke('get_config'))).pinned, nativePins);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the current changelog renders every section icon as SVG', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await page.getByRole('navigation').getByRole('button', { name: 'About', exact: true }).click();
  await page.getByRole('button', { name: "What's new", exact: true }).click();
  await page.locator('.cl-section-title').first().waitFor();
  await page.locator('.cl-history > summary').click();
  await page.locator('.cl-history-entry').first().locator('summary').click();
  await page.locator('.cl-history-entry').first().locator('.cl-section-title').first().waitFor();
  assert.equal(await page.locator('.cl-section-title .cl-ico svg').count(), 5);
  assert.equal(await page.locator('.cl-section-title .cl-ico').allTextContents().then((texts) => texts.join('')), '');
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
  const cfg = makeConfig({ lastProfile: { invalidLabel: true }, pinned: nativePins });
  const { page } = await openPage(browser, port, 'settings.html', { cfg });
  await page.locator('.settings-recovery').waitFor();
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await page.locator('.settings-recovery').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__TAURI__.core.invoke('get_config')), cfg);
  await page.close();
});
