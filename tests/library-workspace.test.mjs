import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
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
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.note === 'A saved draft');
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
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].icon === 'lib:coffee:badge');
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
  await waitForAsyncCondition(page, async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.note === 'Keep this draft');
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

test('optional Settings pin opens once per pointer or keyboard activation and uses a centered icon', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [{ id: 'settings', kind: 'action', action: 'settings', name: 'Preferences', path: '', args: [] }] }) });
  await page.evaluate(() => { window.settingsOpens = 0; const invoke = window.__TAURI__.core.invoke; window.__TAURI__.core.invoke = (command, args) => { if (command === 'open_settings') window.settingsOpens++; return invoke(command, args); }; });
  const tile = page.getByRole('button', { name: 'Preferences', exact: true });
  assert.equal(await tile.locator('.action-icon').count(), 1);
  assert.equal(await tile.locator('.badge').count(), 0);
  await tile.click();
  assert.equal(await page.evaluate(() => window.settingsOpens), 1);
  await tile.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.settingsOpens), 2);
  assert.deepEqual(errors, []); await page.close();
});

test('folder search covers every page, sorting resets pagination and Escape clears the query', async () => {
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[{id:'folder',name:'Files',kind:'folder',path:'C:/Files'}]}),initScript:`
    const old=window.__TAURI__.core.invoke; window.__folderCalls=[];
    window.__TAURI__.core.invoke=(command,args)=>{
      if(command==='list_dir') {
        window.__folderCalls.push(args);
        const terms=(args.query||'').toLowerCase().split(/\\s+/).filter(Boolean);
        let rows=Array.from({length:100},(_,i)=>({name:'File '+String(i).padStart(3,'0')+'.txt',path:'C:/Files/'+i+'.txt',is_dir:false})).filter(row=>terms.every(term=>row.name.toLowerCase().includes(term)));
        if(args.order==='name-desc')rows.reverse();
        return Promise.resolve(rows.slice(args.offset,args.offset+args.limit));
      }
      return old(command,args);
    };`});
  await page.locator('.tile[data-id="folder"]').click();
  await page.locator('.stack-item').filter({hasText:'File 000.txt'}).waitFor();
  const search=page.getByRole('searchbox',{name:'Search this folder',exact:true});
  await search.fill('TXT 099');
  await page.locator('.stack-item').filter({hasText:'File 099.txt'}).waitFor();
  assert.equal(await page.locator('.stack-item').count(),1);
  await search.press('Escape');
  assert.equal(await page.locator('#stack').evaluate(el=>el.classList.contains('open')),true);
  await page.locator('.stack-item').filter({hasText:'File 000.txt'}).waitFor();
  await page.getByRole('combobox',{name:'Sort folder',exact:true}).selectOption('name-desc');
  await page.locator('.stack-item').filter({hasText:'File 099.txt'}).waitFor();
  assert.equal(await page.locator('.stack-item').first().textContent().then(text=>text.includes('File 099.txt')),true);
  await page.locator('.stack-pager').getByRole('button',{name:'Next',exact:true}).click();
  await page.locator('.stack-item').filter({hasText:'File 075.txt'}).waitFor();
  assert.equal(await page.locator('.stack-pager').getByRole('button',{name:'Next',exact:true}).evaluate(el=>el===document.activeElement),true);
  await search.fill('does-not-exist');
  await page.getByText('No files match your search.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__folderCalls.at(-1).offset),0);
  assert.deepEqual(errors,[]);await page.close();
});

