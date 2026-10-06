import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig } from './harness.mjs';
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const app = { id: 'editor', kind: 'app', name: 'Editor', path: 'C:/editor.exe', args: [] };

test('selecting a catalog app does not pin it; explicit add and undo preserve configuration', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { viewport: { width: 520, height: 680 } });
  await page.evaluate(() => { const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c,a) => c === 'list_installed_apps' ? Promise.resolve([{items:[{ name:'Editor',path:'C:/editor.exe' }]}]) : old(c,a); });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.getByRole('button', { name: 'Item details: Editor', exact: true }).click();
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned.length), 0);
  await page.getByRole('button', { name: 'Add app: Editor', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned.length), 0);
  assert.deepEqual(errors, []); await page.close();
});

test('late app recents cannot reopen a dismissed dock menu', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [app] }) });
  await page.evaluate(() => { const old = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c,a) => c === 'recent_files_for' ? new Promise((resolve) => { window.resolveRecents = resolve; }) : old(c,a); });
  await page.locator('.tile[data-id="editor"]').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.resolveRecents([{ name: 'Report.txt', path: 'C:/Report.txt' }]));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#ctx-menu').evaluate((e) => e.classList.contains('hidden')), true);
  assert.deepEqual(errors, []); await page.close();
});

test('folder navigation stays inside Booki and back restores the previous directory', async () => {
  const cfg = makeConfig({ pinned: [{ id:'folder',name:'Files',kind:'folder',path:'C:/Files' }] });
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg });
  await page.evaluate(() => { const old = window.__TAURI__.core.invoke; window.visited=[]; window.__TAURI__.core.invoke=(c,a)=>{ if(c === 'list_dir') {window.visited.push(a.path); return Promise.resolve(a.path==='C:/Files'?[{name:'Projects',path:'C:/Files/Projects',is_dir:true}]:[{name:'Readme.txt',path:'C:/Files/Projects/Readme.txt',is_dir:false}]);} return old(c,a); }; });
  await page.locator('.tile[data-id="folder"]').click();
  await page.locator('.stack-item').filter({ hasText: 'Projects' }).click();
  await page.locator('.stack-title').filter({ hasText: 'Projects' }).waitFor();
  await page.locator('.stack-back').click();
  await page.locator('.stack-title').filter({ hasText: 'Files' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.visited), ['C:/Files','C:/Files/Projects','C:/Files']);
  assert.deepEqual(errors, []); await page.close();
});

test('widget gallery previews a draft and commits its appearance only when added', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { viewport: { width: 520, height: 720 } });
  await page.getByRole('navigation').getByRole('button', { name: 'Widgets', exact: true }).click();
  await page.getByRole('button', { name: 'Item details: Clock', exact: true }).click();
  assert.equal(await page.locator('.modal[role="dialog"]').count(), 0);
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned.length), 0);
  await page.locator('.widget-inspector').getByRole('radio', { name: 'Solid', exact: true }).click();
  await page.locator('.widget-inspector').getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(250);
  const pins = await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned);
  assert.equal(pins.length, 1); assert.equal(pins[0].style.variant, 'solid');
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); await page.close();
});

test('an external Settings change immediately after a dock edit is not discarded', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [app] }) });
  await page.locator('.tile[data-id="editor"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove from dock', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.tile[data-id="editor"]'));
  await page.evaluate(async () => { await window.__TAURI__.core.invoke('save_config', { patch: { theme: 'light' } }); for (const cb of window.__listeners['booki://config-changed'] || []) cb({payload:{origin:'settings-test'}}); });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.deepEqual(errors, []); await page.close();
});
