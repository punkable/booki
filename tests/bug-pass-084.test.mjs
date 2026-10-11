import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPins, pinsKey } from '../src/pins.js';
import { withRuleDefaults, DEFAULT_RULES } from '../src/profile-rules.js';

test('pins built in Settings compare equal to the copy Rust saves', () => {
  const fresh = [{ id: 'a', kind: 'app', name: 'Editor', path: 'C:/Editor.exe', args: [] }];
  const saved = [{ id: 'a', name: 'Editor', path: 'C:/Editor.exe', args: [], kind: 'app', widget: null, style: null, icon: null, children: [], recents: [] }];
  assert.deepEqual(canonicalPins(fresh), saved);
  assert.equal(pinsKey(fresh), pinsKey(saved));
  // Key order inside a style object does not matter either.
  assert.equal(pinsKey([{ id: 'w', kind: 'widget', style: { b: 1, a: 2 } }]), pinsKey([{ id: 'w', kind: 'widget', style: { a: 2, b: 1 } }]));
  assert.notEqual(pinsKey(fresh), pinsKey([{ ...fresh[0], name: 'Other' }]));
});

test('an action pin keeps its action and nothing else gains one', () => {
  const [settings, app] = canonicalPins([{ id: 's', kind: 'action', action: 'settings' }, { id: 'a' }]);
  assert.equal(settings.action, 'settings');
  assert.equal('action' in app, false);
  assert.equal(app.kind, 'app');
});

test('automatic profile rules saved empty by Rust get the 09:00-18:00 weekday schedule', () => {
  const rules = withRuleDefaults({ enabled: true, scheduleFrom: '', scheduleTo: '', scheduleDays: [], scheduleProfile: '' });
  assert.equal(rules.scheduleFrom, DEFAULT_RULES.scheduleFrom);
  assert.equal(rules.scheduleTo, DEFAULT_RULES.scheduleTo);
  assert.deepEqual(rules.scheduleDays, [1, 2, 3, 4, 5]);
  // Days the user cleared for a chosen schedule stay cleared.
  assert.deepEqual(withRuleDefaults({ scheduleProfile: 'Work', scheduleDays: [] }).scheduleDays, []);
});

test('arrow keys skip a widget hidden while unavailable', async () => {
  const { rovingTiles } = await import('../src/dock/keyboard-nav.js');
  const tile = (...classes) => ({ hidden: false, classList: { contains: (name) => ['tile', ...classes].includes(name) } });
  const shown = tile();
  const root = { children: [shown, tile('conditionally-hidden'), tile('separator')] };
  assert.deepEqual(rovingTiles(root), [shown]);
});