test('an inaccessible folder offers retry instead of claiming it is empty', async () => {
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[{id:'folder',name:'Files',kind:'folder',path:'C:/Files'}]}),initScript:`
    const old=window.__TAURI__.core.invoke;window.__folderUnavailable=true;
    window.__TAURI__.core.invoke=(command,args)=>command==='list_dir'?(window.__folderUnavailable?Promise.reject(new Error('access denied')):Promise.resolve([])):old(command,args);`});
  await page.locator('.tile[data-id="folder"]').click();
  await page.locator('.stack-load-error').getByRole('alert').waitFor();
  await page.evaluate(()=>window.__folderUnavailable=false);
  await page.locator('.stack-load-error').getByRole('button').click();
  await page.waitForFunction(()=>document.querySelector('.stack-grid')?.getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('.stack-load-error').count(),0);
  assert.equal(await page.locator('.stack-item').count(),0);
  assert.deepEqual(errors,[]);await page.close();
});

test('library keeps one compact editable dock and gives an unselected catalog the available width', async () => {
  const {page,errors}=await openPage(browser,port,'settings.html',{cfg:makeConfig({pinned:[app]}),viewport:{width:1280,height:850}});
  await page.getByRole('navigation').getByRole('button',{name:'Apps & folders',exact:true}).click();
  const editor=page.getByRole('region',{name:'In your dock',exact:true});
  await editor.getByRole('button',{name:'Editor',exact:true}).waitFor();
  const geometry=await page.evaluate(()=>{
    const editor=document.querySelector('.library-dock-editor'),catalog=document.querySelector('.library-catalog'),workspace=document.querySelector('.library-workspace');
    return {height:editor.getBoundingClientRect().height,catalogWidth:catalog.getBoundingClientRect().width,workspaceWidth:workspace.getBoundingClientRect().width,previewCount:editor.querySelectorAll('.live-preview-scene').length};
  });
  assert.ok(geometry.height<=180,`The persistent editor occupies ${geometry.height}px`);
  assert.ok(geometry.catalogWidth>=geometry.workspaceWidth*.95,'No width reserved for an empty inspector');
  assert.equal(geometry.previewCount,0,'The editable dock must not be duplicated by a second preview');
  await editor.getByRole('button',{name:'Editor',exact:true}).click();
  await page.locator('.library-inspector').getByRole('textbox',{name:'Rename',exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
});

test('widget filtering preserves a customized draft and leaves the heading visible when the gallery scrolls', async () => {
  const {page,errors}=await openPage(browser,port,'settings.html',{viewport:{width:1280,height:850}});
  await page.getByRole('navigation').getByRole('button',{name:'Widgets',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Search widgets',exact:true});
  await search.fill('timer');
  assert.equal(await page.locator('.widget-store-choice').count(),1);
  await page.getByRole('button',{name:'Item details: Timer',exact:true}).click();
  await page.locator('.widget-inspector').getByRole('radio',{name:'Solid',exact:true}).click();
  await search.fill('not-a-widget');
  await page.getByRole('status').filter({hasText:'No results'}).waitFor();
  assert.equal(await page.locator('.widget-inspector').getByRole('radio',{name:'Solid',exact:true}).getAttribute('aria-checked'),'true');
  await search.fill('');
  await page.locator('.widget-store-grid').evaluate(element=>element.scrollTop=element.scrollHeight);
  const heading=await page.getByRole('heading',{name:'Widgets',exact:true}).boundingBox();
  assert.ok(heading.y>=0 && heading.y<150,'Scrolling the gallery must leave the page heading accessible');
  await page.locator('.widget-inspector').getByRole('button',{name:'Add',exact:true}).click();
  await waitForAsyncCondition(page, async()=>{const cfg=await window.__TAURI__.core.invoke('get_config');return cfg.pinned.some(item=>item.widget==='timer' && item.style.variant==='solid');});
  assert.deepEqual(errors,[]);await page.close();
});

test('the editable dock reserves space while a populated library scrolls without covering its apps', async () => {
  const {page,errors}=await openPage(browser,port,'settings.html',{cfg:makeConfig({pinned:[app]}),viewport:{width:1280,height:720},initScript:`const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='list_installed_apps'?Promise.resolve([{items:Array.from({length:70},(_,i)=>({name:'App '+i,path:'C:/Apps/app'+i+'.exe'}))}]):old(cmd,args);`});
  await page.getByRole('navigation').getByRole('button',{name:'Apps & folders',exact:true}).click();
  await page.locator('.app-library-card').first().waitFor();
  const editor=page.locator('.library-dock-editor');const before=await editor.boundingBox();
  await page.locator('.library-workspace').evaluate(element=>element.scrollTop=element.scrollHeight);
  const after=await editor.boundingBox();const catalog=await page.locator('.library-workspace').boundingBox();
  assert.equal(after.y,before.y);
  assert.ok(after.y+after.height<=catalog.y,'The dock and catalog must occupy separate layout areas');
  assert.ok(await page.locator('.library-workspace').evaluate(element=>element.scrollTop>0));
  await page.getByRole('button',{name:'Item details: App 0',exact:true}).click();
  const populatedInspector=await page.locator('.library-candidate-inspector').boundingBox();
  const populatedTools=await page.locator('.app-library-tools').boundingBox();
  assert.ok(populatedInspector.y+populatedInspector.height<=populatedTools.y, 'A tall catalog must not shrink the selected app row into its search tools');
  await page.locator('.library-candidate-inspector').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search apps…',exact:true}).fill('App 69');
  await page.getByRole('button',{name:'Item details: App 69',exact:true}).waitFor();
  await page.getByRole('button',{name:'Item details: App 69',exact:true}).click();
  const inspector=await page.locator('.library-candidate-inspector').boundingBox();
  const tools=await page.locator('.app-library-tools').boundingBox();
  assert.ok(inspector.y+inspector.height<=tools.y, 'The selected app and search tools must not overlap');
  assert.ok(inspector.y>=catalog.y, 'Selection must be visible within the catalog scroll area');

  assert.deepEqual(errors,[]);await page.close();
});

test('a delayed config reply cannot replace the newer dock or replay its appearance', async () => {
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[app]})});
  await page.locator('.tile[data-id="editor"]').waitFor();
  await page.evaluate(async()=>{
    const old=window.__TAURI__.core.invoke;const snapshot=await old('get_config');let calls=0;
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='get_config'?(++calls===1?new Promise(resolve=>{window.releaseOldConfig=()=>resolve(snapshot);}):Promise.resolve({...snapshot,theme:'light',pinned:[{id:'newer',kind:'app',name:'Newer app',path:'C:/newer.exe',args:[]}]})):old(cmd,args);
    const listeners=window.__listeners['booki://config-changed']||[];
    listeners.forEach(callback=>callback({payload:{origin:'external-first'}}));
    listeners.forEach(callback=>callback({payload:{origin:'external-second'}}));
  });
  await page.locator('.tile[data-id="newer"]').waitFor();
  await page.evaluate(()=>window.releaseOldConfig());
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.tile[data-id="newer"]').count(),1);
  assert.equal(await page.locator('.tile[data-id="editor"]').count(),0);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.deepEqual(errors,[]);await page.close();
});

