import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig, waitForAsyncCondition } from './harness.mjs';
import { physicalMaterialShapes } from '../src/material-geometry.js';
const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const app = { id: 'editor', kind: 'app', name: 'An editor with an unusually long application name that still needs to remain readable', path: 'C:/editor.exe', args: [] };

for (const edge of ['bottom', 'top', 'left', 'right']) {
  test(`Booki app hints fit the ${edge} edge with visible labels and no native title`, async () => {
    const { page, errors } = await openPage(browser, port, 'index.html', {
      cfg: makeConfig({ edge, pinned: [app] }), viewport: { width: 520, height: 600 },
    });
    const tile = page.locator('.tile[data-id="editor"]');
    assert.equal(await tile.getAttribute('title'), null);
    assert.equal(await tile.getAttribute('aria-label'), app.name);
    await tile.hover();
    await page.locator('.dock-tip.show').waitFor();
    assert.equal(await page.locator('.dock-tip strong').textContent(), app.name);
    assert.equal(await page.locator('.dock-tip-mark svg').count(), 0, 'the Remove control is not an app icon');
    assert.equal(await page.locator('.dock-tip-mark').textContent(), 'A');
    assert.equal(await tile.locator('.label').evaluate(el => getComputedStyle(el).opacity), '0');
    assert.equal(await page.locator('.dock-tip-detail').textContent(), 'Open app');
    const r = await page.locator('.dock-tip').boundingBox();
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 520 && r.y + r.height <= 600);
    assert.equal(await tile.getAttribute('aria-describedby'), 'booki-dock-tooltip');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.dock-tip.show').count(), 0);
    assert.equal(await tile.getAttribute('title'), null);
    assert.equal(await tile.getAttribute('aria-describedby'), null);
    assert.deepEqual(errors, []); await page.close();
  });
}

test('keyboard hints describe running apps and groups without exposing private widget drafts', async () => {
  const notes = { id: 'notes', kind: 'widget', widget: 'notes', name: 'Notes', style: { note: 'Private draft' } };
  const group = { id: 'work', kind: 'group', name: 'Work', children: [app] };
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: [app, group, notes], showLabels: false, focusIfRunning: true }) });
  const tile = page.locator('.tile[data-id="editor"]');
  await tile.evaluate(el => { el.dataset.running = 'true'; });
  await tile.focus(); await page.locator('.dock-tip.show').waitFor();
  assert.equal(await page.locator('.dock-tip-detail').textContent(), 'Running · switch to window');
  await page.locator('.tile[data-id="work"]').focus();
  await page.waitForFunction(() => document.querySelector('.dock-tip-detail').textContent === '1 item · open group');
  await page.locator('.tile[data-id="notes"]').focus();
  await page.waitForFunction(() => document.querySelector('.dock-tip-detail').textContent === 'Open widget');
  assert.equal((await page.locator('.dock-tip').textContent()).includes('Private draft'), false);
  assert.equal(await page.locator('.tile[data-id="notes"]').getAttribute('title'), null);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []); await page.close();
});

test('resting and held-pointer dock hints do not resize the stage or reapply native material', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', {
    cfg: makeConfig({ pinned: [app] }),
    initScript: `window.nativeWrites = []; const previous = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd,args) => {
        if (cmd === 'set_material' || cmd === 'set_dock_frame') window.nativeWrites.push({cmd,args});
        return cmd === 'set_material' ? Promise.resolve(true) : previous(cmd,args);
      };`,
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.nativeWrites = []; });
  await page.waitForTimeout(2200);
  assert.deepEqual(await page.evaluate(() => window.nativeWrites), []);
  await page.locator('.tile[data-id="editor"]').hover();
  await page.locator('.dock-tip.show').waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.nativeWrites = []; });
  await page.waitForTimeout(2200);
  assert.deepEqual(await page.evaluate(() => window.nativeWrites), []);
  assert.deepEqual(errors, []); await page.close();
});

