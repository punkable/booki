import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestTask } from '../src/latest-task.js';
import { changedSnapshotFields } from '../src/settings/snapshot-model.js';
test('a delayed native response cannot activate an obsolete material and only the latest queued mutation runs', async () => {
  const calls=[],applied=[];let resolve;
  const worker=createLatestTask(async value=>{calls.push(value);if(value==='old')return new Promise(r=>resolve=r);return value;}, value=>applied.push(value));
  worker.request('old');await Promise.resolve();worker.request('intermediate');worker.request('solid');resolve('old');await worker.settled();
  assert.deepEqual(calls,['old','solid']);assert.deepEqual(applied,['solid']);
});
test('reviewed snapshot differences exclude metadata and include user preferences',()=>{
  assert.deepEqual(changedSnapshotFields({theme:'light',pinned:[],revision:1},{theme:'dark',pinned:[],revision:9,seenVersion:'0.71'}),['theme']);
});

test('snapshot review groups related changes and preserves comparable boolean values', async () => {
  const {snapshotChangeGroups,snapshotScalar} = await import('../src/settings/snapshot-model.js');
  const current={theme:'light',monitor:0,monitorName:'First',autostart:false,revision:1};
  const snapshot={theme:'dark',monitor:1,monitorName:'Second',autostart:true,revision:2};
  const groups=snapshotChangeGroups(current,snapshot,key=>key);
  assert.deepEqual(groups.find(group=>group.label==='be.monitor').fields,['monitor','monitorName']);
  assert.equal(groups.length,3);
  assert.equal(snapshotScalar(true,key=>key),'integral.enabled');
  assert.equal(snapshotScalar(false,key=>key),'integral.disabled');
  assert.equal(snapshotScalar({pinned:[]},key=>key),null);
});