test('native icon refresh retries extraction while utilities remain searchable in a folded section', async () => {
  const {page,errors}=await openPage(browser,port,'settings.html',{initScript:`const old=window.__TAURI__.core.invoke;window.iconReady=false;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='list_installed_apps'?Promise.resolve([{items:[{name:'Editor',path:'C:/editor.exe'},{name:'Browser',path:'C:/browser.exe'},{name:'PowerShell',path:'C:/Windows/powershell.exe'}]}]):cmd==='app_icon'?Promise.resolve(window.iconReady?'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>':null):old(cmd,args);`});
  await page.getByRole('navigation').getByRole('button',{name:'Apps & folders',exact:true}).click();
  await page.getByRole('button',{name:'Item details: Editor',exact:true}).waitFor();
  const tools=page.locator('.app-library-utilities');
  assert.equal(await tools.getAttribute('open'),null);
  assert.equal(await page.getByRole('button',{name:'Item details: PowerShell',exact:true}).isVisible(),false);
  await page.evaluate(()=>window.iconReady=true);
  await page.getByRole('button',{name:'Refresh list',exact:true}).click();
  await page.getByRole('button',{name:'Item details: Editor',exact:true}).locator('img').waitFor();
  await page.getByRole('searchbox',{name:'Search apps…',exact:true}).fill('powershell');
  await page.getByRole('button',{name:'Item details: PowerShell',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add app: PowerShell',exact:true}).click();
  await waitForAsyncCondition(page, async()=>(await window.__TAURI__.core.invoke('get_config')).pinned.some(item=>item.name==='PowerShell'));
  assert.deepEqual(errors,[]);await page.close();
});

test('dock position exposes labelled edges and alignment even when auto-hide is off', async () => {
  const {page,errors}=await openPage(browser,port,'settings.html',{cfg:makeConfig({autoHideMode:'off'}),viewport:{width:520,height:780}});
  await page.getByRole('navigation').getByRole('button',{name:'Dock',exact:true}).click();
  await page.getByRole('button',{name:'Move the dock here: Left',exact:true}).click();
  await page.locator('.position-notch').getByRole('radio',{name:'End',exact:true}).click();
  await waitForAsyncCondition(page, async()=>{const cfg=await window.__TAURI__.core.invoke('get_config');return cfg.edge==='left'&&cfg.notchPosition==='end';});
  assert.equal(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
});

test('Windows known folders use the selected group and participate in undo', async () => {
  const {page,errors}=await openPage(browser,port,'settings.html',{cfg:makeConfig({pinned:[{id:'group',kind:'group',name:'Work',children:[]}]}),initScript:`const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='known_folders'?Promise.resolve([['documents','C:/Users/Owner/Documents']]):old(cmd,args);`});
  await page.getByRole('navigation').getByRole('button',{name:'Apps & folders',exact:true}).click();
  await page.locator('.library-destination select').selectOption('group');
  await page.locator('.app-library-folders-wrap summary').click();
  await page.getByRole('button',{name:'Documents',exact:true}).click();
  await waitForAsyncCondition(page, async()=>{const cfg=await window.__TAURI__.core.invoke('get_config');return cfg.pinned.length===1&&cfg.pinned[0].id==='group'&&cfg.pinned[0].name==='Work'&&cfg.pinned[0].children?.[0]?.kind==='folder'&&cfg.pinned[0].children[0].path==='C:/Users/Owner/Documents';});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await waitForAsyncCondition(page, async()=>{const cfg=await window.__TAURI__.core.invoke('get_config');return cfg.pinned.length===1 && cfg.pinned[0].id==='group' && (cfg.pinned[0].children || []).length===0;});
  assert.deepEqual(errors,[]);await page.close();
});

test('the dock quick catalog folds utilities, skips hidden rows with the keyboard and searches across them', async () => {
  const {page,errors}=await openPage(browser,port,'index.html',{initScript:`const old=window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='list_installed_apps'?Promise.resolve([{items:[{name:'Editor',path:'C:/editor.exe'},{name:'Browser',path:'C:/browser.exe'},{name:'PowerShell',path:'C:/Windows/powershell.exe'}]}]):old(cmd,args);`});
  await page.locator('.tile.hint').click();
  const utility=page.locator('.add-utilities');
  await utility.waitFor();
  assert.equal(await utility.getAttribute('open'),null);
  assert.equal(await page.getByRole('button',{name:'Add app: PowerShell',exact:true}).isVisible(),false);
  const search=page.getByRole('searchbox',{name:'Search apps or widgets',exact:true});
  await search.focus();await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('.add-row.active .add-name').textContent(),'Editor');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.add-row.active .add-name').textContent(),'Browser');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.add-row.active .add-name').textContent(),'Editor');
  await utility.locator('summary').click();
  assert.equal(await page.getByRole('button',{name:'Add app: PowerShell',exact:true}).isVisible(),true);
  await search.fill('powershell');
  assert.equal(await page.locator('.add-row').count(),1);
  assert.equal(await utility.getAttribute('open'),'');
  await page.keyboard.press('Enter');
  await waitForAsyncCondition(page,async()=> (await window.__TAURI__.core.invoke('get_config')).pinned.some(pin=>pin.name==='powershell'));
  assert.equal(await page.getByRole('button',{name:'In dock: PowerShell',exact:true}).getAttribute('aria-disabled'),'true');
  assert.deepEqual(errors,[]);await page.close();
});


