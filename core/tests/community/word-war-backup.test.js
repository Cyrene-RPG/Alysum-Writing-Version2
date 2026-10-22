import test from 'node:test';
import assert from 'node:assert/strict';
import {
    hashText, keepWriting, markSaved, mergeWrittenChapters, putBack, restoreUnsavedWriting, unsavedWriting,
} from '../../community/word-war-backup.js';
import { bookChoices } from '../../community/word-war-books.js';

function storage() { const map=new Map();return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),clear:()=>map.clear()}; }
const USER='writer-1';
const book=()=>({id:'book',title:'Low Tide',updated:1,sections:{front:[],body:[
    {id:'ch1',kind:'chapter',title:'Chapter 1',content:'<p>Before the race.</p>',notes:[]},
    {id:'part',kind:'folder',title:'Part two',children:[{id:'ch2',kind:'chapter',title:'Deep',content:'<p>Nested words.</p>',notes:[]}]},
],back:[]}});
const race=(html,o={})=>({raceId:'race-1',bookId:'book',bookTitle:'Low Tide',chapterId:'war',title:'Word War · 22 Oct',html,previousHtml:'',...o});
const chapterIn=(sections,id)=>[...sections.body,...sections.body.flatMap(item=>item.children||[])].find(ch=>ch.id===id);

test.beforeEach(()=>{ globalThis.localStorage=storage(); });

test('every edit is kept on the device until the book has that exact text', () => {
    keepWriting(USER,race('<p>One two three.</p>'));
    assert.equal(unsavedWriting(USER).length,1);
    const sections=book().sections;sections.body.push({id:'war',kind:'chapter',title:'Word War',content:'<p>One two three.</p>',notes:[]});
    markSaved(USER,{raceId:'race-1',bookId:'book',sections});
    assert.equal(unsavedWriting(USER).length,0);
    keepWriting(USER,race('<p>One two three four.</p>'));
    assert.equal(unsavedWriting(USER).length,1,'typing after the save is unsaved again');
});

test('a race chapter the book never got is added back with its own id', () => {
    const {sections,how}=putBack(book().sections,{...race('<p>Lost words.</p>'),savedHash:hashText(''),baseHash:hashText('')});
    assert.equal(how,'restored');
    assert.equal(chapterIn(sections,'war').content,'<p>Lost words.</p>');
    assert.equal(chapterIn(sections,'ch1').content,'<p>Before the race.</p>');
});

test('a chapter still holding what was last saved (or what it held before) is brought up to date', () => {
    const entry={...race('<p>Before the race. And more.</p>',{chapterId:'ch1'}),savedHash:hashText('<p>Before the race.</p>'),baseHash:hashText('<p>Before the race.</p>')};
    const {sections,how,words}=putBack(book().sections,entry);
    assert.equal(how,'replaced');
    assert.equal(words,2,'only the words the book was missing are counted');
    assert.equal(chapterIn(sections,'ch1').content,'<p>Before the race. And more.</p>');
    const nested=putBack(book().sections,{...race('<p>Nested words, longer now.</p>',{chapterId:'ch2'}),savedHash:hashText('<p>Nested words.</p>'),baseHash:hashText('<p>Nested words.</p>')});
    assert.equal(chapterIn(nested.sections,'ch2').content,'<p>Nested words, longer now.</p>','works inside folders');
});

test('a chapter someone changed since is never overwritten: the race words go in as a new chapter', () => {
    const entry={...race('<p>Race words.</p>',{chapterId:'ch1'}),savedHash:hashText('<p>Old.</p>'),baseHash:hashText('<p>Old.</p>')};
    const {sections,how}=putBack(book().sections,entry,()=>'new-id');
    assert.equal(how,'separate');
    assert.equal(chapterIn(sections,'ch1').content,'<p>Before the race.</p>');
    assert.equal(chapterIn(sections,'new-id').content,'<p>Race words.</p>');
    assert.match(chapterIn(sections,'new-id').title,/recovered/);
});

test('saved elsewhere mid-race: their copy is kept and only the race chapters are put back', () => {
    const theirs={front:[],body:[{id:'ch1',kind:'chapter',title:'Chapter 1',content:'<p>Edited in Studio.</p>',notes:[]},{id:'ch9',kind:'chapter',title:'New in Studio',content:'<p>Fresh.</p>',notes:[]}],back:[]};
    const mine=book().sections;mine.body.push({id:'war',kind:'chapter',title:'Word War',content:'<p>Race words.</p>',notes:[]});
    const merged=mergeWrittenChapters(theirs,mine,new Set(['war']));
    assert.equal(chapterIn(merged,'ch1').content,'<p>Edited in Studio.</p>');
    assert.equal(chapterIn(merged,'ch9').content,'<p>Fresh.</p>');
    assert.equal(chapterIn(merged,'war').content,'<p>Race words.</p>');
});

test('restoring saves the book and only then marks the copy as safe', async () => {
    keepWriting(USER,race('<p>Words from a closed tab.</p>'));
    let stored=book();let accept=false;
    const booksApi={getBook:async()=>structuredClone(stored),updateBook:async(id,patch)=>{if(!accept)return{_synced:false,_pending:true};stored={...stored,...patch};return{...stored,_synced:true};}};
    assert.deepEqual(await restoreUnsavedWriting({userId:USER,booksApi}),[]);
    assert.equal(unsavedWriting(USER).length,1,'still kept while the server refuses');
    accept=true;
    const restored=await restoreUnsavedWriting({userId:USER,booksApi});
    assert.deepEqual(restored,[{bookTitle:'Low Tide',words:5,isNewChapter:false}]);
    assert.equal(chapterIn(stored.sections,'war').content,'<p>Words from a closed tab.</p>');
    assert.equal(unsavedWriting(USER).length,0);
    assert.deepEqual(await restoreUnsavedWriting({userId:USER,booksApi}),[],'nothing twice');
});

test('a book read back from an unsynced device copy is saved even when it already has the words', async () => {
    keepWriting(USER,race('<p>Only on this device.</p>'));
    const local=book();local.sections.body.push({id:'war',kind:'chapter',title:'Word War',content:'<p>Only on this device.</p>',notes:[]});local._pending=true;
    let saves=0;
    const booksApi={getBook:async()=>structuredClone(local),updateBook:async()=>{saves+=1;return{_synced:true};}};
    await restoreUnsavedWriting({userId:USER,booksApi});
    assert.equal(saves,1);
    assert.equal(unsavedWriting(USER).length,0);
});

test('drafts and backups are labelled under their main book', () => {
    const books=[{id:'draft',title:'Low Tide',draft_parent_id:'main',draft_label:'Second pass'},{id:'main',title:'Low Tide'},{id:'other',title:'Saltwater'}];
    assert.deepEqual(bookChoices(books),[{id:'main',label:'Low Tide'},{id:'draft',label:'Low Tide · Second pass'},{id:'other',label:'Saltwater'}]);
});
