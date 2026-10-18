import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRevisionPayload, referenceSnapshot, groupRevisionBooks, revisionChapterList, saveBeforeRevisionNavigation, draftSwitchChoices, draftSwitchUrl } from '../../writing-engine/draft-revisions.js';
import { createBooksApi } from '../../synchronization-engine/books.js';
import { LOCAL_STUDIO_STORAGE_KEY } from '../../synchronization-engine/local-adapter.js';
import { createBookVersion, getBookVersion } from '../../writing-engine/version-api.js';
import { createAutosave } from '../../../applications/editor/page-ui/autosave.js';

function storage() { const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),clear:()=>map.clear()}; }
function original() { return {id:'original',title:'A book',sections:{front:[],body:[{id:'folder',kind:'folder',title:'Part one',children:[{id:'chapter',title:'The arrival',content:'<p>The original words.</p>',notes:[{id:'note',kind:'note',content:'Private note'}],imageUrls:['private-image']}]}],back:[]},publish_meta:{cover:'private-cover'},published_chapter_ids:['chapter'],is_published:true}; }
let sequence=0;const makeId=()=>`new-${++sequence}`;

test('blank same-book revision preserves structure with fresh IDs and no copied content, notes or publishing data',()=>{
    const book=original(),before=structuredClone(book),snapshot=referenceSnapshot(book);
    const payload=blankRevisionPayload({sourceBook:book,reference:snapshot,label:'Draft 2'},makeId);
    assert.equal(payload.draft_parent_id,'original');assert.equal(payload.draft_label,'Draft 2');
    assert.equal(payload.sections.body[0].title,'Part one');
    const chapters=revisionChapterList(payload.sections);assert.equal(chapters.length,1);assert.equal(chapters[0].title,'The arrival');
    assert.notEqual(chapters[0].id,'chapter');assert.equal(chapters[0].content,'');assert.deepEqual(chapters[0].notes,[]);
    assert.equal(JSON.stringify(payload).includes('private-'),false);assert.deepEqual(payload.publish_meta,{});assert.equal(payload.is_published,false);
    assert.deepEqual(book,before);
});
test('separate-book revision and one-blank-document mode do not inherit grouping or original chapters',()=>{
    const book={...original(),draft_parent_id:'root'};
    const payload=blankRevisionPayload({sourceBook:book,reference:referenceSnapshot(book),destination:'separate',label:'Revision',title:'Another book',copyChapters:false},makeId);
    assert.equal(payload.title,'Another book');assert.equal('draft_parent_id' in payload,false);assert.equal(payload.sections.body.length,1);assert.equal(payload.sections.body[0].content,'');
    const grouped=blankRevisionPayload({sourceBook:book,reference:referenceSnapshot(book),label:'Draft 3'},makeId);assert.equal(grouped.draft_parent_id,'root');
});
test('reference snapshots are detached and cannot load a saved version from another book',()=>{
    const book=original(),snapshot=referenceSnapshot(book);book.sections.body[0].children[0].content='changed';
    assert.equal(snapshot.sections.body[0].children[0].content,'<p>The original words.</p>');
    assert.throws(()=>referenceSnapshot(book,{id:'v',book_id:'different',sections:{}}),/different book/);
});
test('grouping preserves ordinary books and orphaned revisions',()=>{
    const book=original(),draft={...original(),id:'draft',draft_parent_id:book.id,draft_label:'Draft 2'},other={...original(),id:'other'};
    const groups=groupRevisionBooks([draft,other,book]);assert.equal(groups.length,2);assert.equal(groups[0].book.id,book.id);assert.equal(groups[0].drafts.length,2);
    assert.equal(groupRevisionBooks([draft,other]).length,2);
});
test('real local book API edits and versions only the new draft, survives reload, and preserves children on root deletion',async()=>{
    globalThis.localStorage=storage();
    const api=createBooksApi({mode:'local'}),book=await api.insertBook(original());const saved=structuredClone(book);
    const payload=blankRevisionPayload({sourceBook:book,reference:referenceSnapshot(book),label:'Draft 2'},makeId);
    const draft=await api.insertBook(payload,{strict:true});assert.notEqual(draft.id,book.id);
    const sections=structuredClone(draft.sections);sections.body[0].children[0].content='<p>Revised words.</p>';
    await api.updateBook(draft.id,{sections});
    assert.deepEqual(await api.getBook(book.id),saved);
    const reopened=createBooksApi({mode:'local'});assert.equal((await reopened.getBook(draft.id)).sections.body[0].children[0].content,'<p>Revised words.</p>');
    const version=await createBookVersion({isLocalStudio:true,userId:'guest',bookId:book.id,book,label:'Before revision'});
    const fetched=await getBookVersion({isLocalStudio:true,bookId:book.id,versionId:version.id});assert.equal(referenceSnapshot(book,fetched).sections.body[0].children[0].content,'<p>The original words.</p>');
    await api.deleteBook(book.id);assert.equal((await api.getBook(draft.id)).draft_parent_id,null);
    assert.ok(JSON.parse(localStorage.getItem(LOCAL_STUDIO_STORAGE_KEY)).books.length);
});
test('strict cloud creation fails without creating a pending fallback when grouping schema is absent; ordinary inserts retain fallback',async()=>{
    globalThis.localStorage=storage();globalThis.window={setTimeout};
    const supabase={from:()=>({insert:()=>({select:()=>({single:async()=>({error:new Error('draft_parent_id missing from schema cache')})})})})};
    const api=createBooksApi({mode:'cloud',user:{id:'owner'}},supabase);
    const payload=blankRevisionPayload({sourceBook:original(),reference:referenceSnapshot(original()),label:'Draft 2'},makeId);
    await assert.rejects(api.insertBook(payload,{strict:true}),/schema cache/);assert.deepEqual(api.peekBooks(),[]);
    const fallback=await api.insertBook({title:'Offline original'});assert.equal(fallback._synced,false);assert.equal(api.peekBooks().length,1);
});
test('cloud insert round-trips grouping fields while ordinary inserts do not require the new columns',async()=>{
    globalThis.localStorage=storage();let inserted;
    const supabase={from:()=>({insert:row=>{inserted=row;return {select:()=>({single:async()=>({data:row})})};}})};
    const api=createBooksApi({mode:'cloud',user:{id:'owner'}},supabase);
    const payload=blankRevisionPayload({sourceBook:original(),reference:referenceSnapshot(original()),label:'Draft 2'},makeId);
    const draft=await api.insertBook(payload,{strict:true});assert.equal(inserted.user_id,'owner');assert.equal(inserted.draft_parent_id,'original');assert.equal(draft.draft_label,'Draft 2');
    await api.insertBook({title:'Ordinary book'},{strict:true});assert.equal('draft_parent_id' in inserted,false);assert.equal('draft_label' in inserted,false);
});
test('switching waits for the real autosave queue and a failed save prevents navigation',async()=>{
    globalThis.window={setTimeout};let release,navigated=false;const writes=[];
    const autosave=createAutosave({delay:60000,save:async payload=>{writes.push(payload.id);await new Promise(resolve=>{release=resolve;});}});
    autosave.schedule({id:'writing-draft'});
    const navigation=saveBeforeRevisionNavigation(()=>autosave.flush(),()=>{navigated=true;},'/editor?book=another');
    await Promise.resolve();assert.equal(navigated,false);release();await navigation;assert.deepEqual(writes,['writing-draft']);assert.equal(navigated,true);
    navigated=false;await assert.rejects(saveBeforeRevisionNavigation(async()=>'error',()=>{navigated=true;},'/editor?book=another'),/could not be saved/);assert.equal(navigated,false);
});

