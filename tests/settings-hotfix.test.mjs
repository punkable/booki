import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
import { formatReleaseDate, previousReleases } from '../src/release-notes.js';
import { formatHotkey } from '../src/settings/hotkey-labels.js';
import { WIDGET_ORDER } from '../src/widgets-meta.js';

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

/* Match serde's actual Option serialization, including explicit nulls. */
const nativePins = WIDGET_ORDER.map((widget) => ({ id: widget, name: widget, path: '', args: [], kind: 'widget', widget, style: null, icon: null, children: [], recents: [] }));
test('Home and every Settings section accept unstyled native widget records', async () => {
  const cfg = makeConfig({ pinned: nativePins });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg, viewport: { width: 960, height: 760 } });
  assert.equal(await page.locator('.home-hero').count(), 1);
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
  // Only the open card sits on Windows' blur; the slim tab is CSS-only.
  await page.hover('#notch-pill');
  await page.waitForFunction(() => document.body.classList.contains('card'));
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__materialReports = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'set_material') { window.__materialReports.push(args); return Promise.resolve(false); }
      return old(cmd, args);
    };
    window.__TAURI__.core.invoke('save_config', { patch: { surfaceColor: '#aa2233' } }).then(() => {
      for (const cb of window.__listeners['booki://config-changed'] || []) cb({ payload: {} });
    });
  });
  await page.waitForTimeout(900);
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
  await page.hover('#notch-pill');
  await page.waitForFunction(() => document.body.classList.contains('card'));
  await page.evaluate(async () => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'set_material' && args.shapes.length) return new Promise((resolve) => { window.__resolveMaterial = resolve; });
      return old(cmd, args);
    };
    await old('save_config', { patch: { surfaceColor: '#223344' } });
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

test('a pinned list that is not a list renders Home without rewriting settings', async () => {
  // Read as an empty dock instead of throwing while rendering.
  const cfg = makeConfig({ pinned: { invalid: true } });
  const { page } = await openPage(browser, port, 'settings.html', { cfg });
  await page.locator('.home-hero').waitFor();
  assert.equal(await page.locator('.settings-recovery').count(), 0);
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__TAURI__.core.invoke('get_config')), cfg);
  await page.close();
});

test('native blur keeps the configured dock fill and single CSS outline', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ surfaceStyle: 'tinted', surfaceColor: '#223344', cornerRadius: 22 }) });
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

test('release dates follow the reader\'s language and keep text that does not parse', () => {
  assert.equal(formatReleaseDate('2026-10-05', 'en'), 'Oct 5, 2026');
  assert.equal(formatReleaseDate('2 jul 2026', 'en'), 'Jul 2, 2026');
  assert.match(formatReleaseDate('26 sept 2026', 'de'), /^26\. Sep/);
  assert.equal(formatReleaseDate('soon', 'en'), 'soon');
});

test('a failed first config read shows an error with Retry instead of an empty window', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { initScript: `
    const invoke = window.__TAURI__.core.invoke;
    window.__configReads = 0;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'get_config' && ++window.__configReads === 1) return Promise.reject(new Error('backend not ready'));
      return invoke(cmd, args);
    };` });
  const alert = page.getByRole('alert');
  await alert.waitFor();
  assert.match(await alert.innerText(), /Settings couldn’t load/);
  const retry = alert.getByRole('button', { name: 'Retry', exact: true });
  assert.equal(await retry.evaluate((el) => el === document.activeElement), true, 'Retry has focus');
  await retry.click();
  await page.locator('.home-hero').waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('shortcut key names follow Windows in each language and fall back to the stored name', () => {
  assert.equal(formatHotkey('Ctrl+Shift+Space', 'es'), 'Ctrl+Mayús+Espacio');
  assert.equal(formatHotkey('Ctrl+Shift+Space', 'de'), 'Strg+Umschalt+Leertaste');
  assert.equal(formatHotkey('Ctrl+Shift+Space', 'fr'), 'Ctrl+Maj+Espace');
  assert.equal(formatHotkey('Super+Alt+K', 'en'), 'Win+Alt+K');
  assert.equal(formatHotkey('Ctrl+F13', 'xx'), 'Ctrl+F13');
  assert.equal(formatHotkey('', 'es'), '');
});

