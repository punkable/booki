import test from 'node:test';
import assert from 'node:assert/strict';
import { observeSystem, recoveryInterval } from '../src/dock/system-observer.js';
import { parseConfigConflict } from '../src/settings/config-conflicts.js';

test('native notifications refresh immediately and asynchronous listeners are released after disposal', async () => {
  const callbacks = new Map(); let queries = 0, stops = 0; let resolveLate;
  const dock = {
    systemEventsSupport: async () => ({ media: true }),
    onSystemChange: (kind, callback) => {
      callbacks.set(kind, callback);
      return kind === 'ready' ? new Promise((resolve) => { resolveLate = resolve; }) : Promise.resolve(() => stops++);
    },
  };
  let support;
  const stop = observeSystem(dock, { media: () => queries++ }, (value) => { support = value; });
  await Promise.resolve(); callbacks.get('media')();
  assert.equal(queries, 1);
  assert.equal(recoveryInterval(support, 'media', 3000), 30000);
  assert.equal(recoveryInterval({}, 'volume', 4000), 4000);
  stop(); resolveLate(() => stops++); await Promise.resolve();
  callbacks.get('media')(); assert.equal(queries, 1); assert.equal(stops, 2);
});

test('window event bursts coalesce and cannot query after surface disposal', async () => {
  let callback, queries = 0;
  const dock = { systemEventsSupport: async () => ({}), onSystemChange: async (kind, fn) => { if (kind === 'windows') callback = fn; return () => {}; } };
  const stop = observeSystem(dock, { windows: () => queries++ }, () => {});
  for (let i = 0; i < 30; i++) callback();
  await new Promise((resolve) => setTimeout(resolve, 1050));
  assert.equal(queries, 1);
  callback(); stop(); await new Promise((resolve) => setTimeout(resolve, 1050));
  assert.equal(queries, 1);
});

test('conflict details accept only actionable fields and retain the current snapshot', () => {
  const value = { keys: ['edge'], current: { revision: 2, edge: 'top' } };
  assert.deepEqual(parseConfigConflict('BOOKI_CONFIG_CONFLICT:' + JSON.stringify(value)), value);
  assert.equal(parseConfigConflict('disk full'), null);
  assert.equal(parseConfigConflict('BOOKI_CONFIG_CONFLICT:broken'), null);
  assert.equal(parseConfigConflict('BOOKI_CONFIG_CONFLICT:{"keys":["revision"],"current":{"revision":2}}'), null);
});

test('autosave drains newer typing after a slow write and retains failed drafts for retry', async () => {
  const { createDraftSaver } = await import('../src/dock/draft-saver.js');
  const values = []; let release, fail = false;
  const saver = createDraftSaver(async (value) => {
    if (fail) return false;
    values.push(value);
    if (value === 'first') await new Promise((resolve) => { release = resolve; });
    return true;
  }, () => {}, 10000);
  saver.change('first'); const first = saver.flush();
  saver.change('newer'); release(); assert.equal(await first, true);
  assert.deepEqual(values, ['first', 'newer']);
  fail = true; saver.change('retry me'); assert.equal(await saver.flush(), false);
  fail = false; assert.equal(await saver.flush(), true);
  assert.equal(values.at(-1), 'retry me'); saver.cancelTimer();
});
