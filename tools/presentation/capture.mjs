/* Capture the actual built frontend with safe fixtures, never a user's config. */
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serveDist, launchBrowser, openPage, makeConfig } from '../../tests/harness.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'public'); mkdirSync(out, { recursive: true });
copyFileSync(resolve(here, '../../assets/brand/svg/logo.svg'), resolve(out, 'logo.svg'));
copyFileSync(resolve(here, '../../assets/brand/svg/isotype.svg'), resolve(out, 'mark.svg'));
copyFileSync(resolve(here, 'fonts/Inter.ttf'), resolve(out, 'Inter.ttf'));
const { srv, port } = await serveDist(); const browser = await launchBrowser();
const camera = { newPage: (options) => browser.newPage({ ...options, deviceScaleFactor: 2 }) };
const app = (id, name, glyph) => ({ id, name, kind: 'app', path: `C:/Examples/${name}.exe`, icon: `lib:${glyph}:badge` });
const widget = (name, style = {}) => ({ id: `w-${name}`, kind: 'widget', widget: name, style });
const pins = [app('files', 'Files', 'folder'), app('code', 'Editor', 'code'), app('terminal', 'Terminal', 'terminal'), { id: 'sep', kind: 'separator' }, widget('clock'), widget('cpu'), widget('tasks'), widget('timer')];
try {
  const { page: dock, errors: dockErrors } = await openPage(camera, port, 'index.html', { cfg: makeConfig({ captureVisible: true, theme: 'light', pinned: pins, iconSize: 52, spacing: 8 }), viewport: { width: 1440, height: 420 } });
  await dock.mouse.move(0, 0); await dock.waitForTimeout(400);
  const rect = await dock.locator('#dock').boundingBox();
  await dock.screenshot({ path: resolve(out, 'dock.png'), omitBackground: true, clip: { x: Math.max(0, rect.x - 20), y: Math.max(0, rect.y - 20), width: rect.width + 40, height: rect.height + 40 } });
  if (dockErrors.length) throw new Error(dockErrors.join('\n')); await dock.close();
  for (const language of ['en', 'es']) {
    const cfg = makeConfig({ pinned: pins, theme: 'light', language, autoHideMode: 'smart', lastProfile: language === 'es' ? 'Trabajo' : 'Work' });
    const { page, errors } = await openPage(camera, port, 'settings.html', { cfg, viewport: { width: 1280, height: 960 } });
    await page.screenshot({ path: resolve(out, `home-${language}.png`) });
    await page.getByRole('button', { name: 'Widgets', exact: true }).click();
    await page.waitForTimeout(250); // let the tab's scroll-reset animation frame finish
    const timer = page.locator('.widget-store-card').filter({ hasText: language === 'es' ? 'Temporizador' : 'Timer' }).first();
    await timer.evaluate((target) => { const main = target.closest('.s-content'); main.scrollTop += target.getBoundingClientRect().top - main.getBoundingClientRect().top - 110; });
    await page.screenshot({ path: resolve(out, `widgets-${language}.png`) });
    for (const type of ['timer', 'tasks', 'calendar', 'weather']) {
      await page.locator('.widget-store-card').filter({ has: page.locator(`[data-widget="${type}"]`) }).screenshot({ path: resolve(out, `widget-${type}-${language}.png`) });
    }
    await page.evaluate(() => {
      const old = window.__TAURI__.core.invoke;
      window.__TAURI__.core.invoke = (cmd, args) => {
        if (cmd === 'frequent_apps') return Promise.resolve([{ name: 'Browser', path: 'C:/Examples/Browser.exe', runs: 42, focus_ms: 700000 }, { name: 'Music', path: 'C:/Examples/Music.exe', runs: 31, focus_ms: 600000 }, { name: 'Mail', path: 'C:/Examples/Mail.exe', runs: 15, focus_ms: 250000 }]);
        if (cmd === 'list_installed_apps') return Promise.resolve([{ name: 'Examples', items: ['Browser', 'Calendar', 'Camera', 'Editor', 'Files', 'Mail', 'Music', 'Notes', 'Photos', 'Settings', 'Terminal', 'Videos'].map((name) => ({ name, path: `C:/Examples/${name}.exe` })) }]);
        return old(cmd, args);
      };
    });
    await page.getByRole('button', { name: language === 'es' ? 'Apps y carpetas' : 'Apps & folders', exact: true }).click();
    await page.locator('.app-library-card').first().waitFor();
    await page.waitForTimeout(250);
    await page.locator('.app-library-tools').evaluate((target) => { const main = target.closest('.s-content'); main.scrollTop += target.getBoundingClientRect().top - main.getBoundingClientRect().top - 100; });
    await page.locator('.app-library-tools').locator('xpath=ancestor::section[1]').screenshot({ path: resolve(out, `apps-${language}.png`) });
    if (errors.length) throw new Error(errors.join('\n')); await page.close();
  }
  console.log('Captured real Booki UI with example data in English and Spanish.');
} finally { await browser.close(); srv.close(); }
