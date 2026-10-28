import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLibraryPayload } from '../../publishing/post-work.js';

async function publishSave(){
    const path=new URL('../../../applications/studio/page-ui/publish-save.js',import.meta.url);
    let source=await readFile(path,'utf8');
    source=source.replace(/(["'])(@alysum\/publishing\/|\/core\/writing-engine\/)([^"']+)\1/g,(_match,_quote,prefix,tail)=>JSON.stringify(new URL((prefix.startsWith('@')?'../../publishing/':'../../writing-engine/')+tail,import.meta.url).href));
    return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('an empty chapter selection after promotion cannot unlist the live book',async()=>{
    const {runPublishSave}=await publishSave();const postError={};let writes=0;
    await runPublishSave({isPublished:true,listed:true,session:{mode:'cloud',user:{id:'owner'}},supabase:{from(){writes++;throw Error('Must not write');}},api:{updateBook(){writes++;throw Error('Must not write');}},book:{id:'main',is_published:true,publish_meta:{revisionNeedsPublishReview:true}},chapters:[],readForm:()=>({title:'Book',genres:['fantasy'],rating:'Teen',warningMeta:{version:1,reviewed:true,noneApply:true,coreIds:[],entries:[],note:''},chapterIds:[]}),postError});
    assert.match(postError.textContent,/Choose chapters from your new main draft/);assert.equal(writes,0);
});
test('saving publishing settings preserves the chapter-review guard until publication',async()=>{
    const {runPublishSave}=await publishSave();const before=globalThis.window;let saved;
    globalThis.window={location:{replace(){}}};
    try{await runPublishSave({isPublished:false,session:{mode:'local'},api:{async updateBook(id,patch){saved=patch;return patch;}},book:{id:'main',is_published:true,publish_meta:{revisionNeedsPublishReview:true}},readForm:()=>({title:'Book',chapterIds:[]}),postError:{}});
    assert.equal(saved.publish_meta.revisionNeedsPublishReview,true);}finally{globalThis.window=before;}
});
test('publishing a promoted manuscript keeps the existing listing ID',()=>{
    const book={id:'main',sections:{body:[{id:'chapter',title:'Arrival',content:'word '.repeat(3000)}]}};
    const payload=buildLibraryPayload(book,{isPublished:true,title:'Book',author:'Author',genres:['fantasy'],chapterIds:['chapter']});
    assert.equal(payload.id,'main');assert.equal(payload.bookId,'main');assert.equal(payload.chapters.length,1);
});

test('failed publication exposes the cloud reason and keeps the form open',async()=>{
    const {runPublishSave}=await publishSave();const before=globalThis.window;let redirects=0,listingWrites=0;
    globalThis.window={location:{replace(){redirects++;}}};
    const supabase={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:'main'}};},update(){listingWrites++;return this;},then(resolve){resolve({error:null});}};}};
    try{await assert.rejects(runPublishSave({isPublished:true,listed:true,session:{mode:'cloud',user:{id:'owner'}},supabase,
        api:{async readOnlineBook(){return {id:'main',user_id:'owner',sections:{body:[]},_cloudUpdated:1};},async updateBook(){return {_synced:false,_pending:true,_syncCode:'BOOK_CONFLICT',_syncError:'The online copy is different from this screen.'};}},
        book:{id:'main',user_id:'owner',sections:{body:[]}},chapters:[{id:'chapter',title:'Chapter',content:'word '.repeat(3000)}],
        readForm:()=>({title:'Book',genres:['fantasy'],rating:'Teen',chapterIds:['chapter'],warningMeta:{version:1,reviewed:true,noneApply:true,coreIds:[],entries:[],note:''}}),
        postError:{},async loadDraftCoverFile(){return null;}}),error=>error.code==='BOOK_CONFLICT'&&/listing was updated.*online book is different.*Open this book in the Editor/.test(error.message));
        assert.equal(listingWrites,1);assert.equal(redirects,0);
    }finally{globalThis.window=before;}
});

test('failed draft settings do not claim the public listing changed',async()=>{
    const {runPublishSave}=await publishSave();
    await assert.rejects(runPublishSave({isPublished:false,session:{mode:'cloud'},book:{id:'main'},
        readForm:()=>({title:'Book',chapterIds:[]}),postError:{},api:{async updateBook(){return {_synced:false,_syncError:'permission denied for table books'};}}}),
    error=>/settings save was not confirmed.*permission denied/.test(error.message)&&!/listing/.test(error.message));
});
