import test from 'node:test';
import assert from 'node:assert/strict';
import { serveDist, launchBrowser, openPage, makeConfig } from './harness.mjs';

const { srv, port } = await serveDist();
const browser = await launchBrowser();
test.after(async () => { await browser.close(); srv.close(); });
const app = { id: 'editor', kind: 'app', name: 'Editor', path: 'C:/editor.exe', args: [] };

test('Profiles report a load failure and retry without changing the dock', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', {
    cfg: makeConfig({ pinned: [app], lastProfile: 'Removed profile' }),
    initScript: `const invoke = window.__TAURI__.core.invoke;
      window.profileAttempts = 0;
      window.__TAURI__.core.invoke = (command, args) => command === 'profile_list'
        ? (++window.profileAttempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(['Work']))
        : invoke(command, args);`,
  });
  await page.getByRole('navigation').getByRole('button', { name: 'System', exact: true }).click();
  const failure = page.locator('.profile-error[role="alert"]');
  await failure.waitFor();
  await failure.getByRole('button', { name: 'Refresh list', exact: true }).click();
  await page.locator('.profile-choice').filter({ hasText: 'Work' }).waitFor();
  assert.equal(await page.evaluate(() => window.profileAttempts), 2);
  assert.equal(await page.evaluate(async () => (await window.__TAURI__.core.invoke('get_config')).pinned[0].id), 'editor');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Library keeps pin labels visible in short windows and Escape returns to the selected pin', async () => {
  const { page, errors } = await openPage(browser, port, 'settings.html', {
    viewport: { width: 768, height: 540 }, cfg: makeConfig({ theme: 'light', pinned: [app] }),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Apps & folders', exact: true }).click();
  for (const name of ['Add Settings icon', 'Separator', 'Recycle Bin']) {
    // Labelled actions stay readable without hovering over their icons.
    const button = page.getByRole('button', { name, exact: true });
    assert.ok((await button.innerText()).trim().length > 0);
  }
  const pin = page.locator('.library-pin').getByRole('button', { name: 'Editor', exact: true });
  const visibleLabel = await page.locator('.library-pin-name').evaluate((label) => {
    const text = label.getBoundingClientRect();
    const strip = label.closest('.library-pin-strip').getBoundingClientRect();
    return text.top >= strip.top && text.bottom <= strip.bottom;
  });
  assert.ok(visibleLabel, 'the pin name is inside the scroll strip');
  await pin.click();
  await page.locator('.library-inspector').press('Escape');
  assert.equal(await pin.evaluate((button) => button === document.activeElement), true);
  assert.equal(await page.locator('.library-inspector').isVisible(), false);
  assert.deepEqual(errors, []);
  await page.close();
});
