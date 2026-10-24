import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
import { WIDGET_ORDER } from '../src/widgets-meta.js';
import { clockParts } from '../src/dock/widget-view.js';
import { pinnedWidgetInstances, pluginsForWidget } from '../src/widget-integrations.js';
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const widget = (type, style = {}) => ({ id: type, kind: 'widget', widget: type, style });
const routing = `const old=window.__TAURI__.core.invoke;window.routes=[];window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='open_settings'||cmd==='open_settings_tab')window.routes.push(cmd);return old(cmd,args);};`;
const settings = async (cfg, initScript = '', viewport = { width: 1150, height: 850 }) => {
  const opened = await openPage(browser, port, 'settings.html', { cfg: makeConfig(cfg), initScript, viewport });
  await opened.page.getByRole('navigation').getByRole('button', { name: 'Widgets', exact: true }).click();
  return opened;
};
const inspect = async (page, name) => page.locator('.catalog-card').filter({ hasText: name }).first().click();

for (const grouped of [false, true]) test(`all 15 ${grouped ? 'grouped' : 'dock'} widgets open usable content without entering Settings`, async () => {
  for (const type of WIDGET_ORDER) {
    const pin = widget(type);
    const cfg = { pinned: grouped ? [{ id: 'group', kind: 'group', name: 'Tools', children: [pin] }] : [pin], magnification: false };
    const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig(cfg), initScript: routing });
    if (grouped) await page.locator('#dock > [data-id=group]').click();
    await page.locator(`${grouped ? '#stack' : '#dock'} .tile[data-id="${type}"]`).click();
    const panel = type === 'notes' ? '.note-editor' : type === 'clipboard' ? '#stack.open .clip-list' : '.productivity-panel.is-open';
    await page.locator(panel).waitFor();
    assert.deepEqual(await page.evaluate(() => window.routes), [], type);
    assert.deepEqual(errors, [], type); await page.close();
  }
});

test('double clicking a widget never routes into its configuration', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [widget('battery')] }), initScript: routing });
  await page.locator('[data-id=battery]').dblclick();
  assert.deepEqual(await page.evaluate(() => window.routes), []);
  assert.deepEqual(errors, []); await page.close();
});

test('settings advance by accessible steps and retain functional choices separately from appearance', async () => {
  const { page, errors } = await settings({ pinned: [widget('clock')] }, '', { width: 520, height: 760 });
  await inspect(page, 'Clock');
  const content = page.getByRole('tab', { name: 'Content', exact: true });
  assert.equal(await content.getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('radiogroup', { name: 'Look', exact: true }).count(), 0);
  await page.getByRole('combobox', { name: 'Time format', exact: true }).selectOption('24');
  await page.getByRole('switch', { name: 'Show seconds', exact: true }).click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page.getByRole('radio', { name: 'Solid', exact: true }).click();
  await waitForAsyncCondition(page, async () => { const style=(await window.__TAURI__.core.invoke('get_config')).pinned[0].style;return style.hourCycle==='24'&&style.showSeconds&&style.variant==='solid'; });
  await page.getByRole('tab', { name: 'Appearance', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await content.getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('combobox', { name: 'Time format', exact: true }).inputValue(), '24');
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); await page.close();
});

test('all 15 widgets have a content step and a separate appearance step', async () => {
  for (const type of WIDGET_ORDER) {
    const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ pinned: [widget(type)] }), initScript: `const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='take_pending_tab'?Promise.resolve('widget:${type}'):old(cmd,args);` });
    await page.getByRole('tab', { name: 'Content', exact: true }).waitFor();
    assert.ok((await page.getByRole('tabpanel').innerText()).trim().length > 0, type);
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Look', exact: true }).waitFor();
    assert.deepEqual(errors, [], type); await page.close();
  }
});

test('clock preferences change the rendered time and date independently for each instance', () => {
  const now = new Date(2026, 9, 23, 13, 7, 19);
  const a = clockParts(now, 'en', { hourCycle: '24', showSeconds: true, showDate: false });
  const b = clockParts(now, 'en', { hourCycle: '12' });
  assert.match(a.time, /13:07:19/); assert.equal(a.date, ''); assert.match(b.time, /01:07.*PM/); assert.ok(b.date);
  assert.notEqual(a.key, clockParts(new Date(2026, 9, 23, 13, 7, 20), 'en', { showSeconds: true, hourCycle: '24', showDate: false }).key);
});

test('weather settings search and persist a selected city, and the dock opens its forecast first', async () => {
  const { page, errors } = await settings({ pinned: [widget('weather')] }, `const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='weather_search'?Promise.resolve([{name:'Santiago',country:'Chile',latitude:-33.45,longitude:-70.66}]):old(cmd,args);`);
  await inspect(page, 'Weather');
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Santiago');
  await page.getByRole('button', { name: 'Search city', exact: true }).click();
  await page.getByRole('button', { name: 'Santiago, Chile', exact: true }).click();
  await page.getByRole('combobox', { name: 'Units', exact: true }).selectOption('fahrenheit');
  await waitForAsyncCondition(page, async () => { const style=(await window.__TAURI__.core.invoke('get_config')).pinned[0].style;return style.latitude===-33.45&&style.units==='fahrenheit'; });
  const cfg=await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.deepEqual(errors, []); await page.close();
  const dock=await openPage(browser,port,'index.html',{cfg});
  await dock.page.locator('[data-id=weather]').click();
  await dock.page.locator('.weather-location-settings').waitFor();
  assert.equal(await dock.page.locator('.weather-location-settings').getAttribute('open'), null);
  assert.equal(await dock.page.locator('.weather-search input').isVisible(), false);
  assert.deepEqual(dock.errors, []); await dock.page.close();
});

