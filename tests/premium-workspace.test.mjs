import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig } from './harness.mjs';
let srv, port, browser;
test.before(async () => { ({ srv, port } = await serveDist()); browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); srv?.close(); });
async function mockApps(page, fail = false) {
  await page.evaluate((fail) => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (command, args) => {
      if (command === 'frequent_apps') return Promise.resolve([{ name: 'Zed', path: 'C:/zed.exe' }]);
      if (command === 'list_installed_apps') return fail ? Promise.reject(new Error('Start menu unavailable')) : Promise.resolve([{ items: [{ name: 'Alpha', path: 'C:/alpha.exe' }, { name: 'Beta', path: 'C:/beta.exe' }] }]);
      return old(command, args);
    };
  }, fail);
}
test('bulk selection retains apps across searches and adds them together', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await mockApps(page); await page.getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select app: Alpha', exact: true }).check();
  await page.locator('.app-library-tools input').fill('Beta');
  await page.getByRole('checkbox', { name: 'Select app: Beta', exact: true }).check();
  await page.getByRole('button', { name: 'Add selected (2)', exact: true }).click();
  await page.waitForTimeout(300);
  const cfg = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.deepEqual(cfg.pinned.map((p) => p.name), ['Alpha', 'Beta']);
  assert.deepEqual(errors, []); await page.close();
});
test('partial discovery failure reports the problem while retaining usable recommendations', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await mockApps(page, true); await page.getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Some app sources' }).waitFor();
  assert.equal(await page.locator('.app-library-card').filter({ hasText: 'Zed' }).count(), 1);
  await page.getByRole('button', { name: 'Hide suggestion: Zed', exact: true }).click();
  assert.equal(await page.locator('.app-library-card').filter({ hasText: 'Zed' }).count(), 0);
  await page.getByText('Recommendations & privacy', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore hidden suggestions', exact: true }).click();
  assert.equal(await page.locator('.app-library-card').filter({ hasText: 'Zed' }).count(), 1);
  assert.deepEqual(errors, []); await page.close();
});
test('finish presets preserve pins and the library fits a narrow Settings window', async () => {
  const cfg = makeConfig({ pinned: [{ id: 'editor', name: 'Editor', kind: 'app', path: 'C:/editor.exe' }] });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg, viewport: { width: 520, height: 680 } });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Tinted Glass', exact: true }).click();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.deepEqual(saved.pinned, cfg.pinned); assert.equal(saved.surfaceStyle, 'tinted');
  await mockApps(page); await page.getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.locator('.app-library-card').first().waitFor();
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); await page.close();
});
test('search focuses the requested control instead of leaving focus in the search box', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  const search = page.getByRole('combobox'); await search.fill('Reduce transparency');
  await page.getByRole('option').filter({ hasText: 'Reduce transparency' }).click();
  await page.getByRole('switch', { name: 'Reduce transparency', exact: true }).waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.getByRole('switch', { name: 'Reduce transparency', exact: true }).evaluate((el) => el === document.activeElement), true);
  assert.deepEqual(errors, []); await page.close();
});
test('failed profile save keeps the name and explains the failure for retry', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (command, args) => command === 'profile_save' ? Promise.reject(new Error('disk full')) : old(command, args);
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Profiles & backup', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /^Dock profiles/ }).getAttribute('aria-expanded'), 'true');
  await page.getByPlaceholder('Name (e.g. Work)').fill('Work');
  await page.getByRole('button', { name: 'Save current', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByPlaceholder('Name (e.g. Work)').inputValue(), 'Work');
  assert.equal(await page.getByRole('button', { name: 'Save current', exact: true }).isEnabled(), true);
  assert.deepEqual(errors, []); await page.close();
});
async function mockUpdate(page, managed) {
  await page.evaluate((managed) => {
    const old = window.__TAURI__.core.invoke;
    window.__updateCalls = [];
    window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => window.__TAURI__.core.invoke(cmd, args), transformCallback: () => 1 };
    window.__TAURI__.core.invoke = async (cmd, args) => {
      if (cmd === 'quiet_update_supported') return managed;
      if (cmd === 'plugin:updater|check') return { rid: 1, version: '0.71.0', currentVersion: '0.70.0', body: 'Example release notes' };
      if (cmd === 'acquire_update_lock') { window.__updateCalls.push('lock'); return true; }
      if (cmd === 'plugin:updater|download') { window.__updateCalls.push('download'); args.onEvent.onmessage({ event: 'Started', data: { contentLength: 10 } }); args.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 10 } }); return 2; }
      if (cmd === 'prepare_update') { window.__updateCalls.push('backup'); return; }
      if (cmd === 'plugin:updater|install') { window.__updateCalls.push('install'); return; }
      if (cmd === 'launch_app') { window.__updateCalls.push(args.path); return; }
      return old(cmd, args);
    };
  }, managed);
}
test('an MSI or unregistered copy opens releases without downloading or installing another copy', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await mockUpdate(page, false);
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Open release downloads', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__updateCalls), ['https://github.com/punkable/booki/releases/latest']);
  assert.deepEqual(errors, []); await page.close();
});
test('managed update downloads separately, stays ready across tabs and backs up before applying', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await mockUpdate(page, true);
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Download in background', exact: true }).click();
  await page.getByRole('button', { name: 'Restart and apply update', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__updateCalls), ['lock', 'download']);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Restart and apply update', exact: true }).click();
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => window.__updateCalls), ['lock', 'download', 'backup', 'install']);
  assert.deepEqual(errors, []); await page.close();
});
test('an update backup failure explains the apply problem and keeps the download ready without installing', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await mockUpdate(page, true);
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => cmd === 'prepare_update' ? Promise.reject(new Error('disk full')) : old(cmd, args);
  });
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Download in background', exact: true }).click();
  await page.getByRole('button', { name: 'Restart and apply update', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not apply the update' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Restart and apply update', exact: true }).isEnabled(), true);
  assert.ok(!(await page.evaluate(() => window.__updateCalls)).includes('install'));
  assert.deepEqual(errors, []); await page.close();
});
