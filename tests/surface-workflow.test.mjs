import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serveDist, launchBrowser, openPage as openHarnessPage, makeConfig } from './harness.mjs';
import { surfaceAlpha } from '../src/surface.js';

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
async function openPage(...args) { const result = await openHarnessPage(...args); result.page.setDefaultTimeout(10000); return result; }
const pins = ['Editor', 'Browser', 'Files'].map((name) => ({ id: name, kind: 'app', name, path: `C:/${name}.exe`, args: [] }));
async function patch(page, value) {
  await page.evaluate(async (patch) => {
    await window.__TAURI__.core.invoke('save_config', { patch });
    for (const cb of window.__listeners['booki://config-changed'] || []) cb({ payload: {} });
  }, value);
}

test('one finish selector preserves layout/theme and shows the selected custom finish', async () => {
  const cfg = makeConfig({ theme: 'light', iconSize: 60, spacing: 3, cornerRadius: 4, nativeMaterial: false, pinned: pins });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg, viewport: { width: 520, height: 700 } });
  await page.getByRole('navigation').getByRole('button', { name: 'Appearance', exact: true }).click();
  assert.equal(await page.locator('.finish-card').count(), 4);
  assert.equal(await page.locator('h1').evaluate((el) => getComputedStyle(el).fontSize), '25px');
  assert.equal(await page.locator('body').evaluate((el) => getComputedStyle(el).getPropertyValue('--set-bg').trim()), '#fff');
  assert.equal(await page.locator('.surface-chip').count(), 0);
  await page.getByRole('button', { name: 'Tinted Glass', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.finish-tinted')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  for (const key of ['theme', 'iconSize', 'spacing', 'cornerRadius', 'nativeMaterial', 'pinned']) assert.deepEqual(saved[key], cfg[key]);
  assert.equal(await page.locator('.finish-card[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('.live-preview-bar').evaluate((el) => getComputedStyle(el).borderRadius), '12px');
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
  const slider = page.getByText('Opacity', { exact: true }).locator('..').locator('..').locator('input[type="range"]');
  if (await slider.count()) assert.equal(await slider.getAttribute('min'), '0');
  assert.deepEqual(errors, []);
  await page.close();
});

test('every material uses the canonical opacity once and tracks radius changes', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: pins }) });
  for (const surfaceStyle of ['glass', 'mica', 'solid']) {
    for (const materialStrength of [0, 38, 65, 100]) {
      await patch(page, { surfaceStyle, materialStrength, surfaceTint: '#223344', cornerRadius: materialStrength % 25 });
      await page.waitForFunction(({ style, alpha }) => document.body.classList.contains(`surface-${style}`) && Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--glass-alpha')) - alpha) < .00001, { style: surfaceStyle, alpha: surfaceAlpha({ surfaceStyle, materialStrength }) });
      // Read the target color rather than the intermediate CSS transition.
      const actual = await page.locator('.dock').evaluate((el) => {
        el.style.transition = 'none';
        const cs = getComputedStyle(el);
        return { fill: cs.backgroundColor, radius: cs.borderRadius };
      });
      const numbers = actual.fill.match(/[\d.]+/g).map(Number);
      const alpha = numbers.length === 4 ? numbers[3] : 1;
      assert.ok(Math.abs(alpha - surfaceAlpha({ surfaceStyle, materialStrength })) < .006, `${surfaceStyle} ${materialStrength}: ${actual.fill}`);
      assert.equal(actual.radius, `${materialStrength % 25 + 8}px`);
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('native reports coalesce while a request is delayed and disabling queues the final hide', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: pins }) });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__nativeReports = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd !== 'set_material') return old(cmd, args);
      window.__nativeReports.push(args);
      if (args.shapes.length && window.__nativeReports.length === 1) return new Promise((resolve) => { window.__finishMaterial = resolve; });
      return Promise.resolve(true);
    };
  });
  await patch(page, { surfaceTint: '#223344' });
  await page.waitForFunction(() => !!window.__finishMaterial);
  for (const radius of [0, 24, 3]) {
    await patch(page, { cornerRadius: radius });
    await page.waitForFunction((radius) => document.documentElement.style.getPropertyValue('--dock-r') === `${radius + 8}px`, radius);
    await page.waitForTimeout(50);
  }
  assert.equal(await page.evaluate(() => window.__nativeReports.length), 1);
  await patch(page, { nativeMaterial: false });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__finishMaterial(true));
  await page.waitForFunction(() => window.__nativeReports.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__nativeReports.at(-1).shapes), []);
  assert.equal(await page.locator('body.native-material').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('native blur stays hidden through a long nonuniform reveal then resumes at rest', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: pins }) });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__nativeReports = [];
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'set_material') { window.__nativeReports.push(args); return Promise.resolve(true); }
      return old(cmd, args);
    };
    const style = document.createElement('style');
    style.textContent = '@keyframes test-reveal { from { transform: scale(1,.2); opacity:.4; } to { transform:none; opacity:1; } } .dock.test-reveal { animation: test-reveal 950ms linear; }';
    document.head.append(style);
    document.querySelector('.dock').classList.add('test-reveal');
  });
  await patch(page, { surfaceTint: '#445566' });
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(() => window.__nativeReports.length > 0));
  assert.equal(await page.evaluate(() => window.__nativeReports.some((r) => r.shapes.length)), false);
  await page.waitForFunction(() => window.__nativeReports.some((r) => r.shapes.length));
  assert.equal(await page.locator('body.native-material').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('closing Settings waits for the final edit and uses the Settings-only destroy permission', async () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/settings-window.json', import.meta.url)));
  assert.deepEqual(capability.windows, ['settings']);
  assert.ok(capability.permissions.includes('core:window:allow-destroy'));
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__closed = 0;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'plugin:window|destroy') { window.__closed++; return Promise.resolve(); }
      if (cmd === 'save_config') return new Promise((resolve) => { window.__finishSave = () => resolve(old(cmd, args)); });
      return old(cmd, args);
    };
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Tinted Glass', exact: true }).click();
  await page.evaluate(() => window.__nativeCloseRequested({ preventDefault() {} }));
  await page.waitForFunction(() => !!window.__finishSave);
  assert.equal(await page.evaluate(() => window.__closed), 0);
  await page.evaluate(() => window.__finishSave());
  await page.waitForFunction(() => window.__closed === 1);
  assert.equal((await page.evaluate(() => window.__TAURI__.core.invoke('get_config'))).surfaceStyle, 'tinted');
  assert.deepEqual(errors, []);
  await page.close();
});

