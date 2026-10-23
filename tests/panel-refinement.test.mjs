import test from 'node:test';
import assert from 'node:assert/strict';
import {serveDist,launchBrowser,openPage,makeConfig,waitForAsyncCondition} from './harness.mjs';
const {srv,port}=await serveDist(), browser=await launchBrowser();
test.after(async()=>{await browser.close();srv.close();});
const pin=(widget)=>({id:widget,kind:'widget',widget});
const providers=[{id:'claude',name:'Claude',detected:false,windows:[],week_tokens:0},{id:'codex',name:'Codex',detected:true,windows:[{label:'5h',percent:30,resets_at:0}],week_tokens:100},{id:'cursor',name:'Cursor',detected:true,windows:[],week_tokens:0},{id:'opencode',name:'OpenCode',detected:false,windows:[],week_tokens:0}];
const aiSetup=`window.providers=${JSON.stringify(providers)};const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='ai_usage'?Promise.resolve(structuredClone(window.providers)):old(cmd,args);`;
test('AI details expose all four providers, explain missing data and refresh without fabricating quota',async()=>{
 const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[pin('ai')]}),initScript:aiSetup});
 await page.locator('[data-id=ai]').click();const panel=page.locator('.system-widget-panel.is-open');await panel.locator('.reading-card').nth(3).waitFor();
 assert.equal(await panel.locator('.reading-card').count(),4);
 for(const name of ['Cursor','OpenCode','Claude']){
  const card=panel.locator('.reading-card').filter({has:page.locator('strong',{hasText:new RegExp(`^${name}$`)})});
  assert.equal(await card.getByRole('meter').count(),0,name);
  assert.doesNotMatch(await card.innerText(),/\b0%/);
 }
 assert.match(await panel.locator('.reading-card').filter({hasText:'Codex'}).innerText(),/70%/);
 assert.equal(await panel.locator('.widget-diagnostics').getAttribute('open'),null);
 await page.evaluate(()=>{window.providers[3].detected=true;});await panel.getByRole('button',{name:'Refresh data',exact:true}).click();
 await waitForAsyncCondition(page,()=>[...document.querySelectorAll('.reading-card')].some(card=>card.textContent.includes('OpenCode')&&card.textContent.includes('Provider data detected')));
 assert.deepEqual(errors,[]);await page.close();
});
for(const edge of ['bottom','top','left','right'])test(`large widget details fit beside the ${edge} dock with their header visible`,async()=>{
 const viewport=['left','right'].includes(edge)?{width:500,height:850}:{width:1100,height:480};
 const {page,errors}=await openPage(browser,port,'index.html',{viewport,cfg:makeConfig({edge,pinned:[pin('ai')]}),initScript:aiSetup});
 await page.locator('[data-id=ai]').click();const panel=page.locator('.system-widget-panel.is-open');await panel.locator('.reading-card').nth(3).waitFor();await page.waitForTimeout(250);
 const geometry=await page.evaluate(()=>{const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}};return {bar:rect(document.querySelector('#dock')),panel:rect(document.querySelector('.system-widget-panel')),head:rect(document.querySelector('.productivity-head')),w:innerWidth,h:innerHeight};});
 const {bar,panel:box,head,w,h}=geometry;
 assert.ok(box.x>=0&&box.y>=0&&box.right<=w+1&&box.bottom<=h+1,JSON.stringify(geometry));
 assert.ok(!(box.x<bar.right&&box.right>bar.x&&box.y<bar.bottom&&box.bottom>bar.y),JSON.stringify(geometry));
 await panel.locator('.system-widget-sections').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 assert.equal(Math.round((await panel.locator('.productivity-head').boundingBox()).y),Math.round(head.y));
 assert.deepEqual(errors,[]);await page.close();
});
test('clipboard help is on demand and scrolling history retains header, search and exact-instance settings',async()=>{
 const init=`window.routes=[];const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='open_settings_tab'){window.routes.push(args);return Promise.resolve();}if(cmd==='clipboard_history')return Promise.resolve(Array.from({length:40},(_,i)=>({id:i,text:'Example entry '+i,favorite:false,private:false})));return old(cmd,args);};`;
 const {page,errors}=await openPage(browser,port,'index.html',{viewport:{width:900,height:480},cfg:makeConfig({pinned:[pin('clipboard')]}),initScript:init});
 await page.locator('[data-id=clipboard]').click();await page.locator('#stack.open .clip-row').nth(39).waitFor();
 assert.equal(await page.locator('.clip-guide').isVisible(),false);
 const help=page.getByRole('button',{name:'How to use it',exact:true});await help.click();assert.equal(await page.locator('.clip-guide').isVisible(),true);await help.click();
 const before=await page.locator('.clip-search').boundingBox();
 await page.locator('.clip-list').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 assert.equal(Math.round((await page.locator('.clip-search').boundingBox()).y),Math.round(before.y));
 await page.getByRole('button',{name:'Configure Clipboard',exact:true}).click();
 assert.match(JSON.stringify(await page.evaluate(()=>window.routes)),/widget:clipboard/);assert.deepEqual(errors,[]);await page.close();
});
