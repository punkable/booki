import test from 'node:test';
import assert from 'node:assert/strict';
import { appKey, pinnedKeys, installedCandidates, candidateSections, pathKey } from '../src/dock/app-candidates.js';
import { createAsyncCache } from '../src/dock/async-cache.js';
import { toggleTimer } from '../src/dock/productivity.js';
import { createUpdateController } from '../src/update-controller.js';

test('shortcut identities deduplicate aliases but retain distinct arguments and accented paths', () => {
  const identities = { 'C:/Start/Editor.lnk': 'editor', 'C:/Apps/editor.exe': 'editor' };
  const keys = pinnedKeys([{ kind: 'group', children: [{ path: 'C:/Start/Editor.lnk' }] }], identities);
  assert.ok(keys.has(appKey({ path: 'C:/Apps/editor.exe' }, identities)));
  assert.ok(!keys.has(appKey({ path: 'C:/Apps/editor.exe', args: ['--safe-mode'] }, identities)));
  assert.notEqual(pathKey('C:/Música/app.exe'), pathKey('C:/Musica/app.exe'));
  const catalog = installedCandidates([{ items: [{ name: 'Editor', path: 'C:/Start/Editor.lnk' }, { name: 'Editor', path: 'C:/Apps/editor.exe' }, { name: 'Editor', path: 'C:/Other/editor.exe' }] }], keys, identities);
  assert.equal(catalog.length, 2);
});
test('one app appears once across sections with the installed friendly name', () => {
  const sections = candidateSections({ used: [{ name: 'Package!App', path: 'shell:AppsFolder\\Package!App' }], running: [{ exe: 'shell:AppsFolder\\Package!App' }], groups: [{ items: [{ name: 'Friendly app', path: 'shell:AppsFolder\\Package!App' }] }] }, new Set());
  assert.equal(sections.frequent[0].name, 'Friendly app');
  assert.equal(sections.running.length + sections.installed.length, 0);
});
test('a completed timer restarts with one click', () => {
  const now = 100000;
  assert.equal(toggleTimer({ minutes: 5, endsAt: now - 1000 }, now).endsAt, now + 300000);
  assert.equal(toggleTimer({ minutes: 5, endsAt: now + 30000 }, now).remaining, 30);
});
test('icon cache coalesces calls, caps extraction concurrency and bounds retained entries', async () => {
  let active = 0, peak = 0, calls = 0;
  const cache = createAsyncCache(async (key) => { calls++; active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return key; }, { maximum: 3, concurrency: 2 });
  assert.equal(cache.get('same'), cache.get('same'));
  await cache.get('same');
  await Promise.all(['a', 'b', 'c', 'd', 'e'].map(cache.get));
  assert.equal(peak, 2);
  assert.equal(calls, 6);
  await cache.get('same'); assert.equal(calls, 7);
  cache.clear(); await cache.get('same'); assert.equal(calls, 8);
});
test('failed icon extraction can retry and null results have a short expiry', async () => {
  let attempts = 0;
  const cache = createAsyncCache(async () => { attempts++; if (attempts === 1) throw new Error('shell unavailable'); return null; }, { negativeTtl: 1 });
  await assert.rejects(cache.get('app'));
  assert.equal(await cache.get('app'), null);
  await new Promise((r) => setTimeout(r, 5));
  await cache.get('app'); assert.equal(attempts, 3);
});
function updateHarness(overrides = {}) {
  const events = [];
  const update = { available: true, version: '1.0.0', download: async (emit) => { events.push('download'); emit({ event: 'Started', data: { contentLength: 10 } }); emit({ event: 'Progress', data: { chunkLength: 10 } }); }, install: async () => { events.push('install'); } };
  const controller = createUpdateController({ check: async () => update, acquire: async () => { events.push('lock'); return true; }, release: async () => { events.push('unlock'); }, backup: async () => { events.push('backup'); }, ...overrides });
  return { controller, update, events };
}
test('background download survives subscriptions, verifies readiness and installs once after saving and backup', async () => {
  const { controller, events } = updateHarness();
  await controller.check();
  const unsubscribe = controller.subscribe(() => {});
  assert.equal(controller.download(), controller.download());
  unsubscribe(); await controller.download();
  assert.equal(controller.snapshot().phase, 'ready');
  await controller.check(); assert.deepEqual(events, ['lock', 'download']);
  const apply = controller.apply(async () => { events.push('save'); });
  assert.equal(controller.apply(), apply); await apply;
  assert.deepEqual(events, ['lock', 'download', 'save', 'backup', 'install']);
});
test('failed download releases the native lock and can retry', async () => {
  const { controller, update, events } = updateHarness();
  await controller.check(); const download = update.download;
  update.download = async () => { throw new Error('offline'); };
  await assert.rejects(controller.download(), /offline/);
  assert.equal(controller.snapshot().phase, 'available');
  assert.deepEqual(events, ['lock', 'unlock']);
  update.download = download; await controller.download();
  assert.equal(controller.snapshot().phase, 'ready');
});
test('failed save or backup blocks installation and leaves the verified download ready to retry', async () => {
  let fail = true;
  const { controller, events } = updateHarness({ backup: async () => { if (fail) throw new Error('disk full'); events.push('backup'); } });
  await controller.check(); await controller.download();
  await assert.rejects(controller.apply(async () => { throw new Error('unsaved settings'); }));
  assert.ok(!events.includes('install'));
  await assert.rejects(controller.apply(), /disk full/);
  assert.equal(controller.snapshot().phase, 'ready'); assert.ok(!events.includes('install'));
  fail = false; await controller.apply(); assert.ok(events.includes('install'));
});
test('another window holding the update lock blocks downloading', async () => {
  const { controller, events } = updateHarness({ acquire: async () => false });
  await controller.check(); await assert.rejects(controller.download(), /another window/);
  assert.deepEqual(events, []);
});
test('a stale icon request failing after refresh does not erase the replacement cache entry', async () => {
  let rejectOld, resolveNew, calls = 0;
  const cache = createAsyncCache(() => { calls++; return calls === 1 ? new Promise((_resolve, reject) => { rejectOld = reject; }) : new Promise((resolve) => { resolveNew = resolve; }); });
  const stale = cache.get('app'); await Promise.resolve();
  cache.clear(); const fresh = cache.get('app'); await Promise.resolve();
  rejectOld(new Error('old request failed')); await assert.rejects(stale);
  assert.equal(cache.get('app'), fresh);
  resolveNew('new icon'); assert.equal(await fresh, 'new icon'); assert.equal(calls, 2);
});
test('removed packaged apps are excluded when discovery succeeds but recommendations survive a source failure', () => {
  const used = [{ name: 'Removed', path: 'shell:AppsFolder\\Removed!App' }];
  const groups = [{ items: [{ name: 'Installed', path: 'shell:AppsFolder\\Installed!App' }] }];
  assert.equal(candidateSections({ used, groups }, new Set()).frequent.length, 0);
  assert.equal(candidateSections({ used, groups: [] }, new Set()).frequent.length, 1);
});
