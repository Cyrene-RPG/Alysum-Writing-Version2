import test from 'node:test';
import assert from 'node:assert/strict';
import {createForceSync} from '../page-ui/force-sync.js';
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(){
    const state={dirty:false,online:true,reviewing:false,revision:0,text:'This tab',conflict:false,
        saves:0,reads:0,reviews:0,applied:[],messages:[],busy:[]};
    const options={api:{async refreshBook(){state.reads++;return {id:'book',title:'Online',_cloudUpdated:2};}},bookId:'book',
        isOnline:()=>state.online,isReviewing:()=>state.reviewing,hasLocalChanges:()=>state.dirty,
        async saveLocal(){state.saves++;state.dirty=false;return 'saved';},getRevision:()=>state.revision,
        snapshotKey:()=>state.text,applyOnline:book=>state.applied.push(book),isConflict:()=>state.conflict,
        onConflict:async()=>{state.reviews++;},setStatus:message=>state.messages.push(message),setBusy:busy=>state.busy.push(busy)};
    return {state,options,controller:()=>createForceSync(options)};
}
test('an unchanged stale tab pulls without uploading its older manuscript',async()=>{
    const f=fixture();assert.equal((await f.controller().run()).status,'synced');
    assert.equal(f.state.saves,0);assert.equal(f.state.reads,1);assert.equal(f.state.applied[0].title,'Online');
    assert.deepEqual(f.state.busy,[true,false]);
});
test('pending changes are saved before downloading and failed saves never download',async()=>{
    const f=fixture();f.state.dirty=true;const order=[];
    f.options.saveLocal=async()=>{order.push('save');f.state.dirty=false;return 'saved';};
    f.options.api.refreshBook=async()=>{order.push('read');return {id:'book'};};
    assert.equal((await f.controller().run()).status,'synced');assert.deepEqual(order,['save','read']);
    const failed=fixture();failed.state.dirty=true;failed.options.saveLocal=async()=> 'error';
    assert.equal((await failed.controller().run()).status,'unsaved');assert.equal(failed.state.reads,0);assert.deepEqual(failed.state.applied,[]);
});
test('conflicting device edits open review without overwriting either version',async()=>{
    const f=fixture();f.state.dirty=true;f.state.conflict=true;f.options.saveLocal=async()=> 'error';
    assert.equal((await f.controller().run()).status,'conflict');assert.equal(f.state.reviews,1);
    assert.equal(f.state.reads,0);assert.deepEqual(f.state.applied,[]);
});
test('typing during the download prevents applying the response',async()=>{
    for(const edit of [state=>state.revision++,state=>{state.text='New typing';},state=>{state.dirty=true;}]){
        const f=fixture(),g=gate();f.options.api.refreshBook=()=>g.promise;
        const run=f.controller().run();edit(f.state);g.resolve({id:'book'});
        assert.equal((await run).status,'changed');assert.deepEqual(f.state.applied,[]);
    }
});
test('repeat clicks share one operation; failed online reads never claim sync success',async()=>{
    const f=fixture(),g=gate();f.options.api.refreshBook=()=>{f.state.reads++;return g.promise;};const sync=f.controller();
    const first=sync.run(),second=sync.run();assert.equal(first,second);assert.equal(f.state.reads,1);
    g.resolve({id:'book'});await first;
    f.options.api.refreshBook=async()=>{throw Error('Permission denied');};
    assert.equal((await sync.run()).status,'error');assert.match(f.state.messages.at(-1),/Permission denied/);
    assert.deepEqual(f.state.busy,[true,false,true,false]);
});
test('offline and version-review states cannot read or save',async()=>{
    for(const state of ['offline','reviewing']){
        const f=fixture();if(state==='offline')f.state.online=false;else f.state.reviewing=true;
        assert.equal((await f.controller().run()).status,state);assert.equal(f.state.reads,0);assert.equal(f.state.saves,0);
    }
});
