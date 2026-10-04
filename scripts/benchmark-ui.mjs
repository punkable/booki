/* Reproducible browser/bridge benchmark; not a native Windows CPU benchmark. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { serveDist, launchBrowser, openPage, makeConfig } from '../tests/harness.mjs';
const { srv, port } = await serveDist();
const browser = await launchBrowser();
const runs = [];
try {
  for (let iteration = 0; iteration < 5; iteration++) {
    const { page, errors } = await openPage(browser, port, 'settings.html', { cfg: makeConfig({ theme: 'light' }), viewport: { width: 1280, height: 960 } });
    await page.evaluate(() => {
      const inner = window.__TAURI__.core.invoke;
      window.__benchIcons = 0;
      window.__TAURI__.core.invoke = (cmd, args) => {
        if (cmd === 'list_installed_apps') return Promise.resolve([{ name: 'Benchmark', items: Array.from({ length: 300 }, (_, i) => ({ name: `App ${String(i).padStart(3, '0')}`, path: `C:/Benchmark/${i}.exe` })) }]);
        if (cmd === 'app_icon') window.__benchIcons++;
        return inner(cmd, args);
      };
    });
    const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime);
    const start = performance.now();
    await page.getByRole('button', { name: 'Apps & folders', exact: true }).click();
    await page.locator('.app-library-card').first().waitFor();
    const libraryMs = performance.now() - start;
    const searchStart = performance.now();
    await page.locator('.app-library-tools input').fill('App 299');
    await page.locator('.app-library-card').filter({ hasText: 'App 299' }).waitFor();
    const searchMs = performance.now() - searchStart;
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Apps & folders', exact: true }).click();
    await page.locator('.app-library-card').first().waitFor();
    await page.waitForTimeout(250);
    const icons = await page.evaluate(() => window.__benchIcons);
    runs.push({ fcpMs: Math.round(fcp), libraryMs: Math.round(libraryMs), searchMs: Math.round(searchMs), iconRequestsAfterRevisit: icons });
    if (errors.length) throw new Error(errors.join('\n'));
    await page.close();
  }
  const median = (key) => runs.map((r) => r[key]).sort((a, b) => a - b)[2];
  const result = { environment: 'Linux Chromium; built UI; mocked native bridge; 300 apps; five runs. Timings include Playwright interaction overhead. Native CPU, RSS, compositor and installer behavior are not measured.', runs, median: Object.fromEntries(Object.keys(runs[0]).map((key) => [key, median(key)])) };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); srv.close(); }