test('direct draft switch lists the original first, siblings only, and the current unsynced revision',()=>{
    const root=original(),current={...original(),id:'revision-2',draft_parent_id:'original',draft_label:'Second pass',created:20};
    const sibling={...original(),id:'revision-1',draft_parent_id:'original',draft_label:'First pass',created:10};
    const other={...original(),id:'unrelated',title:'Another book'};
    const choices=draftSwitchChoices([sibling,other,root],current);
    assert.deepEqual(choices.map(choice=>choice.id),['original','revision-1','revision-2']);
    assert.equal(choices[0].label,'Main / original draft');assert.equal(choices[2].label,'Second pass');assert.equal(choices[2].current,true);
    assert.deepEqual(draftSwitchChoices([root,sibling],root).map(choice=>choice.current),[true,false]);
});
test('direct draft switch returns to single editor without losing other URL options',()=>{
    const url=new URL(draftSwitchUrl('https://alysumwriting.com/editor?book=revision&referenceBook=original&referenceVersion=snapshot&theme=dark','original'));
    assert.equal(url.searchParams.get('book'),'original');assert.equal(url.searchParams.has('referenceBook'),false);assert.equal(url.searchParams.has('referenceVersion'),false);assert.equal(url.searchParams.get('theme'),'dark');
});
