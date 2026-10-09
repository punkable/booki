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
