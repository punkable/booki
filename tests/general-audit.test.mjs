import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const group = { id: 'g', kind: 'group', name: 'Work', children: [{ id: 'a', kind: 'app', name: 'Editor', path: 'C:/editor.exe' }] };
const signal = (page, name, payload = null) => page.evaluate(([name, payload]) => { for (const cb of window.__listeners[name] || []) cb({ payload }); }, [name, payload]);

test('a failed placement preview leaves the preference saved and raises no unhandled rejection', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { initScript: `
    const old=window.__TAURI__.core.invoke;window.previews=0;
    window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='notch_preview'){window.previews++;return Promise.reject(new Error('preview unavailable'));}return old(cmd,args);};` });
  await page.getByRole('navigation').getByRole('button', { name: 'Dock', exact: true }).click();
  await page.locator('[data-spot="top-center"]').click();
  await waitForAsyncCondition(page, async () => window.previews === 1 && (await window.__TAURI__.core.invoke('get_config')).edge === 'top');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.save-status.is-error, .conflict-error').count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test('explicit fresh-config recovery clears a previous conflict and unsaved draft', async () => {
  const fresh = makeConfig({ theme: 'dark', revision: 10 });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ theme: 'system', revision: 1 }), initScript: `
    const old=window.__TAURI__.core.invoke;window.blocked=true;
    window.__TAURI__.core.invoke=async(cmd,args)=>{
      if(cmd==='config_recovery_status')return {kind:window.blocked?'damaged':'',blocked:window.blocked};
      if(cmd==='start_fresh_config'){window.blocked=false;return old('save_config',{config:${JSON.stringify(fresh)}});}
      if(cmd==='save_config' && args.patch?.theme==='light')throw 'BOOKI_CONFIG_CONFLICT:'+JSON.stringify({keys:['theme'],current:{...await old('get_config'),theme:'dark',revision:2}});
      return old(cmd,args);
    };` });
  await page.getByRole('navigation').getByRole('button', { name: 'Dock', exact: true }).click();
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await page.locator('.conflict-error').waitFor();
  await page.getByRole('button', { name: 'Start with a fresh configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm fresh configuration', exact: true }).click();
  await waitForAsyncCondition(page, () => !document.querySelector('.conflict-error, .recovery-notice'));
  assert.equal(await page.getByRole('radio', { name: 'Dark', exact: true }).getAttribute('aria-checked'), 'true');
  assert.deepEqual(errors, []); await page.close();
});

test('an older blur probe cannot close a panel after the capture-start signal arrives', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ captureVisible: true, pinned: [group] }), initScript: `
    const old=window.__TAURI__.core.invoke;window.pending=[];
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='capture_session_active'?new Promise(resolve=>window.pending.push(resolve)):old(cmd,args);` });
  await page.locator('[data-id=g]').click();
  await page.evaluate(() => { document.hasFocus=()=>false; window.dispatchEvent(new Event('blur')); });
  await waitForAsyncCondition(page, () => window.pending.length > 0);
  await signal(page, 'booki://capture-session', true);
  await page.evaluate(() => { for (const resolve of window.pending.splice(0)) resolve(false); });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#stack.open').count(), 1);
  assert.equal(await page.locator('body.capture-held').count(), 1);
  assert.deepEqual(errors, []); await page.close();
});

test('failure of an earlier density save does not discard a newer group view during a temporary read failure', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [group] }), initScript: `
    const old=window.__TAURI__.core.invoke;window.failed=false;window.failRead=false;
    window.nativeConfig=()=>old('get_config');
    window.__TAURI__.core.invoke=(cmd,args)=>{
      if(cmd==='get_config' && window.failRead)return Promise.reject(new Error('temporary read failure'));
      if(cmd==='save_config' && args.patch?.pinned?.[0]?.style?.groupView==='small' && !window.failed){window.failed=true;return new Promise((resolve,reject)=>window.rejectSave=reject);}
      return old(cmd,args);
    };` });
  await page.locator('[data-id=g]').click();
  const view = page.locator('.group-toolbar select');
  await view.selectOption('small');
  await waitForAsyncCondition(page, () => !!window.rejectSave);
  await view.selectOption('large');
  await page.evaluate(() => { window.failRead=true; window.rejectSave(new Error('save unavailable')); });
  await waitForAsyncCondition(page, async () => (await window.nativeConfig()).pinned[0].style?.groupView === 'large');
  assert.equal(await view.inputValue(), 'large');
  assert.deepEqual(errors, []); await page.close();
});