test('device selection and provider selection are persisted per instance', async () => {
  const { page, errors } = await settings({ pinned: [widget('devices'), widget('ai')] }, `const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='device_batteries'?Promise.resolve([{name:'Keyboard',kind:'keyboard',level:50}]):old(cmd,args);`);
  await inspect(page, 'Devices');
  await page.getByRole('combobox', { name: 'Displayed device', exact: true }).selectOption('Keyboard');
  await inspect(page, 'AI usage');
  await page.getByRole('combobox', { name: 'Displayed provider', exact: true }).selectOption('claude');
  await waitForAsyncCondition(page, async () => { const p=(await window.__TAURI__.core.invoke('get_config')).pinned;return p[0].style.device==='Keyboard'&&p[0].style.deviceKind==='keyboard'&&p[1].style.provider==='claude'; });
  assert.deepEqual(errors, []); await page.close();
});

test('the selected AI provider is reflected in both the tile and its details', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [widget('ai', { provider: 'claude' })] }), initScript: `const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='ai_usage'?Promise.resolve([{id:'codex',name:'Codex',week_tokens:100,windows:[{label:'week',percent:50}]},{id:'claude',name:'Claude',week_tokens:200}]):old(cmd,args);` });
  await waitForAsyncCondition(page, () => document.querySelector('[data-id=ai]')?.getAttribute('aria-label')?.includes('Claude'));
  assert.doesNotMatch(await page.locator('[data-id=ai]').getAttribute('aria-label'), /^Codex ·/m);
  await page.locator('[data-id=ai]').click();
  await page.locator('.reading-card').waitFor();
  assert.equal(await page.locator('.reading-card').count(), 1);
  assert.match(await page.locator('.reading-card').innerText(), /Claude/);
  assert.deepEqual(errors, []); await page.close();
});

test('plugins offer the correct widget and configure an existing grouped Collector without duplicating it', async () => {
  const cfg = { pluginTerms: 1, pinned: [{ id: 'group', kind: 'group', name: 'Tools', children: [widget('collector')] }] };
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig(cfg), initScript: `const old=window.__TAURI__.core.invoke;window.routes=[];window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='plugin_status')return Promise.resolve({installed:true,version:'test'});if(cmd==='open_settings_tab')window.routes.push(args.tab);return old(cmd,args);};` });
  await page.getByRole('navigation').getByRole('button', { name: 'Plugins', exact: true }).click();
  const collector=page.locator('.plugin-card[data-setting-label="yt-dlp"]');
  await collector.getByRole('button', { name: 'Configure Collector', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.routes), ['widget:collector']);
  for (const [plugin, name] of [['OpenRGB','Lighting'],['winget','Updates'],['HeadsetControl','Devices'],['LibreHardwareMonitor','System']]) {
    const card=page.locator(`.plugin-card[data-setting-label="${plugin}"]`);
    await card.getByRole('button', { name: `Add ${name} to dock`, exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: /Collector/ }).count(), 0);
  }
  await page.locator('.plugin-card[data-setting-label="OpenRGB"]').getByRole('button', { name: 'Add Lighting to dock', exact: true }).click();
  await page.getByRole('button', { name: 'Configure Lighting', exact: true }).waitFor();
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).pinned.some((p) => p.widget==='lighting'));
  assert.deepEqual(errors, []); await page.close();
});

test('plugin installation waits for the Settings acceptance save barrier', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { initScript: `const old=window.__TAURI__.core.invoke;window.installs=[];window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='plugin_status')return Promise.resolve({installed:false});if(cmd==='save_config'&&args.patch?.pluginTerms)return Promise.reject(new Error('disk full'));if(cmd==='plugin_install'){window.installs.push(args.id);return Promise.resolve('test');}return old(cmd,args);};` });
  await page.getByRole('navigation').getByRole('button', { name: 'Plugins', exact: true }).click();
  await page.getByRole('checkbox', { name: /I accept the plugin terms/ }).check();
  await page.locator('.plugin-card[data-setting-label="yt-dlp"]').getByRole('button', { name: 'Download and install', exact: true }).click();
  await page.locator('.plugin-card[data-setting-label="yt-dlp"] [role=alert]').waitFor();
  assert.deepEqual(await page.evaluate(() => window.installs), []);
  assert.deepEqual(errors, []); await page.close();
});

test('plugin relationships and instance lookup keep unrelated and nested widgets separate', () => {
  assert.deepEqual(pluginsForWidget('devices'), ['headsetcontrol']);
  assert.deepEqual(pluginsForWidget('updates'), ['winget']);
  assert.deepEqual(pluginsForWidget('clock'), []);
  const pins=[{id:'g',kind:'group',name:'Tools',children:[widget('collector')]}];
  assert.equal(pinnedWidgetInstances(pins,'collector')[0].group,'Tools');
  assert.deepEqual(pinnedWidgetInstances(pins,'lighting'),[]);
});
