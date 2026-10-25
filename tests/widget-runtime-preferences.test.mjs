import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
const {srv,port}=await serveDist();const browser=await launchBrowser();
test.after(async()=>{await browser.close();srv.close();});

test('clock instances paint different formats, date visibility and ticking seconds on the actual dock', async()=>{
  const pins=[{id:'a',kind:'widget',widget:'clock',style:{hourCycle:'24',showSeconds:true,showDate:false}},{id:'b',kind:'widget',widget:'clock',style:{hourCycle:'12'}}];
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:pins}),initScript:`const RealDate=Date;window.clockTime=Date.parse('2026-10-23T13:07:19');window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.clockTime]));}static now(){return window.clockTime;}};`});
  await waitForAsyncCondition(page,()=>document.querySelector('[data-id=a] .w-value')?.textContent==='13:07:19');
  await page.evaluate(()=>{window.clockTime+=1000;});
  await waitForAsyncCondition(page,()=>document.querySelector('[data-id=a] .w-value')?.textContent==='13:07:20');
  assert.match(await page.locator('[data-id=a] .w-value').innerText(),/13:07:20/);
  assert.match(await page.locator('[data-id=b] .w-value').innerText(),/01:07.*PM/);
  assert.equal(await page.locator('[data-id=a] .w-label').isVisible(),false);
  assert.equal(await page.locator('[data-id=b] .w-label').isVisible(),true);
  await page.locator('[data-id=a]').click();
  assert.match(await page.locator('.productivity-clock time').innerText(),/13:07:20/);
  assert.deepEqual(errors,[]);await page.close();
});

test('the volume wheel uses the configured increment without changing appearance',async()=>{
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[{id:'volume',kind:'widget',widget:'volume',style:{volumeStep:7,variant:'minimal'}}]}),initScript:`const old=window.__TAURI__.core.invoke;window.writes=[];window.__TAURI__.core.invoke=(cmd,args)=>cmd==='volume_info'?Promise.resolve([40,false]):cmd==='volume_set'?(window.writes.push(args),Promise.resolve(true)):old(cmd,args);`});
  await waitForAsyncCondition(page,()=>document.querySelector('[data-id=volume] .w-ring-num')?.dataset.v==='40');
  await page.locator('[data-id=volume]').dispatchEvent('wheel',{deltaY:100});
  await waitForAsyncCondition(page,()=>window.writes.length>0);
  assert.equal(await page.evaluate(()=>window.writes.at(-1).pct),33);
  assert.equal(await page.locator('[data-id=volume]').getAttribute('data-variant'),'minimal');
  assert.deepEqual(errors,[]);await page.close();
});

test('grouped System details show selected metrics, refresh while open and release their timer on close',async()=>{
  const cfg=makeConfig({pinned:[{id:'g',kind:'group',name:'Tools',children:[{id:'system',kind:'widget',widget:'system',style:{metrics:['disk','net']}}]}]});
  const {page,errors}=await openPage(browser,port,'index.html',{cfg,initScript:`const old=window.__TAURI__.core.invoke;window.level=33;window.reads=0;window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='system_stats'){window.reads++;return Promise.resolve({cpu:11,mem:22,disk:window.level,net_down_kbps:44,net_up_kbps:55,battery:50});}return old(cmd,args);};`});
  await page.locator('[data-id=g]').click();await page.locator('#stack [data-id=system]').click();
  await waitForAsyncCondition(page,()=>document.querySelector('.reading-cards')?.textContent.includes('33%'));
  assert.equal(await page.locator('.reading-cards .reading-card').count(),2);
  assert.doesNotMatch(await page.locator('.reading-cards').innerText(),/CPU|RAM/);
  await page.clock.install();await page.evaluate(()=>{window.level=71;});
  // A refresh can join a read already in flight with the old value; the next tick brings the new one.
  for(let i=0;i<6&&!(await page.evaluate(()=>document.querySelector('.reading-cards')?.textContent.includes('71%')));i++){await page.clock.fastForward(5500);await page.waitForTimeout(100);}
  await waitForAsyncCondition(page,()=>document.querySelector('.reading-cards')?.textContent.includes('71%'));
  assert.equal(await page.locator('.reading-cards').count(),1);
  // Closing the panel goes back to the group it was opened from; closing the group then stops the reads.
  await page.keyboard.press('Escape');await page.clock.fastForward(1000);
  await page.keyboard.press('Escape');await page.clock.fastForward(1000);
  const reads=await page.evaluate(()=>window.reads);await page.clock.fastForward(6000);
  assert.equal(await page.evaluate(()=>window.reads),reads);
  assert.deepEqual(errors,[]);await page.close();
});

test('closing a widget opened from a group goes back to that group; clicking away does not',async()=>{
  const cfg=makeConfig({pinned:[{id:'g',kind:'group',name:'Tools',children:[{id:'v',kind:'widget',widget:'volume'},{id:'c',kind:'widget',widget:'clock'}]}]});
  const {page,errors}=await openPage(browser,port,'index.html',{cfg});
  for(const id of ['v','c']){
    await page.locator('#dock > [data-id=g]').click();await page.locator('#stack.open').waitFor();
    await page.locator(`#stack [data-child-id=${id}]`).click();await page.locator('.productivity-panel.is-open').waitFor();
    assert.equal(await page.locator('#stack.open').count(),0);
    await page.keyboard.press('Escape');
    await page.locator('#stack.open').waitFor();
    await page.keyboard.press('Escape');await page.waitForTimeout(300);
  }
  await page.locator('#dock > [data-id=g]').click();await page.locator('#stack.open').waitFor();
  await page.locator('#stack [data-child-id=v]').click();await page.locator('.productivity-panel.is-open').waitFor();
  await page.mouse.click(4,4);await page.waitForTimeout(500);
  assert.equal(await page.locator('#stack.open').count(),0);
  assert.deepEqual(errors,[]);await page.close();
});
