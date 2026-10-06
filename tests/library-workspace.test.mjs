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

test('a failed folder page preserves the visible entries and offers retry', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [{ id:'folder',name:'Files',kind:'folder',path:'C:/Files' }] }) });
  await page.evaluate(() => { const old=window.__TAURI__.core.invoke;window.__failNext=true;window.__TAURI__.core.invoke=(c,a)=>{ if(c==='list_dir'){if(a.offset>0 && window.__failNext){window.__failNext=false;return Promise.reject(new Error('unavailable'));}return Promise.resolve(Array.from({length:25},(_,i)=>({name:`File ${a.offset+i}`,path:`C:/Files/${a.offset+i}.txt`,is_dir:false})));}return old(c,a);}; });
  await page.locator('.tile[data-id="folder"]').click();
  await page.locator('.stack-pager').getByRole('button', { name:'Next', exact:true }).click();
  await page.locator('.stack-load-error').getByRole('alert').waitFor();
  assert.equal(await page.locator('.stack-item').filter({hasText:'File 0'}).count(),1);
  await page.locator('.stack-load-error').getByRole('button').click();
  await page.locator('.stack-item').filter({hasText:'File 24'}).waitFor();
  assert.equal(await page.locator('.stack-load-error').count(),0);
  assert.deepEqual(errors,[]);await page.close();
});

test('native HTML dragging reorders the persistent dock editor', async () => {
  const beta = { ...app, id: 'beta', name: 'Beta', path: 'C:/beta.exe' };
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ pinned: [app, beta] }), viewport: { width: 1200, height: 800 } });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.locator('.library-pin').filter({ hasText: 'Beta' }).dragTo(page.locator('.library-pin').filter({ hasText: 'Editor' }));
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned.map((p) => p.id)), ['beta', 'editor']);
  assert.deepEqual(errors, []); await page.close();
});

test('overlapping settings edits offer explicit recovery without losing unrelated changes', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.conflictedOnce = false;
    window.__TAURI__.core.invoke = async (command, args) => {
      if (command === 'save_config' && args.patch?.reduceTransparency !== undefined && !window.conflictedOnce) {
        window.conflictedOnce = true;
        await old('save_config', { patch: { edge: 'top' } });
        const current = await old('get_config');
        throw 'BOOKI_CONFIG_CONFLICT:' + JSON.stringify({ keys: ['reduceTransparency'], current: { ...current, revision: 2, reduceTransparency: false, edge: 'top' } });
      }
      return old(command, args);
    };
  });
  await page.getByRole('combobox').fill('Reduce transparency');
  await page.getByRole('option').filter({ hasText: 'Reduce transparency' }).click();
  await page.getByRole('switch', { name: 'Reduce transparency', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my changes', exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).reduceTransparency), true);
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).edge), 'top');
  assert.equal(await page.getByRole('button', { name: 'Keep my changes', exact: true }).count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test('notes autosave while editing and Ctrl+Enter closes after durable saving', async () => {
  const note = { id: 'note', kind: 'widget', widget: 'notes', name: 'Notes', style: { note: 'old' } };
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [note] }), viewport: { width: 1200, height: 800 } });
  await page.locator('.tile[data-id="note"]').click();
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('A saved draft');
  await page.waitForFunction(async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.note === 'A saved draft');
  assert.equal(await page.locator('.note-workspace').isVisible(), true);
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Final edit');
  await page.keyboard.press('Control+Enter');
  await page.locator('.note-workspace').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.note), 'Final edit');
  assert.deepEqual(errors, []); await page.close();
});

test('icon picker previews changes, cancellation preserves the pin and Apply commits the choice', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ pinned: [app] }), viewport: { width: 1200, height: 800 } });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.locator('.library-pin').getByRole('button', { name: 'Editor', exact: true }).click();
  await page.getByRole('button', { name: /Change icon/, exact: false }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose icon', exact: true });
  await dialog.getByRole('searchbox', { name: 'Search icons', exact: true }).fill('coffee');
  await dialog.getByRole('button', { name: 'coffee', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].icon), undefined);
  await page.getByRole('button', { name: /Change icon/, exact: false }).click();
  await dialog.getByRole('button', { name: 'coffee', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].icon === 'lib:coffee:badge');
  assert.deepEqual(errors, []); await page.close();
});

test('failed note autosave keeps the draft open and retry saves it before closing', async () => {
  const note = { id: 'note', kind: 'widget', widget: 'notes', name: 'Notes', style: { note: 'old' } };
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [note] }), viewport: { width: 1200, height: 800 } });
  await page.evaluate(() => { const old = window.__TAURI__.core.invoke; window.failNoteSave = true; window.__TAURI__.core.invoke = (command, args) => command === 'save_config' && window.failNoteSave ? Promise.reject('disk full') : old(command, args); });
  await page.locator('.tile[data-id="note"]').click();
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Keep this draft');
  await page.locator('.note-workspace').getByRole('button', { name: 'Retry', exact: true }).waitFor();
  await page.locator('.note-workspace').getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.getByRole('textbox', { name: 'Note', exact: true }).inputValue(), 'Keep this draft');
  await page.evaluate(() => { window.failNoteSave = false; });
  await page.locator('.note-workspace').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.note === 'Keep this draft');
  await page.locator('.note-workspace').getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.note-workspace').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []); await page.close();
});

test('a failed dock removal restores the pin and retains a retry instead of offering a false undo', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [app] }) });
  await page.evaluate(() => { const old = window.__TAURI__.core.invoke; window.failDockSave = true; window.__TAURI__.core.invoke = (command, args) => command === 'save_config' && window.failDockSave ? Promise.reject('disk full') : old(command, args); });
  await page.locator('.tile[data-id="editor"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove from dock', exact: true }).click();
  await page.locator('#undo-toast').getByRole('button', { name: 'Retry', exact: true }).waitFor();
  assert.equal(await page.locator('.tile[data-id="editor"]').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).count(), 0);
  await page.locator('#undo-toast').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#undo-toast').getByRole('button', { name: 'Retry', exact: true }).isEnabled(), true);
  await page.evaluate(() => { window.failDockSave = false; });
  await page.locator('#undo-toast').getByRole('button', { name: 'Retry', exact: true }).click();
  await page.locator('.tile[data-id="editor"]').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []); await page.close();
});
