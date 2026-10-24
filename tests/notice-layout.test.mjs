import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
const {srv,port}=await serveDist(), browser=await launchBrowser();
test.after(async()=>{await browser.close();srv.close();});
const emit=(page,payload)=>page.evaluate(payload=>{for(const cb of window.__listeners['booki://link-drop']||[])cb({payload});},payload);
const setup=`window.savedPath='C:/Downloads/'+ 'report-'.repeat(16)+'.pdf';const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='plugin_status'?Promise.resolve({installed:true,version:'test'}):cmd==='plugin_download'?Promise.resolve(window.savedPath):cmd==='notch_notice'?Promise.resolve(false):old(cmd,args);window.__TAURI_INTERNALS__={invoke:(cmd,args)=>cmd==='plugin:updater|check'?Promise.resolve({rid:1,version:'9.9.9',currentVersion:'0.95.1',body:'Example update'}):old(cmd,args)};`;
for(const edge of ['bottom','top','left','right'])test(`update and actionable notices stay outside the ${edge} dock and each other`,async()=>{
 const {page,errors}=await openPage(browser,port,'index.html',{viewport:{width:1100,height:760},cfg:makeConfig({edge,magnification:true,zoom:1.8,pinned:[{id:'collector',kind:'widget',widget:'collector'}]}),initScript:setup});
 await page.locator('#update-pill:not(.hidden)').waitFor();
 await emit(page,'https://example.com/report.pdf');
 const toast=page.locator('#undo-toast:not(.hidden)');await toast.locator('button').nth(2).waitFor();
 await page.keyboard.press('Escape');
 await page.locator('#dock .tile').hover();await page.waitForTimeout(400);
 const rects=await page.evaluate(()=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  return {dock:[rect(document.querySelector('#dock')),...[...document.querySelectorAll('#dock .tile')].map(rect)],toast:rect(document.querySelector('#undo-toast')),update:rect(document.querySelector('#update-pill')),w:innerWidth,h:innerHeight};
 });
 const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
 for(const notice of [rects.toast,rects.update]){
  assert.ok(notice.x>=0&&notice.y>=0&&notice.right<=rects.w+1&&notice.bottom<=rects.h+1,JSON.stringify(rects));
  assert.ok(rects.dock.every(dock=>!overlap(dock,notice)),JSON.stringify(rects));
 }
 assert.equal(overlap(rects.toast,rects.update),false,JSON.stringify(rects));
 assert.match(await page.locator('[data-update-label]').innerText(),/9\.9\.9/);
 if(edge==='bottom') {
  await page.evaluate(async()=>{await window.__TAURI__.core.invoke('save_config',{patch:{accent:'#62a8ff'}});for(const cb of window.__listeners['booki://config-changed']||[])cb({payload:{}});});
  await page.waitForTimeout(200);
  assert.match(await page.locator('[data-update-label]').innerText(),/9\.9\.9/);
 }

 await page.locator('[data-update-dismiss]').click();assert.equal(await page.locator('#update-pill').isVisible(),false);
 assert.deepEqual(errors,[]);await page.close();
});
test('a completed notice action cannot dismiss a newer download notice',async()=>{
 const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[{id:'collector',kind:'widget',widget:'collector'}]}),initScript:setup+`const current=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='open_location'?new Promise(resolve=>{window.finishAction=resolve;}):current(cmd,args);`});
 await emit(page,'https://example.com/first.pdf');await page.locator('#undo-toast:not(.hidden) button').first().click();
 await page.evaluate(()=>{window.savedPath='C:/Downloads/newer.pdf';});await emit(page,'https://example.com/second.pdf');
 await page.locator('#undo-toast .notice-copy small',{hasText:'newer.pdf'}).waitFor();
 await page.evaluate(()=>window.finishAction());await page.waitForTimeout(100);
 assert.equal(await page.locator('#undo-toast:not(.hidden)').count(),1);assert.deepEqual(errors,[]);await page.close();
});
test('moving the Windows work area without resizing it repositions the native dock',async()=>{
 const {page,errors}=await openPage(browser,port,'index.html',{initScript:`window.nativeFrames=[];window.workLeft=0;Object.defineProperty(screen,'availLeft',{get:()=>window.workLeft});const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='set_dock_frame')window.nativeFrames.push(args);return old(cmd,args);};`});
 await page.waitForTimeout(300);const before=await page.evaluate(()=>window.nativeFrames.length);
 await page.evaluate(()=>{window.workLeft=40;dispatchEvent(new Event('resize'));});
 await waitForAsyncCondition(page,()=>window.nativeFrames.length>0);
 await page.waitForTimeout(400);assert.ok(await page.evaluate(n=>window.nativeFrames.length>n,before));assert.deepEqual(errors,[]);await page.close();
});