test('a failed window close explains the failure and can be retried', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html');
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__attempts = 0;
    window.__TAURI__.core.invoke = (cmd, args) => cmd === 'plugin:window|destroy' ? (++window.__attempts === 1 ? Promise.reject(new Error('permission denied')) : Promise.resolve()) : old(cmd, args);
    window.__nativeCloseRequested({ preventDefault() {} });
  });
  await page.locator('.settings-close-error').waitFor();
  await page.locator('.settings-close-error').getByRole('button', { name: 'Retry' }).click();
  await page.waitForFunction(() => window.__attempts === 2);
  assert.equal(await page.locator('.settings-close-error').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('releasing a group drag removes its floating hint', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg: makeConfig({ pinned: pins, magnification: false, magnify: false }) });
  const one = await page.locator('.tile[data-id="Editor"]').boundingBox();
  const two = await page.locator('.tile[data-id="Browser"]').boundingBox();
  await page.mouse.move(one.x + one.width / 2, one.y + one.height / 2);
  await page.mouse.down();
  await page.mouse.move(two.x + two.width / 2, two.y + two.height / 2, { steps: 8 });
  await page.waitForTimeout(330);
  await page.mouse.move(two.x + two.width / 2 + 1, two.y + two.height / 2);
  await page.locator('.drop-hint.show').waitFor();
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('.drop-hint.show'));
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.equal(saved.pinned.find((pin) => pin.kind === 'group')?.children.length, 2);
  assert.deepEqual(errors, []);
  await page.close();
});

