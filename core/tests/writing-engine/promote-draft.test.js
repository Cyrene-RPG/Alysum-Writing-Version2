import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDraftPromotion } from '../../writing-engine/promote-draft.js';
import { promoteDraft } from '../../synchronization-engine/cloud-adapter.js';
import { createBooksApi } from '../../synchronization-engine/books.js';
import { LOCAL_STUDIO_STORAGE_KEY } from '../../synchronization-engine/local-adapter.js';

function mainBook(){return {id:'main',user_id:'owner',title:'Book',updated:100,created:1,media_format:'novel',sections:{front:[],body:[{id:'original-chapter',kind:'chapter',title:'Arrival',content:'<p>Previous main words.</p>',notes:[]}],back:[]},words:3,publish_meta:{cover_url:'original-cover',draftChapterIds:['original-chapter']},published_chapter_ids:['original-chapter'],is_published:true};}
function revision(){return {...mainBook(),id:'revision',draft_parent_id:'main',draft_label:'Draft 2',sections:{front:[],body:[{id:'revision-chapter',kind:'chapter',title:'Arrival',content:'<p>The revised opening has new words.</p>',notes:[]}],back:[]},publish_meta:{},published_chapter_ids:[],is_published:false};}
function storage(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value))};}
function cloudFixture({failBackup=false,conflict=false,onPromote=()=>{}}={}){
    const rows=new Map([['main',mainBook()],['revision',revision()]]),calls=[];
    const supabase={from(table){assert.equal(table,'books','Promotion must never write public listings');
        function builder(operation,payload){const filters={};const query={select(){return query;},eq(key,value){filters[key]=value;return query;},async maybeSingle(){
            calls.push(operation);
            const row=rows.get(filters.id);
            if(operation==='read')return {data:structuredClone(row)||null};
            if(conflict){row.updated++;row.sections.body[0].content='<p>Another device edited main.</p>';}
            if(!row||row.updated!==filters.updated||row.user_id!==filters.user_id)return {data:null};
            const updated={...row,...structuredClone(payload)};rows.set(row.id,updated);onPromote();return {data:structuredClone(updated)};
        },async single(){calls.push(operation);if(failBackup)return {error:new Error('Backup failed')};rows.set(payload.id,structuredClone(payload));return {data:structuredClone(payload)};}};return query;}
        return {select:()=>builder('read'),insert:payload=>builder('backup',payload),update:payload=>builder('promote',payload)};
    }};
    return {rows,calls,supabase};
}
test('promotion preserves the main ID, cover, publication state, matching chapter IDs and both older texts',()=>{
    const main=mainBook(),source=revision(),before=structuredClone({main,source});
    const plan=prepareDraftPromotion(source,main,{now:1000,makeId:()=> 'backup'});
    assert.equal(plan.backup.draft_parent_id,'main');assert.equal(plan.backup.is_published,false);
    assert.deepEqual(plan.backup.sections,main.sections);assert.equal(plan.patch.sections.body[0].content,source.sections.body[0].content);
    assert.equal(plan.patch.sections.body[0].id,'original-chapter');assert.deepEqual(plan.patch.published_chapter_ids,['original-chapter']);
    assert.equal(plan.patch.publish_meta.cover_url,'original-cover');assert.equal(plan.patch.publish_meta.revisionNeedsPublishReview,true);
    assert.equal('id' in plan.patch,false);assert.equal('is_published' in plan.patch,false);assert.deepEqual({main,source},before);
});
test('duplicate chapter names never guess a published chapter match',()=>{
    const source=revision();source.sections.body.push({...source.sections.body[0],id:'another'});
    const plan=prepareDraftPromotion(source,mainBook(),{makeId:()=> 'backup'});
    assert.deepEqual(plan.patch.sections.body.map(ch=>ch.id),['revision-chapter','another']);assert.deepEqual(plan.patch.published_chapter_ids,[]);
});
test('empty, unrelated and mismatched-format promotions are rejected before a backup',()=>{
    const empty=revision();empty.sections.body[0].content='';
    assert.throws(()=>prepareDraftPromotion(empty,mainBook()),/Add writing/);
    assert.throws(()=>prepareDraftPromotion({...revision(),draft_parent_id:'other'},mainBook()),/belonging/);
    assert.throws(()=>prepareDraftPromotion({...revision(),media_format:'comic'},mainBook()),/same book format/);
});
test('cloud saves the previous main before replacing main and leaves the source revision intact',async()=>{
    const f=cloudFixture(),source=structuredClone(f.rows.get('revision'));
    const result=await promoteDraft(f.supabase,'owner','revision');
    assert.deepEqual(f.calls,['read','read','backup','promote']);assert.equal(result.main.id,'main');
    assert.equal(f.rows.get('main').sections.body[0].content,source.sections.body[0].content);
    assert.equal(result.backup.sections.body[0].content,'<p>Previous main words.</p>');assert.deepEqual(f.rows.get('revision'),source);
});
test('a failed backup prevents replacement of the main draft',async()=>{
    const f=cloudFixture({failBackup:true}),before=structuredClone(f.rows.get('main'));
    await assert.rejects(promoteDraft(f.supabase,'owner','revision'),/Backup failed/);
    assert.deepEqual(f.rows.get('main'),before);assert.equal(f.calls.includes('promote'),false);
});
test('concurrent main edits fail the conditional update and retain the saved backup',async()=>{
    const f=cloudFixture({conflict:true});await assert.rejects(promoteDraft(f.supabase,'owner','revision'),/main draft changed/);
    assert.equal(f.rows.get('main').sections.body[0].content,'<p>Another device edited main.</p>');assert.equal(f.rows.size,3);
});
test('an editor who is not the owner cannot promote or create a backup',async()=>{
    const f=cloudFixture();await assert.rejects(promoteDraft(f.supabase,'someone-else','revision'),/Only the book owner/);assert.equal(f.rows.size,2);
});
test('local promotion survives reload, keeps the source and public listing, and uses one storage commit',async()=>{
    globalThis.localStorage=storage();const api=createBooksApi({mode:'local'});
    await api.insertBook(mainBook());await api.insertBook(revision());const source=await api.getBook('revision');
    localStorage.setItem('alysum:library:local-listings','live listing snapshot');
    let commits=0;const setItem=localStorage.setItem;localStorage.setItem=(key,value)=>{if(key===LOCAL_STUDIO_STORAGE_KEY)commits++;setItem(key,value);};
    const result=await api.promoteDraft('revision');assert.equal(commits,1);
    const reopened=createBooksApi({mode:'local'});assert.equal((await reopened.getBook('main')).sections.body[0].content,source.sections.body[0].content);
    assert.deepEqual(await reopened.getBook('revision'),source);assert.equal((await reopened.getBook(result.backup.id)).sections.body[0].content,'<p>Previous main words.</p>');
    assert.equal(localStorage.getItem('alysum:library:local-listings'),'live listing snapshot');
});
test('local storage failure leaves both manuscripts unchanged',async()=>{
    globalThis.localStorage=storage();const api=createBooksApi({mode:'local'});await api.insertBook(mainBook());await api.insertBook(revision());
    const before=localStorage.getItem(LOCAL_STUDIO_STORAGE_KEY);localStorage.setItem=()=>{throw Error('Storage full');};
    await assert.rejects(api.promoteDraft('revision'),/Storage full/);assert.equal(localStorage.getItem(LOCAL_STUDIO_STORAGE_KEY),before);
});

