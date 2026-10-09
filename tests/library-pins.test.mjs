import test from 'node:test';
import assert from 'node:assert/strict';
import { placePin, removePin, updatePin, movePinBy, ungroupPin, readPinDrop, PIN_DRAG_TYPE, takeOutOfGroup, normalizeGroups } from '../src/pins.js';
const app = (id) => ({ id, name: id, path: `C:/${id}.exe`, kind: 'app', args: [] });
const group = { id: 'g', name: 'Work', kind: 'group', children: [app('a'), app('b')] };
test('moving a child to a dock position preserves its data and its named group', () => {
  const source = [group, app('c')];
  const next = placePin(source, group.children[0], { beforeId: 'c' });
  assert.deepEqual(next.map((item) => item.id), ['g', 'a', 'c']);
  assert.deepEqual(next[1], group.children[0]);
  assert.equal(source[0].children.length, 2);
});
test('group drop moves an existing pin once and nested groups are rejected', () => {
  const source = [group, app('c')];
  const next = placePin(source, source[1], { groupId: 'g' });
  assert.equal(next.length, 1);
  assert.deepEqual(next[0].children.map((item) => item.id), ['a', 'b', 'c']);
  assert.equal(placePin(source, group, { groupId: 'g' }), source);
  assert.equal(placePin(source, source[1], { groupId: 'missing' }), source);
});
test('editing and removing group children preserve unrelated pins', () => {
  const changed = updatePin([group, app('c')], 'a', { name: 'Renamed' });
  assert.equal(changed[0].children[0].name, 'Renamed');
  assert.equal(group.children[0].name, 'a');
  assert.deepEqual(removePin(changed, 'b').map((item) => item.id), ['g', 'c']);
  assert.deepEqual(removePin(changed, 'b')[0].children.map(item => item.id), ['a']);
});
test('pin drops reject malformed actions and oversized or unrelated data', () => {
  const read = (value) => readPinDrop({ getData: (type) => type === PIN_DRAG_TYPE ? value : '' });
  assert.equal(read('{broken'), null);
  assert.equal(read('x'.repeat(16385)), null);
  assert.equal(read(JSON.stringify({ id: 's', name: 'Settings', kind: 'action', action: 'run' })), null);
  assert.equal(read(JSON.stringify(app('a'))).id, 'a');
});

test('folder sessions preserve the root pin and keep independent back histories', async () => {
  const { createFolderNavigation } = await import('../src/dock/folder-navigation.js');
  const root = { path: 'C:/Files', name: 'Files' };
  const first = createFolderNavigation(root); const second = createFolderNavigation(root);
  first.enter({ path: 'C:/Files/Projects', name: 'Projects' });
  first.enter({ path: 'C:/Files/Projects/One', name: 'One' });
  assert.equal(first.back().name, 'Projects'); assert.equal(first.canGoBack, true);
  assert.deepEqual(first.back(), root); assert.equal(first.canGoBack, false);
  assert.deepEqual(second.current, root); assert.deepEqual(root, { path:'C:/Files', name:'Files' });
});

test('keyboard reordering preserves groups, members and immutable boundary edits', () => {
  const source = [group, app('c')];
  assert.equal(movePinBy(source, 'g', -1), source);
  assert.deepEqual(movePinBy(source, 'g', 1).map(item => item.id), ['c', 'g']);
  assert.deepEqual(movePinBy(source, 'b', -1)[0].children.map(item => item.id), ['b', 'a']);
  assert.deepEqual(group.children.map(item => item.id), ['a', 'b']);
  assert.deepEqual(ungroupPin(source, 'g').map(item => item.id), ['a', 'b', 'c']);
});

test('folder breadcrumbs jump to ancestors, truncate history and never mutate the root pin', async () => {
  const { createFolderNavigation } = await import('../src/dock/folder-navigation.js');
  const root = { path: 'C:/Files', name: 'Files' };
  const nav = createFolderNavigation(root);
  nav.enter({ path: 'C:/Files/One', name: 'One' }); nav.enter({ path: 'C:/Files/One/Two', name: 'Two' });
  const trail = nav.trail; trail[0].name = 'Changed';
  assert.equal(nav.trail[0].name, 'Files');
  assert.equal(nav.goTo(1).name, 'One'); assert.equal(nav.trail.length, 2);
  assert.equal(nav.goTo(-1).name, 'One');
  assert.deepEqual(nav.goTo(0), root); assert.equal(nav.canGoBack, false);
  assert.deepEqual(root, { path: 'C:/Files', name: 'Files' });
});

test('empty and single-item groups remain destinations through edits, reload normalization and removal', () => {
  const empty = { ...group, icon: 'custom', children: [] };
  const added = placePin([empty], app('a'), { groupId: 'g' });
  assert.equal(added[0].id, 'g'); assert.equal(added[0].name, 'Work');
  assert.equal(added[0].icon, 'custom'); assert.deepEqual(added[0].children, [app('a')]);
  assert.deepEqual(normalizeGroups(added), added);
  const moved = takeOutOfGroup(added, 'g', 'a');
  assert.equal(moved.reopenId, 'g'); assert.deepEqual(moved.pinned, [empty, app('a')]);
  assert.deepEqual(removePin(added, 'a'), [empty]);
  assert.deepEqual(ungroupPin(added, 'g'), [app('a')]);
});
