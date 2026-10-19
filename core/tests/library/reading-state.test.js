import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadingState,readingScope,trackReadingAccount,openReadingState,READING_KINDS} from '../../library/reading-state.js';
function memoryStorage(){const map=new Map();return{map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};}
const account=id=>({mode:'cloud',user:{id}});
function authFixture(id){let current=id;const callbacks=[];return{
    async getSession(){return{data:{session:current?{user:{id:current}}:null}};},
    onAuthStateChange(callback){callbacks.push(callback);return{data:{subscription:{unsubscribe(){callbacks.splice(callbacks.indexOf(callback),1);}}}};},
    change(id,event='SIGNED_IN'){current=id;for(const callback of [...callbacks])callback(event,id?{user:{id}}:null);}
};}
test('main-account history survives logout and return without appearing on a test account',()=>{
    const storage=memoryStorage();const auth=authFixture('main');let changed=0;
    const main=createReadingState({scope:readingScope(account('main')),storage});
    for(const kind of READING_KINDS)main.write(kind,{book:{owner:'main'}});
    trackReadingAccount(auth,main,()=>changed++);auth.change(null,'SIGNED_OUT');
    assert.equal(changed,1);assert.equal(main.active,false);assert.deepEqual(main.read('read-position'),{});assert.equal(main.write('shelves',{leak:true}),false);
    const testAccount=createReadingState({scope:readingScope(account('test')),storage});
    for(const kind of READING_KINDS)assert.deepEqual(testAccount.read(kind),{});
    testAccount.write('shelves',{different:'want'});
    const returning=createReadingState({scope:readingScope(account('main')),storage});
    for(const kind of READING_KINDS)assert.deepEqual(returning.read(kind),{book:{owner:'main'}});
});
test('anonymous visits neither read account data nor persist reading history for the next visitor',()=>{
    const storage=memoryStorage();const main=createReadingState({scope:readingScope(account('main')),storage});main.write('read-position',{book:{progress:50}});
    const guest=createReadingState({storage});assert.equal(guest.persistent,false);assert.deepEqual(guest.read('read-position'),{});
    const count=storage.map.size;guest.write('read-position',{guestBook:{progress:20}});assert.equal(storage.map.size,count);assert.equal(guest.read('read-position').guestBook.progress,20);
    assert.deepEqual(createReadingState({storage}).read('read-position'),{});
});
test('old browser-wide history is preserved but never automatically assigned to any account',()=>{
    const storage=memoryStorage();for(const kind of READING_KINDS)storage.setItem(`alysum:library:${kind}`,JSON.stringify({privateBook:true}));
    const before=[...storage.map];
    for(const scope of [null,'local',readingScope(account('main')),readingScope(account('test'))]){
        const state=createReadingState({scope,storage});for(const kind of READING_KINDS)assert.deepEqual(state.read(kind),{});
    }
    assert.deepEqual([...storage.map],before);
});
test('expired readers cannot write late progress or bookmarks after account change',()=>{
    const storage=memoryStorage();const auth=authFixture('main');const state=createReadingState({scope:readingScope(account('main')),storage});let reloaded=0;
    trackReadingAccount(auth,state,()=>reloaded++);state.update('read-position','book',{progress:10});
    auth.change('test');assert.equal(reloaded,1);assert.equal(state.update('read-position','book',{progress:90}),false);assert.equal(state.update('bookmarks','book',true),false);
    auth.change('other');assert.equal(reloaded,1);
    const saved=createReadingState({scope:readingScope(account('main')),storage});assert.equal(saved.read('read-position').book.progress,10);assert.deepEqual(saved.read('bookmarks'),{});
});
test('token refresh does not interrupt reading for the same account',()=>{
    const state=createReadingState({scope:readingScope(account('main')),storage:memoryStorage()});const auth=authFixture('main');let changed=0;
    const stop=trackReadingAccount(auth,state,()=>changed++);auth.change('main','TOKEN_REFRESHED');assert.equal(changed,0);assert.equal(state.active,true);
    stop();auth.change('test');assert.equal(state.active,true);
});
test('the actual current Supabase session owns reading state, not an old session hint',async()=>{
    const auth=authFixture('test');const {state,session}=await openReadingState({auth},{storage:memoryStorage()});assert.equal(session.user.id,'test');assert.equal(state.scope,readingScope(account('test')));
    const signedOut=await openReadingState({auth:authFixture(null)},{storage:memoryStorage()});assert.equal(signedOut.state.scope,null);assert.equal(signedOut.session.mode,'none');
});
test('local desktop reading stays separate from cloud accounts',async()=>{
    const storage=memoryStorage();const auth=authFixture('main');const {state}=await openReadingState({auth},{local:true,storage});state.write('bookmarks',{localBook:true});auth.change('test');assert.equal(state.active,true);
    assert.deepEqual(createReadingState({scope:readingScope(account('main')),storage}).read('bookmarks'),{});
});
test('updates merge other books rather than overwriting progress from another reader tab',()=>{
    const storage=memoryStorage(),scope=readingScope(account('main'));const first=createReadingState({scope,storage}),second=createReadingState({scope,storage});
    first.update('read-position','one',{progress:10});second.update('read-position','two',{progress:20});first.update('read-position','one',{progress:30});
    assert.deepEqual(second.read('read-position'),{one:{progress:30},two:{progress:20}});
});
test('corrupt or unavailable storage never reads a different account as fallback',()=>{
    const storage=memoryStorage();const state=createReadingState({scope:readingScope(account('main')),storage});storage.setItem(state.key('shelves'),'not-json');assert.deepEqual(state.read('shelves'),{});
    const blocked=createReadingState({scope:'user:main',storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});blocked.write('shelves',{book:'want'});assert.deepEqual(blocked.read('shelves'),{book:'want'});
});
