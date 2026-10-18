import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,resolveChapter,createRevision,setWritingText,selectDraft,restoreState,wordCount} from './model.mjs';
let counter=0;const makeId=()=>`test-${++counter}`;
test('editing and selecting chapters never mutates the reference draft',()=>{
    const state=createDemo(), original=structuredClone(state.books[0].drafts[0]);
    setWritingText(state,'New words');state.writing.chapterId='house';setWritingText(state,'Another chapter');
    assert.equal(resolveChapter(state,state.writing).chapter.text,'Another chapter');
    assert.equal(state.reference.chapterId,'arrival');assert.deepEqual(state.books[0].drafts[0],original);
    assert.throws(()=>selectDraft(state,'writing','harbor','first'),/different drafts/);
});
test('same-book blank revision gets independent empty chapters and keeps the original intact',()=>{
    const state=createDemo(),original=structuredClone(state.books[0].drafts[0]);
    const draft=createRevision(state,{reference:state.reference,name:'Draft 3',copyChapters:true},makeId);
    assert.equal(state.books.length,2);assert.equal(state.books[0].drafts.length,3);
    assert.deepEqual(draft.chapters.map(item=>item.title),original.chapters.map(item=>item.title));
    assert.ok(draft.chapters.every(item=>item.text===''));assert.notEqual(draft.chapters[0].id,original.chapters[0].id);
    setWritingText(state,'New opening');assert.deepEqual(state.books[0].drafts[0],original);
});
test('separate-book blank document creates exactly one empty chapter',()=>{
    const state=createDemo(),original=structuredClone(state.books[0]);
    const draft=createRevision(state,{reference:state.reference,destination:'separate',name:'New revision',bookTitle:'New book',copyChapters:false},makeId);
    assert.equal(state.books.length,3);assert.equal(state.books[2].title,'New book');assert.equal(draft.chapters.length,1);assert.equal(draft.chapters[0].text,'');
    assert.equal(state.writing.bookId,state.books[2].id);assert.deepEqual(state.books[0],original);
});
test('invalid revision setup makes no partial book or draft',()=>{
    const state=createDemo(),original=structuredClone(state);
    assert.throws(()=>createRevision(state,{reference:state.reference,name:' '}));
    assert.throws(()=>createRevision(state,{reference:state.reference,name:'Draft',destination:'separate',bookTitle:''}));
    assert.deepEqual(state,original);
});
test('local saved state restores writing and reference independently; corrupt data falls back',()=>{
    const state=createDemo();setWritingText(state,'A saved revision');state.reference.chapterId='house';state.mobilePane='reference';
    const restored=restoreState(JSON.stringify(state));assert.deepEqual(restored,state);assert.equal(resolveChapter(restored,restored.writing).chapter.text,'A saved revision');
    assert.deepEqual(restoreState('{broken'),createDemo());assert.equal(wordCount('  One\n two  three '),3);
});