test('quick add preserves search and never marks failed app or widget saves as pinned', async () => {
  const {page,errors}=await openPage(browser,port,'index.html',{initScript:`const old=window.__TAURI__.core.invoke;window.failQuickSave=false;
    window.__TAURI__.core.invoke=(cmd,args)=>cmd==='list_installed_apps'?Promise.resolve([{items:[{name:'Editor',path:'C:/editor.exe'}]}]):cmd==='save_config'&&window.failQuickSave?Promise.reject('disk full'):old(cmd,args);`});
  await page.locator('.tile.hint').click();
  const search=page.getByRole('searchbox',{name:'Search apps or widgets',exact:true});
  await search.fill('editor');
  await page.evaluate(()=>{window.failQuickSave=true;});
  await page.getByRole('button',{name:'Add app: Editor',exact:true}).click();
  await page.locator('.add-error[role="alert"]').waitFor();
  assert.equal(await page.locator('#stack.open').count(),1);
  assert.equal(await search.inputValue(),'editor');
  assert.equal(await page.getByRole('button',{name:'Add app: Editor',exact:true}).isEnabled(),true);
  assert.equal((await page.evaluate(()=>window.__TAURI__.core.invoke('get_config'))).pinned.length,0);
  await page.evaluate(()=>{window.failQuickSave=false;});
  await page.getByRole('button',{name:'Add app: Editor',exact:true}).click();
  await waitForAsyncCondition(page,async()=> (await window.__TAURI__.core.invoke('get_config')).pinned.length===1);
  await page.getByRole('button',{name:'In dock: Editor',exact:true}).waitFor();
  assert.equal(await page.locator('.add-error').count(),0);
  await search.fill('');await page.getByRole('tab',{name:'Widgets',exact:true}).click();
  await page.evaluate(()=>{window.failQuickSave=true;});
  await page.locator('.add-wcell').filter({hasText:'Clock'}).click();
  await page.locator('.add-error[role="alert"]').waitFor();
  assert.equal(await page.locator('.add-wcell.pinned').count(),0);
  assert.equal(await page.locator('#stack.open').count(),1);
  await page.evaluate(()=>{window.failQuickSave=false;});
  await page.locator('.add-wcell').filter({hasText:'Clock'}).click();
  await waitForAsyncCondition(page,async()=> (await window.__TAURI__.core.invoke('get_config')).pinned.some(pin=>pin.widget==='clock'));
  assert.equal(await page.locator('.add-error').count(),0);
  assert.deepEqual(errors,[]);await page.close();
});


