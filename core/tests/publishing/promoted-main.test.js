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
    await runPublishSave({isPublished:true,listed:true,session:{mode:'cloud',user:{id:'owner'}},supabase:{from(){writes++;throw Error('Must not write');}},api:{updateBook(){writes++;throw Error('Must not write');}},book:{id:'main',is_published:true,publish_meta:{revisionNeedsPublishReview:true}},chapters:[],readForm:()=>({title:'Book',genres:['fantasy'],rating:'Teen',chapterIds:[]}),postError});
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
