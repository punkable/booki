import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig } from './harness.mjs';
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });

test('a narrow library inspector reveals its controls and returns focus to the selected app', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { viewport: { width: 520, height: 680 } });
  await page.evaluate(() => { const invoke = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (c,a) => c === 'list_installed_apps' ? Promise.resolve([{items:Array.from({length:36},(_,i)=>({name:`Editor ${String(i).padStart(2,'0')}`,path:`C:/editor${i}.exe`}))}]) : invoke(c,a); });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  const card = page.getByRole('button', { name:'Item details: Editor 35',exact:true });
  await card.click();
  const inspector = page.locator('.library-inspector');
  await inspector.waitFor({state:'visible'});
  assert.equal(await inspector.evaluate(e=>e===document.activeElement),true);
  const rect = await inspector.boundingBox(); assert.ok(rect.y >= 0 && rect.y < 600);
  await inspector.getByRole('button', {name:'Previous',exact:true}).click();
  assert.equal(await card.evaluate(e=>e===document.activeElement),true);
  await page.setViewportSize({width:1280,height:850}); await card.click();
  assert.equal(await inspector.locator('.inspector-back').isHidden(),true);
  assert.deepEqual(errors,[]); await page.close();
});

test('failed explicit recovery never acknowledges damaged data or hides the recovery notice', async () => {
  const cfg = makeConfig();
  const { page, errors } = await openPage(browser, port, 'settings.html', { viewport:{width:1000,height:720}, cfg, initScript: `
    const originalInvoke = window.__TAURI__.core.invoke;
    window.__recoveryCalls = []; window.__recoveryBlocked = true; window.__recoveryFail = true;
    window.__TAURI__.core.invoke = async (command,args) => {
      if (command === 'config_recovery_status') return {kind:window.__recoveryBlocked?'damaged':'',blocked:window.__recoveryBlocked,quarantined:true};
      if (command === 'acknowledge_config_recovery') { window.__recoveryCalls.push(command); throw new Error('BOOKI_RECOVERY_REQUIRED'); }
      if (command === 'start_fresh_config') { window.__recoveryCalls.push(command); if(window.__recoveryFail) throw new Error('disk unavailable'); window.__recoveryBlocked=false; return ${JSON.stringify(cfg)}; }
      return originalInvoke(command,args);
    }` });
  const notice = page.locator('.recovery-notice'); await notice.waitFor();
  await notice.getByRole('button',{name:'Start with a fresh configuration',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__recoveryCalls),[]);
  await notice.getByRole('button',{name:'Confirm fresh configuration',exact:true}).click();
  await page.waitForFunction(()=>window.__recoveryCalls.length === 1);
  assert.equal(await notice.isVisible(),true); assert.equal(await page.evaluate(()=>window.__recoveryBlocked),true);
  await page.evaluate(()=>window.__recoveryFail=false);
  await notice.getByRole('button',{name:'Confirm fresh configuration',exact:true}).click();
  await notice.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__recoveryCalls),['start_fresh_config','start_fresh_config']);
  assert.deepEqual(errors,[]); await page.close();
});

test('an accepted native backdrop follows system appearance and returns to solid when transparency is disabled', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', {
    viewport:{width:1000,height:720}, cfg:makeConfig({theme:'system',surfaceStyle:'mica'}),
    initScript: `
      const originalInvoke = window.__TAURI__.core.invoke;
      window.__backdropCalls = []; window.__preferences = {systemBackdrop:true,transparency:true,animations:true,highContrast:false};
      window.__TAURI__.core.invoke = async (command,args) => {
        if(command === 'platform_capabilities') return structuredClone(window.__preferences);
        if(command === 'settings_backdrop') { window.__backdropCalls.push(args); return args.enabled; }
        return originalInvoke(command,args);
      };`
  });
  await page.waitForFunction(()=>document.body.classList.contains('settings-mica'));
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>window.__backdropCalls.at(-1)?.enabled && window.__backdropCalls.at(-1)?.dark);
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>window.__backdropCalls.at(-1)?.enabled && window.__backdropCalls.at(-1)?.dark === false);
  await page.evaluate(()=> { window.__preferences.transparency=false; for(const cb of window.__listeners['booki://preferences-changed'] || []) cb({payload:null}); });
  await page.waitForFunction(()=>!document.body.classList.contains('settings-mica') && document.documentElement.hasAttribute('data-reduce-transparency'));
  assert.equal(await page.evaluate(()=>window.__backdropCalls.at(-1).enabled),false);
  assert.deepEqual(errors,[]); await page.close();
});
