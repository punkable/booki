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
  await inspector.getByRole('button', {name:'Close',exact:true}).click();
  assert.equal(await card.evaluate(e=>e===document.activeElement),true);
  await page.setViewportSize({width:1280,height:850}); await card.click();
  assert.equal(await inspector.getByRole('button', {name:'Close',exact:true}).isVisible(),true);
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

test('widget inspector options stay readable and support radio-group keyboard navigation', async () => {
  const {page,errors} = await openPage(browser,port,'settings.html',{viewport:{width:1280,height:850}});
  await page.getByRole('navigation').getByRole('button',{name:'Widgets',exact:true}).click();
  await page.getByRole('button',{name:'Item details: Focus',exact:true}).click();
  const group = page.getByRole('radiogroup',{name:'Look',exact:true});
  assert.equal(await group.getByRole('radio',{name:'Minimal',exact:true}).locator('span').evaluate(el=>el.scrollWidth <= el.clientWidth + 1),true);
  await group.getByRole('radio',{name:'Glass',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.activeElement?.textContent === 'Solid');
  assert.equal(await group.getByRole('radio',{name:'Solid',exact:true}).getAttribute('aria-checked'),'true');
  await page.keyboard.press('End');
  assert.equal(await group.getByRole('radio',{name:'Minimal',exact:true}).getAttribute('aria-checked'),'true');
  await page.setViewportSize({width:520,height:720});
  assert.equal(await group.getByRole('radio',{name:'Minimal',exact:true}).locator('span').evaluate(el=>el.scrollWidth <= el.clientWidth + 1),true);
  assert.deepEqual(errors,[]); await page.close();
});

test('profiles select before applying, reject stale previews and recover deleted snapshots', async () => {
  const cfg = makeConfig({ theme:'light' });
  const candidate = makeConfig({ theme:'dark', autostart:true, lastProfile:'Work' });
  const { page, errors } = await openPage(browser,port,'settings.html',{cfg,viewport:{width:520,height:780},initScript:`
    const original = window.__TAURI__.core.invoke;
    window.__profileCalls = []; window.__profiles = {Work:${JSON.stringify(candidate)}}; window.__deleted = [];
    window.__TAURI__.core.invoke = async (command,args) => {
      if(command === 'profile_list') return Object.keys(window.__profiles);
      if(command === 'profile_deleted') return window.__deleted;
      if(command === 'profile_preview') return {config:structuredClone(window.__profiles[args.name]),recovered:true};
      if(command === 'profile_apply') { window.__profileCalls.push(args); throw new Error('BOOKI_PROFILE_CHANGED'); }
      if(command === 'profile_delete') { window.__deleted.push({token:'123-1',name:args.name});delete window.__profiles[args.name];return '123-1'; }
      if(command === 'profile_restore') {window.__profiles.Work=${JSON.stringify(candidate)};window.__deleted=[];return 'Work';}
      return original(command,args);
    }`});
  await page.getByRole('navigation').getByRole('button',{name:'System',exact:true}).click();
  await page.getByRole('button',{name:'Work',exact:true}).click();
  await page.getByText('This profile was recovered from its backup. Review it before applying.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__profileCalls),[]);
  await page.locator('.profile-inspector').getByRole('button',{name:'Apply',exact:true}).click();
  const review = page.getByRole('dialog',{name:'Review configuration',exact:true}); await review.waitFor();
  await review.getByRole('button',{name:'Apply',exact:true}).click();
  await review.getByRole('alert').waitFor();
  assert.equal(await review.isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__profileCalls[0].expected.autostart),true);
  await review.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('.profile-inspector').getByRole('button',{name:'Remove',exact:true}).click();
  await page.getByRole('button',{name:/^Deleted profiles/}).click();
  await page.getByRole('button',{name:'Restore',exact:true}).click();
  await page.getByRole('button',{name:'Work',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__deleted),[]);
  assert.deepEqual(errors,[]); await page.close();
});

test('a late profile preview never replaces the latest selection', async () => {
  const cfg = makeConfig();
  const {page,errors} = await openPage(browser,port,'settings.html',{initScript:`
    const original=window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke=(c,a)=>{
      if(c==='profile_list') return Promise.resolve(['First','Second']);
      if(c==='profile_preview' && a.name==='First') return new Promise(resolve=>{window.__finishFirst=()=>resolve({config:${JSON.stringify(cfg)},recovered:true});});
      if(c==='profile_preview') return Promise.resolve({config:${JSON.stringify(cfg)},recovered:false});
      return original(c,a);
    };`});
  await page.getByRole('navigation').getByRole('button',{name:'System',exact:true}).click();
  await page.getByRole('button',{name:'First',exact:true}).click();
  await page.waitForFunction(()=>typeof window.__finishFirst==='function');
  await page.getByRole('button',{name:'Second',exact:true}).click();
  await page.locator('.profile-inspector').getByRole('button',{name:'Apply',exact:true}).waitFor();
  await page.evaluate(()=>window.__finishFirst());
  assert.equal(await page.locator('.profile-inspector h3').textContent(),'Second');
  assert.equal(await page.getByText('This profile was recovered from its backup. Review it before applying.',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();
});

test('a partial profile operation refreshes recoverable documents and retains its error', async () => {
  const cfg=makeConfig();
  const {page,errors}=await openPage(browser,port,'settings.html',{initScript:`
    const original=window.__TAURI__.core.invoke;window.__profileNames=['Work'];
    window.__TAURI__.core.invoke=(command,args)=>{
      if(command==='profile_list')return Promise.resolve(window.__profileNames);
      if(command==='profile_preview')return Promise.resolve({config:${JSON.stringify(cfg)},recovered:false});
      if(command==='profile_rename'){window.__profileNames.push(args.newName);return Promise.reject(new Error('original could not be archived'));}
      return original(command,args);
    };`});
  await page.getByRole('navigation').getByRole('button',{name:'System',exact:true}).click();
  await page.getByRole('button',{name:'Work',exact:true}).click();
  const panel=page.locator('.profile-inspector');
  await panel.locator('.profile-manage summary').click();
  await panel.getByRole('textbox',{name:'Rename profile',exact:true}).fill('Recovered');
  await panel.getByRole('button',{name:'Rename profile',exact:true}).click();
  await page.getByRole('button',{name:'Recovered',exact:true}).waitFor();
  await page.getByRole('alert').waitFor();
  assert.equal(await panel.getByRole('textbox',{name:'Rename profile',exact:true}).inputValue(),'Recovered');
  assert.equal(await panel.locator('h3').textContent(),'Work');
  assert.deepEqual(errors,[]);await page.close();
});