test('new local main edits arriving during promotion are never replaced by the response cache',async()=>{
    globalThis.localStorage=storage();const cacheKey='alysum:editor:draft-cache-owner';
    localStorage.setItem(cacheKey,JSON.stringify([mainBook(),revision()]));
    const f=cloudFixture({onPromote(){const pending=mainBook();pending._pending=true;pending.sections.body[0].content='<p>New unsynced main edits.</p>';localStorage.setItem(cacheKey,JSON.stringify([pending,revision()]));}});
    const api=createBooksApi({mode:'cloud',user:{id:'owner'}},f.supabase);
    await assert.rejects(api.promoteDraft('revision'),/newer local edits/);
    assert.equal(api.peekBook('main').sections.body[0].content,'<p>New unsynced main edits.</p>');assert.equal(api.peekDrafts('main').length,3);
});
test('pending main edits block promotion before any server writes',async()=>{
    globalThis.localStorage=storage();const main=mainBook();main._pending=true;
    localStorage.setItem('alysum:editor:draft-cache-owner',JSON.stringify([main,revision()]));
    const f=cloudFixture(),api=createBooksApi({mode:'cloud',user:{id:'owner'}},f.supabase);
    await assert.rejects(api.promoteDraft('revision'),/Save pending edits/);assert.equal(f.calls.length,0);
});
