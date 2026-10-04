/* Capture the actual built frontend with safe fixtures, never a user's config. */
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serveDist, launchBrowser, openPage, makeConfig } from '../../tests/harness.mjs';
import { app, widget, tasks, city, allIcons, bridgePatch, studioPatch } from './fixtures.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'public'); mkdirSync(out, { recursive: true });
copyFileSync(resolve(here, '../../assets/brand/svg/logo.svg'), resolve(out, 'logo.svg'));
copyFileSync(resolve(here, '../../assets/brand/svg/isotype.svg'), resolve(out, 'mark.svg'));
copyFileSync(resolve(here, 'fonts/Inter.ttf'), resolve(out, 'Inter.ttf'));
const { srv, port } = await serveDist(); const browser = await launchBrowser();
const patch = bridgePatch(allIcons()) + studioPatch(resolve(here, 'fonts/Inter.ttf'));
// Append the sample-data patch to the harness's fake bridge, before the page boots.
const camera = { newPage: async (options) => {
  const page = await browser.newPage({ ...options, deviceScaleFactor: 2 });
  const add = page.addInitScript.bind(page); page.addInitScript = (source) => add(source + patch); return page;
} };
const pinsFor = (locale) => [
  ...['files', 'browser', 'mail', 'music', 'photos', 'editor', 'terminal', 'chat'].map(app), { id: 'sep', kind: 'separator' },
  widget('clock'), widget('weather', city(locale)), widget('cpu'), widget('tasks', { tasks: tasks(locale) }), widget('media'),
];
const fail = (errors) => { if (errors.length) throw new Error(errors.join('\n')); };
async function shootDock(locale, theme) {
  const cfg = makeConfig({ captureVisible: true, theme, language: locale, pinned: pinsFor(locale), iconSize: 56, spacing: 8 });
  const { page, errors } = await openPage(camera, port, 'index.html', { cfg, viewport: { width: 1700, height: 760 } });
  await page.mouse.move(0, 0); await page.waitForTimeout(800);
  const bar = await page.locator('#dock').boundingBox();
  const clip = { x: bar.x - 24, y: bar.y - 24, width: bar.width + 48, height: bar.height + 48 };
  await page.screenshot({ path: resolve(out, `dock-${theme}-${locale}.png`), omitBackground: true, clip });
  if (theme === 'light') {
    // The tasks widget opens its own local list above the bar.
    await page.locator('.tile[data-widget="tasks"]').click(); await page.waitForTimeout(500);
    const panel = await page.locator('.productivity-panel').boundingBox();
    await page.screenshot({ path: resolve(out, `tasks-${locale}.png`), omitBackground: true, clip: { x: panel.x - 30, y: panel.y - 30, width: panel.width + 60, height: panel.height + 38 } });
  }
  fail(errors); await page.close();
}
// Soft abstract wallpapers, drawn once so the film composites cheap stills.
async function wallpaper(name, css) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(`<body style="margin:0;width:1920px;height:1080px;overflow:hidden;background:${css.base}">${css.blobs.map(([x, y, r, c]) => `<div style="position:absolute;left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${c};filter:blur(140px)"></div>`).join('')}</body>`);
  await page.waitForTimeout(200); await page.screenshot({ path: resolve(out, `wallpaper-${name}.jpg`), quality: 94, type: 'jpeg' }); await page.close();
}
try {
  await wallpaper('light', { base: '#f4efe8', blobs: [[260, 220, 520, '#f6c99a'], [1500, 160, 560, '#c9dcff'], [1100, 900, 620, '#f3d6e6'], [300, 1000, 420, '#d8ecdf']] });
  await wallpaper('dark', { base: '#0d0d12', blobs: [[300, 260, 520, '#5b3a1e'], [1550, 220, 560, '#1d3266'], [1000, 980, 640, '#3a1f4a'], [200, 1000, 360, '#123b33']] });
  for (const locale of ['en', 'es']) {
    await shootDock(locale, 'light'); await shootDock(locale, 'dark');
    const cfg = makeConfig({ pinned: pinsFor(locale), theme: 'light', language: locale, autoHideMode: 'smart', lastProfile: locale === 'es' ? 'Trabajo' : 'Work' });
    const { page, errors } = await openPage(camera, port, 'settings.html', { cfg, viewport: { width: 1180, height: 760 } });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(out, `home-${locale}.png`) });
    await page.getByRole('button', { name: 'Widgets', exact: true }).click();
    await page.waitForTimeout(250); // let the tab's scroll-reset animation frame finish
    for (const type of ['timer', 'tasks', 'calendar', 'weather']) {
      await page.locator('.widget-store-card').filter({ has: page.locator(`[data-widget="${type}"]`) }).screenshot({ path: resolve(out, `widget-${type}-${locale}.png`) });
    }
    await page.evaluate(({ names, icons }) => {
      const old = window.__TAURI__.core.invoke;
      const item = (name) => ({ name, path: `C:/Examples/${name.replace(/ /g, '')}.exe` });
      window.__TAURI__.core.invoke = (cmd, args) => {
        if (cmd === 'frequent_apps') return Promise.resolve([['Notes', 42], ['Calendar', 31], ['Videos', 24], ['Camera', 15]].map(([name, runs]) => ({ ...item(name), runs, focus_ms: runs * 20000 })));
        if (cmd === 'list_installed_apps') return Promise.resolve([{ name: 'Examples', items: names.map(item) }]);
        if (cmd === 'app_icon') return Promise.resolve(icons[args.path] || '');
        return old(cmd, args);
      };
    }, { names: ['Browser', 'Calendar', 'Camera', 'Chat', 'Code Editor', 'Files', 'Mail', 'Music', 'Notes', 'Photos', 'Settings', 'Terminal', 'Videos'], icons: allIcons() });
    await page.getByRole('button', { name: locale === 'es' ? 'Apps y carpetas' : 'Apps & folders', exact: true }).click();
    await page.locator('.app-library-card').first().waitFor();
    await page.waitForTimeout(400);
    await page.locator('.app-library-tools').evaluate((target) => { const main = target.closest('.s-content'); main.scrollTop += target.getBoundingClientRect().top - main.getBoundingClientRect().top - 24; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(out, `apps-${locale}.png`) });
    fail(errors); await page.close();
  }
  console.log('Captured real Booki UI with example data in English and Spanish.');
} finally { await browser.close(); srv.close(); }