test('app source filters keep selection and searching reaches the whole library', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', { viewport: { width: 520, height: 760 } });
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'frequent_apps') return Promise.resolve([{ name: 'Editor', path: 'C:/editor.exe' }]);
      if (cmd === 'list_installed_apps') return Promise.resolve([{ items: [{ name: 'Calculator', path: 'C:/calc.exe' }] }]);
      return old(cmd, args);
    };
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.getByRole('group', { name: 'App sources' }).getByRole('button', { name: 'Most used' }).click();
  await page.getByRole('checkbox', { name: 'Select app: Editor' }).check();
  assert.equal(await page.locator('.app-library-card').filter({ hasText: 'Calculator' }).count(), 0);
  await page.getByRole('searchbox', { name: 'Search apps…' }).fill('Calculator');
  await page.locator('.app-library-card').filter({ hasText: 'Calculator' }).waitFor();
  await page.getByRole('checkbox', { name: 'Select app: Calculator' }).check();
  await page.getByRole('button', { name: 'Add selected (2)', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal((await page.evaluate(() => window.__TAURI__.core.invoke('get_config'))).pinned.length, 2);
  const order = await page.locator('.app-library-section, .apps-primary-section').evaluateAll((els) => els.map((el) => el.className));
  assert.match(order[0], /app-library-section/);
  assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the dock app panel retries failed sources and supports keyboard tabs', async () => {
  const { page, errors } = await openPage(browser, port, 'index.html');
  await page.evaluate(() => {
    const old = window.__TAURI__.core.invoke;
    window.__appScans = 0;
    window.__TAURI__.core.invoke = (cmd, args) => {
      if (cmd === 'list_installed_apps') return ++window.__appScans === 1 ? Promise.reject(new Error('unavailable')) : Promise.resolve([{ items: [{ name: 'Calculator', path: 'C:/calc.exe' }] }]);
      return old(cmd, args);
    };
  });
  await page.locator('.tile.hint').click();
  await page.getByText('Some app sources could not be loaded. Refresh to retry.', { exact: true }).waitFor();
  await page.locator('.add-head').getByRole('button', { name: 'Refresh list', exact: true }).click();
  await page.locator('.add-row').filter({ hasText: 'Calculator' }).waitFor();
  const tabs = page.getByRole('tablist');
  await tabs.getByRole('tab', { name: 'Apps', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.getByRole('tab', { name: 'Widgets', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.add-wcell').count(), 10);
  await page.locator('.add-head').getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await page.locator('#stack.open').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('system reduced transparency disables native blur without rewriting the saved finish', async () => {
  const cfg = makeConfig({ surfaceStyle: 'mica', surfaceTint: '#223344', pinned: pins, seenVersion: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version });
  const { page, errors } = await openPage(browser, port, 'index.html', { cfg });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await page.locator('body.surface-solid.reduce-transparency').waitFor();
  assert.equal(await page.locator('.dock').evaluate((el) => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await page.locator('body.native-material').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__TAURI__.core.invoke('get_config')), cfg);
  assert.deepEqual(errors, []);
  await page.close();
});

test('creating a Settings group commits its members together and cancel preserves pins', async () => {
  const cfg = makeConfig({ pinned: pins });
  const { page, errors } = await openPage(browser, port, 'settings.html', { cfg });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New group', exact: true });
  await dialog.getByRole('checkbox', { name: 'Editor', exact: true }).check();
  assert.equal(await dialog.getByRole('button', { name: 'Create group (1)' }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual((await page.evaluate(() => window.__TAURI__.core.invoke('get_config'))).pinned, pins);
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Editor', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Browser', exact: true }).check();
  await dialog.getByRole('button', { name: 'Create group (2)' }).click();
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => window.__TAURI__.core.invoke('get_config'));
  assert.equal(saved.pinned.length, 2);
  assert.deepEqual(saved.pinned[0].children, pins.slice(0, 2));
  assert.deepEqual(saved.pinned[1], pins[2]);
  assert.deepEqual(errors, []);
  await page.close();
});
