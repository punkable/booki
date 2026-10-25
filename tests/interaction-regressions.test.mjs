import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const group = { id: 'g', kind: 'group', name: 'Work', children: [{ id: 'a', kind: 'app', name: 'Editor', path: 'C:/editor.exe' }] };
const signal = (page, name, payload) => page.evaluate(([name, payload]) => { for (const cb of window.__listeners[name] || []) cb({ payload }); }, [name, payload]);

test('style presets are shortcuts beside the style and never change the notch', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ notchMode: 'attached', notchTrigger: 'click' }) });
  await page.getByRole('navigation').getByRole('button', { name: 'Dock', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Compact', exact: true }).click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).spacing === 4);
  const cfg = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.equal(cfg.notchMode, 'attached'); assert.equal(cfg.notchTrigger, 'click');
  assert.deepEqual(errors, []); await page.close();
});

test('a conflict does not block unrelated edits and disappears when the remote value is resolved', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { initScript: `
    const old=window.__TAURI__.core.invoke; window.once=false;
    window.__TAURI__.core.invoke=async(cmd,args)=>{
      if(cmd==='save_config' && args.patch?.showLabels !== undefined && !window.once){
        window.once=true;
        const current={...await old('get_config'),showLabels:true,revision:2};
        throw 'BOOKI_CONFIG_CONFLICT:'+JSON.stringify({keys:['showLabels'],current});
      }
      return old(cmd,args);
    };` });
  await page.getByRole('combobox').fill('Show names on hover');
  await page.getByRole('option').filter({ hasText: 'Show names on hover' }).click();
  await page.getByRole('switch', { name: 'Show names on hover', exact: true }).click();
  await page.locator('.conflict-error').waitFor();
  await page.getByRole('navigation').getByRole('button', { name: 'Dock', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).theme === 'dark');
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).theme === 'light');
  assert.equal(await page.locator('.conflict-error').isVisible(), true);
  await page.evaluate(async () => { await window.__TAURI__.core.invoke('save_config',{patch:{showLabels:false,revision:3}}); });
  await signal(page, 'booki://config-changed', null);
  await waitForAsyncCondition(page, () => !document.querySelector('.conflict-error'));
  assert.deepEqual(errors, []); await page.close();
});

test('widget targets select the exact nested copy, including a repeated request in an open settings window', async () => {
  const pins = [{ id: 'one', kind: 'widget', widget: 'notes', style: { note: 'First' } }, { ...group, children: [{ id: 'two', kind: 'widget', widget: 'notes', style: { note: 'Second' } }] }];
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ pinned: pins }), initScript: `
    const old=window.__TAURI__.core.invoke; window.target='widget:two';
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='take_pending_tab'?Promise.resolve(window.target):old(cmd,args);` });
  const copy = page.getByRole('combobox', { name: 'Widget being configured', exact: true });
  await copy.waitFor();
  assert.equal(await copy.inputValue(), 'two');
  await copy.selectOption('one');
  assert.equal(await copy.inputValue(), 'one');
  await signal(page, 'booki://show-tab', null);
  await waitForAsyncCondition(page, () => document.querySelector('.inspector select')?.value === 'two');
  assert.deepEqual(errors, []); await page.close();
});

test('the dock sends the exact widget id from its settings command', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [{ id: 'battery-two', kind: 'widget', widget: 'battery' }] }), initScript: `
    const old=window.__TAURI__.core.invoke; window.routes=[];
    window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='open_settings_tab')window.routes.push(args.tab);return old(cmd,args);};` });
  await page.locator('[data-id="battery-two"]').dispatchEvent('contextmenu', { clientX: 400, clientY: 400 });
  await page.getByRole('menuitem', { name: /^Settings/ }).click();
  assert.deepEqual(await page.evaluate(() => window.routes), ['widget:battery-two']);
  assert.deepEqual(errors, []); await page.close();
});

test('click mode keeps the notch compact on hover and reveals only on activation', async () => {
  const { page, errors } = await openPage(browser, port, 'notch.html', { cfg: makeConfig({ notchTrigger: 'click', notchVisibility: 'always' }), initScript: `
    const old=window.__TAURI__.core.invoke;window.reveals=[];
    window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='notch_reveal'||cmd==='reveal_dock')window.reveals.push(cmd);return cmd==='media_info'?Promise.resolve({title:'Song',artist:'Band',playing:true}):old(cmd,args);};` });
  await page.hover('#notch-pill'); await page.waitForTimeout(600);
  assert.equal(await page.locator('body.card').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.reveals), []);
  await page.locator('#notch-pill').click();
  assert.deepEqual(await page.evaluate(() => window.reveals), ['notch_reveal']);
  assert.deepEqual(errors, []); await page.close();
});