test('deferred download notices wait again when a new focus session starts before their turn', async () => {
  const focus = { id: 'focus', kind: 'widget', widget: 'focus', style: { endsAt: Date.now() + 600000, minutes: 25 } };
  const collector = { id: 'collector', kind: 'widget', widget: 'collector' };
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [focus, collector] }), initScript: `
    const old=window.__TAURI__.core.invoke;window.jobs=[];window.notices=[];
    window.__TAURI__.core.invoke=(cmd,args)=>{
      if(cmd==='plugin_download')return new Promise(resolve=>window.jobs.push(resolve));
      if(cmd==='notch_notice'){window.notices.push(args.detail);return Promise.resolve(true);}
      return old(cmd,args);
    };` });
  await page.clock.install();
  await page.locator('[data-id=collector]').click();
  await page.getByRole('textbox', { name: 'Paste a link', exact: true }).fill('https://example.com/a.pdf\nhttps://example.com/b.pdf');
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await waitForAsyncCondition(page, () => window.jobs.length === 1);
  await page.evaluate(() => window.jobs[0]('C:/a.pdf'));
  await waitForAsyncCondition(page, () => window.jobs.length === 2);
  await page.evaluate(() => window.jobs[1]('C:/b.pdf'));
  await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(() => window.notices), []);
  const setFocus = async (running) => {
    await page.evaluate(async (running) => {
      const cfg=await window.__TAURI__.core.invoke('get_config');
      cfg.pinned[0].style={minutes:25,...(running?{endsAt:Date.now()+600000}:{})};
      await window.__TAURI__.core.invoke('save_config',{patch:{pinned:cfg.pinned}});
      for(const cb of window.__listeners['booki://config-changed']||[])cb({payload:null});
    }, running);
    await page.waitForTimeout(100);
  };
  await setFocus(false); await page.clock.runFor(100);
  assert.deepEqual(await page.evaluate(() => window.notices), ['a.pdf']);
  await setFocus(true); await page.clock.runFor(4200);
  assert.deepEqual(await page.evaluate(() => window.notices), ['a.pdf']);
  await setFocus(false); await page.clock.runFor(100);
  assert.deepEqual(await page.evaluate(() => window.notices), ['a.pdf', 'b.pdf']);
  assert.deepEqual(errors, []); await page.close();
});

test('a download notice observes a newly enabled Windows Do not disturb before the next background poll', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [{ id: 'collector', kind: 'widget', widget: 'collector' }] }), initScript: `
    const old=window.__TAURI__.core.invoke;window.dnd=false;window.notices=[];
    window.__TAURI__.core.invoke=(cmd,args)=>{
      if(cmd==='dnd_state')return window.failDnd?Promise.reject(new Error('temporary DND query failure')):Promise.resolve(window.dnd);
      if(cmd==='plugin_download')return new Promise(resolve=>window.finishDownload=resolve);
      if(cmd==='notch_notice'){window.notices.push(args.detail);return Promise.resolve(true);}
      return old(cmd,args);
    };` });
  await page.clock.install();
  await page.locator('[data-id=collector]').click();
  await page.getByRole('textbox', { name: 'Paste a link', exact: true }).fill('https://example.com/a.pdf');
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await waitForAsyncCondition(page, () => !!window.finishDownload);
  await page.evaluate(() => { window.dnd=true; window.finishDownload('C:/a.pdf'); });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => window.notices), []);
  await page.evaluate(() => { window.failDnd=true; });
  await page.clock.fastForward(12000); await page.clock.runFor(100);
  assert.deepEqual(await page.evaluate(() => window.notices), [], 'a failed query cannot clear known quiet mode');
  await page.evaluate(() => { window.failDnd=false; window.dnd=false; });
  await page.clock.fastForward(12000); await page.clock.runFor(100);
  await waitForAsyncCondition(page, () => window.notices.length === 1);
  assert.deepEqual(await page.evaluate(() => window.notices), ['a.pdf']);
  assert.deepEqual(errors, []); await page.close();
});