test('async persistence polling actually waits and rejects an unmet condition', async () => {
  const { page } = await openPage(browser, port, 'index.html');
  await assert.rejects(waitForAsyncCondition(page, async () => false, undefined, { timeout: 80, polling: 10 }), /did not become true/);
  await page.evaluate(() => { window.conditionReady = false; setTimeout(() => { window.conditionReady = true; }, 150); });
  await waitForAsyncCondition(page, async () => window.conditionReady);
  assert.equal(await page.evaluate(() => window.conditionReady), true);
  await page.close();
});

test('native material ignores subpixel noise while respecting physical edges, corners and negative coordinates', () => {
  const shape = [10.1, 20.1, 100, 40, 12, 12, 12, 12];
  assert.deepEqual(physicalMaterialShapes([shape], 1), physicalMaterialShapes([[10.11, 20.11, 100, 40, 12, 12, 12, 12]], 1));
  assert.notDeepEqual(physicalMaterialShapes([shape], 1), physicalMaterialShapes([[10.6, ...shape.slice(1)]], 1));
  assert.deepEqual(physicalMaterialShapes([[-.5, -.5, 1, 1, 0, 0, 0, 0]], 1)[0].slice(0, 4), [-1, -1, 2, 2]);
  assert.deepEqual(physicalMaterialShapes([[.4, .4, 10.4, 20.4, 2.4, 2.4, 2.4, 2.4]], 1.25)[0], [1, 1, 13, 25, 3, 3, 3, 3]);
});


test('a startup save error offers retry beside the dock without covering its buttons on any edge', async () => {
  for (const edge of ['bottom', 'top', 'left', 'right']) {
    const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({edge}),viewport:{width:520,height:600},initScript:`const old=window.__TAURI__.core.invoke;window.__TAURI__.core.invoke=(cmd,args)=>cmd==='save_config'?Promise.reject('disk full'):old(cmd,args);`});
    await page.locator('#undo-toast').getByRole('button',{name:'Retry',exact:true}).waitFor();
    const bar=await page.locator('.dock').boundingBox(), toast=await page.locator('#undo-toast').boundingBox();
    const overlap=Math.max(0,Math.min(bar.x+bar.width,toast.x+toast.width)-Math.max(bar.x,toast.x))*Math.max(0,Math.min(bar.y+bar.height,toast.y+toast.height)-Math.max(bar.y,toast.y));
    assert.equal(overlap,0,edge);
    assert.ok(toast.x>=0&&toast.y>=0&&toast.x+toast.width<=520&&toast.y+toast.height<=600,edge);
    await page.locator('.tile.hint').click();
    await page.locator('#stack.open').waitFor();
    assert.equal(await page.locator('#stack.open').count(),1,edge);
    assert.deepEqual(errors,[]);await page.close();
  }
});


test('hiding running indicators retains cached hints and switches to the existing app window', async () => {
  const {page,errors}=await openPage(browser,port,'index.html',{cfg:makeConfig({pinned:[app],showIndicators:false,focusIfRunning:true}),initScript:`const old=window.__TAURI__.core.invoke;window.activations=[];
    window.__TAURI__.core.invoke=(cmd,args)=>{if(cmd==='list_windows')return Promise.resolve([{hwnd:42,exe:'C:/editor.exe',title:'Editor'}]);if(cmd==='focus_window'||cmd==='launch_app')window.activations.push({cmd,args});return old(cmd,args);};`});
  const tile=page.locator('.tile[data-id="editor"]');
  await page.waitForFunction(()=>document.querySelector('.tile[data-id="editor"]').dataset.running==='true');
  assert.equal(await tile.evaluate(el=>getComputedStyle(el,'::after').display),'none');
  await tile.hover();await page.locator('.dock-tip.show').waitFor();
  assert.equal(await page.locator('.dock-tip-detail').textContent(),'Running · switch to window');
  await tile.click();
  await page.waitForFunction(()=>window.activations.length>0);
  assert.deepEqual(await page.evaluate(()=>window.activations),[{cmd:'focus_window',args:{hwnd:42}}]);
  assert.deepEqual(errors,[]);await page.close();
});