test('durable empty groups remain recognizable and custom group icons have a useful fallback', async () => {
  const cover='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="blue"/></svg>');
  const pins=[{id:'custom',kind:'group',name:'Work',children:[],icon:cover},{id:'empty',kind:'group',name:'Projects',children:[]}];
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:pins})});
  const custom=page.locator('.tile[data-id="custom"] .group-grid');
  assert.equal(await custom.locator('img.group-cover').getAttribute('src'),cover);
  assert.equal(await page.locator('.tile[data-id="empty"] .group-grid > svg').count(),1);
  await custom.locator('img').evaluate(img=>img.dispatchEvent(new Event('error')));
  assert.equal(await custom.locator('svg').count(),1);
  await page.locator('.tile[data-id="empty"]').click();await page.locator('#stack.open').waitFor();
  assert.equal(await page.locator('.stack-add').count(),2);
  assert.deepEqual((await page.evaluate(()=>window.__TAURI__.core.invoke('get_config'))).pinned,pins);
  assert.deepEqual(errors,[]);await page.close();
});


test('tasks retry against the recovered live widget and preserve later appearance changes', async () => {
  const task={id:'task',text:'Prepare release',done:false};
  const pin={id:'tasks',kind:'widget',widget:'tasks',name:'Tasks',style:{variant:'soft',color:'#223344',tasks:[task]}};
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[pin]})});
  await page.evaluate(()=>{const old=window.__TAURI__.core.invoke;window.failTasks=true;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='save_config'&&window.failTasks?Promise.reject('disk full'):old(cmd,args);});
  await page.locator('.tile[data-id="tasks"]').click();
  const panel=page.getByRole('dialog',{name:'Tasks',exact:true});
  await panel.getByRole('checkbox',{name:'Prepare release',exact:true}).check();
  await panel.locator('.productivity-save-error').waitFor();
  assert.equal((await page.evaluate(()=>window.__TAURI__.core.invoke('get_config'))).pinned[0].style.tasks[0].done,false);
  await page.evaluate(async()=>{window.failTasks=false;const cfg=await window.__TAURI__.core.invoke('get_config');cfg.pinned[0].style.color='#abcdef';await window.__TAURI__.core.invoke('save_config',{patch:{pinned:cfg.pinned}});for(const cb of window.__listeners['booki://config-changed']||[])cb({payload:{}});});
  await panel.getByRole('button',{name:'Retry',exact:true}).click();
  await waitForAsyncCondition(page,async()=> (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.tasks[0].done);
  const saved=await page.evaluate(()=>window.__TAURI__.core.invoke('get_config'));
  assert.equal(saved.pinned[0].style.color,'#abcdef');
  assert.equal(await panel.locator('.productivity-save-error').count(),0);
  await panel.getByRole('button',{name:'Rename: Prepare release',exact:true}).click();
  const rename=panel.getByRole('textbox',{name:'Rename',exact:true});
  await rename.fill('Review release');await page.evaluate(()=>{window.failTasks=true;});
  await rename.press('Enter');await panel.locator('.productivity-save-error').waitFor();
  assert.equal(await rename.inputValue(),'Review release');
  await page.evaluate(()=>{window.failTasks=false;});
  await panel.getByRole('button',{name:'Retry',exact:true}).click();
  await waitForAsyncCondition(page,async()=> (await window.__TAURI__.core.invoke('get_config')).pinned[0].style.tasks[0].text==='Review release');
  assert.deepEqual(errors,[]);await page.close();
});


test('a removed productivity widget keeps its task input and cannot be resurrected by a stale panel', async () => {
  const pin={id:'tasks',kind:'widget',widget:'tasks',name:'Tasks',style:{tasks:[]}};
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[pin]})});
  await page.locator('.tile[data-id="tasks"]').click();
  const panel=page.getByRole('dialog',{name:'Tasks',exact:true});
  const input=panel.locator('.focus-new-task');await input.fill('Keep this draft');
  await page.evaluate(async()=>{await window.__TAURI__.core.invoke('save_config',{patch:{pinned:[]}});for(const cb of window.__listeners['booki://config-changed']||[])cb({payload:{}});});
  await page.locator('.tile.hint').waitFor();
  await input.press('Enter');await panel.locator('.productivity-save-error').waitFor();
  assert.equal(await input.inputValue(),'Keep this draft');
  assert.equal(await panel.getByRole('button',{name:'Retry',exact:true}).count(),0);
  assert.equal((await page.evaluate(()=>window.__TAURI__.core.invoke('get_config'))).pinned.length,0);
  assert.deepEqual(errors,[]);await page.close();
});