test('click activation rejects stale hover and hot-edge signals while hover mode still reveals', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ autoHideMode: 'smart', notchTrigger: 'click', pinned: group.children, autoHideDelay: 2500 }) });
  await signal(page, 'booki://occlusion', true);
  await waitForAsyncCondition(page, () => document.body.classList.contains('tucked'));
  await signal(page, 'booki://soft-reveal', null);
  await signal(page, 'booki://hot-edge', null);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('body.tucked').count(), 1);
  await page.evaluate(() => window.__TAURI__.core.invoke('save_config', { patch: { notchTrigger: 'hover' } }));
  await signal(page, 'booki://config-changed', null);
  await page.waitForTimeout(150);
  await signal(page, 'booki://soft-reveal', null);
  await waitForAsyncCondition(page, () => !document.body.classList.contains('tucked'));
  assert.deepEqual(errors, []); await page.close();
});

for (const [theme, tint, expected] of [['dark', '#f3f3f3', 'rgb(27, 27, 27)'], ['light', '#0b1a2a', 'rgb(242, 242, 242)']]) {
  test(`group view commands retain readable ink with ${theme} theme and ${tint} glass`, async () => {
    const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ theme, surfaceStyle: 'glass', surfaceColor: tint, pinned: [group] }) });
    await page.locator('[data-id=g]').click();
    const view = page.locator('.group-view-button');
    assert.equal(await view.evaluate(el => getComputedStyle(el).color), expected);
    assert.equal(await view.evaluate(el => getComputedStyle(el).getPropertyValue('--focus-ring').trim()), expected === 'rgb(27, 27, 27)' ? '#1b1b1b' : '#f2f2f2');
    await view.click();
    const option = await page.locator('.group-view-option').first().evaluate(el => ({ ink: getComputedStyle(el).color, fill: getComputedStyle(el.parentElement).backgroundColor }));
    assert.equal(option.ink, expected); assert.notEqual(option.ink, option.fill);
    assert.notEqual(option.fill, 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await page.locator('#dock > [data-id=g]').dispatchEvent('contextmenu', { clientX: 400, clientY: 400 });
    await page.getByRole('menuitem', { name: 'Organize', exact: true }).click();
    const buttons = page.locator('#ctx-menu button');
    assert.ok(await buttons.count() > 2);
    assert.equal(await buttons.first().evaluate(el => getComputedStyle(el).color), expected);
    assert.deepEqual(errors, []); await page.close();
  });
}

test('capture UI preserves the group and hover scene, then ordinary blur closes it', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ captureVisible: true, autoHideMode: 'smart', pinned: [group] }), initScript: `
    const old=window.__TAURI__.core.invoke; window.capturing=true;
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='capture_session_active'?Promise.resolve(window.capturing):old(cmd,args);` });
  await page.locator('[data-id=g]').click();
  await signal(page, 'booki://capture-session', true);
  await page.evaluate(() => { document.hasFocus=()=>false; window.dispatchEvent(new Event('blur')); });
  await signal(page, 'booki://occlusion', true);
  await signal(page, 'booki://fullscreen', true);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#stack.open').count(), 1);
  assert.equal(await page.locator('body.tucked').count(), 0);
  await page.evaluate(() => { window.capturing=false; });
  await signal(page, 'booki://capture-session', false);
  await waitForAsyncCondition(page, () => !document.querySelector('#stack').classList.contains('open'));
  assert.deepEqual(errors, []); await page.close();
});

test('a capture keeps the magnified tile and tooltip after pointer leave and releases them afterward', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ captureVisible: true, pinned: group.children }), initScript: `
    const old=window.__TAURI__.core.invoke; window.capturing=true;
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='capture_session_active'?Promise.resolve(window.capturing):old(cmd,args);` });
  const tile = page.locator('#dock > [data-id=a]');
  await tile.hover();
  await page.locator('#booki-dock-tooltip.show').waitFor();
  await page.waitForTimeout(400); // the wave eases in; read it once it rests
  const transform = await tile.evaluate(el => el.style.transform);
  assert.ok(transform, 'hover has magnified the tile');
  await signal(page, 'booki://capture-session', true);
  await page.mouse.move(10, 10);
  await page.evaluate(() => { document.hasFocus=()=>false; window.dispatchEvent(new Event('blur')); });
  await page.waitForTimeout(400);
  assert.equal(await tile.evaluate(el => el.style.transform), transform);
  assert.equal(await page.locator('#booki-dock-tooltip.show').count(), 1);
  await page.evaluate(() => { window.capturing=false; });
  await signal(page, 'booki://capture-session', false);
  await waitForAsyncCondition(page, () => !document.querySelector('#booki-dock-tooltip.show'));
  // Released, the wave springs back to rest instead of snapping.
  await waitForAsyncCondition(page, () => document.querySelector('#dock > [data-id=a]').style.transform === '');
  assert.deepEqual(errors, []); await page.close();
});
