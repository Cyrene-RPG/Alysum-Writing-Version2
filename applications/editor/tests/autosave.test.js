import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutosave} from '../page-ui/autosave.js';
globalThis.window={setTimeout};
test('a failed edit is retained and flush retries it instead of reporting a completed save',async()=>{
 let fails=true,calls=0;const seen=[];
 const autosave=createAutosave({delay:60000,save:async book=>{calls++;seen.push(book.text);if(fails)throw Error('not saved online');}});
 autosave.schedule({text:'Do not lose this writing'});assert.equal(await autosave.flush(),'error');assert.equal(autosave.getStatus(),'error');assert.equal(calls,1);
 fails=false;assert.equal(await autosave.flush(),'saved');assert.deepEqual(seen,['Do not lose this writing','Do not lose this writing']);
});
test('newer edits replace a failed pending payload',async()=>{
 let fails=true;const seen=[];const autosave=createAutosave({delay:60000,save:async book=>{seen.push(book.text);if(fails)throw Error('offline');}});
 autosave.schedule({text:'old'});await autosave.flush();autosave.schedule({text:'latest'});fails=false;assert.equal(await autosave.flush(),'saved');assert.deepEqual(seen,['old','latest']);
});
test('flush waits for in-flight saves and then saves newer typing',async()=>{
 let release;const gate=new Promise(r=>release=r),seen=[];const autosave=createAutosave({delay:60000,save:async book=>{seen.push(book.text);if(book.text==='first')await gate;}});
 autosave.schedule({text:'first'});const finished=autosave.flush();autosave.schedule({text:'second'});release();assert.equal(await finished,'saved');assert.deepEqual(seen,['first','second']);await autosave.flush();
});