test('shortcut fields show localized key names, store English ones and always offer Clear', async () => {
  const cfg = makeConfig({ language: 'es', hotkey: '', launcherHotkey: 'Ctrl+Shift+Space', hotkeyModifier: 'Ctrl+Shift' });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg, viewport: { width: 1100, height: 900 } });
  await page.getByRole('navigation').getByRole('button', { name: 'Sistema', exact: true }).click();
  const fields = page.locator('.hotkey');
  await fields.first().waitFor();
  assert.equal(await fields.count(), 2);
  assert.equal(await fields.nth(1).locator('input').inputValue(), 'Ctrl+Mayús+Espacio');
  const clearToggle = fields.nth(0).getByRole('button', { name: 'Borrar', exact: true });
  assert.equal(await clearToggle.isDisabled(), true, 'nothing to clear on an empty shortcut');
  assert.ok(await page.getByRole('group', { name: 'Tecla modificadora' }).getByRole('button', { name: 'Mayús', exact: true }).count());
  await fields.nth(0).locator('input').press('Control+Shift+K');
  assert.equal(await fields.nth(0).locator('input').inputValue(), 'Ctrl+Mayús+K');
  assert.equal(await clearToggle.isDisabled(), false);
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).hotkey === 'Ctrl+Shift+K');
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.equal(saved.launcherHotkey, 'Ctrl+Shift+Space');
  assert.deepEqual(errors, []);
  await page.close();
});

for (const theme of ['dark', 'light']) {
  test(`Settings shows Mica behind the ${theme} page once Windows applies it, with solid cards`, async () => {
    const { page, errors } = await openPage(browser, port, 'settings.html', {
      cfg: makeConfig({ theme }), viewport: { width: 950, height: 790 },
      initScript: `const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='platform_capabilities'?Promise.resolve({systemBackdrop:true,transparency:true,animations:true,highContrast:false}):cmd==='settings_backdrop'?Promise.resolve(true):old(cmd,args);`,
    });
    await page.waitForFunction(() => document.body.classList.contains('settings-mica'));
    await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
    const clear = 'rgba(0, 0, 0, 0)';
    assert.equal(await page.locator('.settings-main').evaluate(el => getComputedStyle(el).backgroundColor), clear);
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), clear);
    assert.notEqual(await page.locator('.ui-group').first().evaluate(el => getComputedStyle(el).backgroundColor), clear);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('plugins have their own searchable page and installation stays deliberate', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', {
    initScript: `const old=window.__TAURI__.core.invoke;window.__pluginInstalls=[];window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='plugin_status')return Promise.resolve({installed:false});if(cmd==='plugin_install'){window.__pluginInstalls.push(args.id);return Promise.reject('Download unavailable');}return old(cmd,args);};`,
  });
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await page.locator('.plugin-card').count(), 0);
  await page.getByRole('combobox', { name: 'Search settings…' }).fill('HeadsetControl');
  await page.getByRole('option').filter({ hasText: 'Plugins' }).click();
  await page.locator('.page-plugins').waitFor();
  assert.equal(await page.locator('.plugin-card').count(), 6);
  assert.deepEqual(await page.evaluate(() => window.__pluginInstalls), []);
  const section = page.locator('.plugin-card').filter({ has: page.getByRole('heading', { name: 'HeadsetControl', exact: true }) });
  assert.equal(await section.getByRole('button', { name: 'Download and install', exact: true }).isDisabled(), true);
  // One acceptance for the page, not a checkbox on every card.
  assert.equal(await page.getByRole('checkbox', { name: /I accept the plugin terms/ }).count(), 1);
  await page.getByRole('checkbox', { name: /I accept the plugin terms/ }).check();
  await section.getByRole('button', { name: 'Download and install', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => ![...document.querySelectorAll('.plugin-card button')].find((b) => b.textContent === 'Download and install')?.disabled);
  await section.getByRole('button', { name: 'Download and install', exact: true }).click();
  const error = section.getByRole('alert');
  await error.waitFor();
  assert.match(await error.innerText(), /Download unavailable/);
  assert.equal(await error.evaluate(el => getComputedStyle(el).position), 'static');
  assert.deepEqual(await page.evaluate(() => window.__pluginInstalls), ['headsetcontrol']);
  assert.deepEqual(errors, []);
  await page.close();
});
