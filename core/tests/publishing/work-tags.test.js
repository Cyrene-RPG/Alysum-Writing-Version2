import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkTags, normalizeWorkTags, publicWorkTags, freeFanfictionForm } from '../../publishing/work-tags.js';
import { readPublishDraft } from '../../publishing/publish-meta.js';
import { buildLibraryPayload } from '../../publishing/post-work.js';
import { normalizePublishedWork } from '../../library/work.js';
import { FANDOM_NAMES } from '../../publishing/fandoms.js';
import { FICTION_SUGGESTIONS } from '../../publishing/fiction-suggestions.js';

test('legacy books retain their genres and tags while explicit work type wins', () => {
    assert.equal(readWorkTags({genres:['fanfic']}).workType,'fanfiction');
    assert.equal(readWorkTags({workType:'original',genres:['fanfic']}).workType,'original');
    const draft=readPublishDraft({publish_meta:{genre:'fantasy',tags:['Found family'],workType:'fanfiction',fandoms:['Merlin'],characters:['Arthur'],relationships:['Arthur/Merlin']}});
    assert.deepEqual(draft.fandoms,['Merlin']); assert.deepEqual(draft.tags,['Found family']);
    assert.deepEqual(draft.genres,['fantasy']);assert.deepEqual(draft.relationships,['Arthur/Merlin']);
});

test('new metadata saves in drafts but inactive fan-fiction fields stay out of original listings', () => {
    const metadata={workType:'fanfiction',fandoms:['Harry Potter','Merlin'],characters:['Hermione Granger'],relationships:['Arthur/Merlin']};
    const form={...metadata,isPublished:true,title:'Test',genres:['fantasy'],chapterIds:[],tags:['Found family']};
    const payload=buildLibraryPayload({id:'book',sections:{body:[]}},form);
    assert.deepEqual(payload.fandoms,metadata.fandoms); assert.equal(payload.workType,'fanfiction');
    const reader=normalizePublishedWork({id:'book',data:payload});
    assert.deepEqual(reader.fandoms,metadata.fandoms);assert.deepEqual(reader.relationships,metadata.relationships);
    const original=publicWorkTags({...metadata,workType:'original'});
    assert.deepEqual(original,{workType:'original',fandoms:[],characters:[],relationships:[]});
    assert.deepEqual(readPublishDraft({publish_meta:{...metadata,workType:'original'}}).fandoms,metadata.fandoms);
});

test('reviewed fandom names have searchable character and relationship starters', () => {
    assert.equal(FANDOM_NAMES.length,504);
    assert.ok(FICTION_SUGGESTIONS['Harry Potter'].characters.includes('Hermione Granger'));
    for(const name of FANDOM_NAMES) {
        assert.ok(FICTION_SUGGESTIONS[name]?.characters.length,name);
        assert.ok(FICTION_SUGGESTIONS[name]?.relationships.length,name);
    }
});

test('case-insensitive duplicates, blanks and unbounded metadata cannot inflate selections', () => {
    assert.deepEqual(normalizeWorkTags([' Merlin ','merlin','','Harry Potter']),['Merlin','Harry Potter']);
    assert.equal(normalizeWorkTags(Array.from({length:150},(_,i)=>'tag'+i)).length,100);
    assert.equal(normalizeWorkTags(['x'.repeat(400)])[0].length,250);
});

test('fan-fiction drafts and public listings cannot retain payment links or locked chapters',()=>{
    const paid={workType:'fanfiction',chapterIds:['one'],lockedChapterIds:['one'],purchaseUrl:'https://shop.example/buy',
        chapterAccess:{productUrl:'https://ko-fi.com/s/product',chapterProducts:[{chapterId:'one',productUrl:'https://ko-fi.com/s/product',minimum:'1.00'}]}};
    const free=freeFanfictionForm(paid);
    assert.equal(free.purchaseUrl,'');assert.deepEqual(free.lockedChapterIds,[]);assert.deepEqual(free.chapterAccess.chapterProducts,[]);
    const payload=buildLibraryPayload({id:'book',sections:{body:[{id:'one',content:'word '.repeat(600)}]}},paid);
    assert.equal(payload.purchaseUrl,'');assert.ok(!payload.chapters[0].locked);assert.ok(payload.chapters[0].content.length>0);
    const original={...paid,workType:'original'};assert.equal(freeFanfictionForm(original),original,'original pricing remains intact');
    assert.equal(freeFanfictionForm({...paid,workType:undefined,genres:['fanfic']}).purchaseUrl,'','legacy fanfic classification is also free');
    const inherited=buildLibraryPayload({id:'saved-fanfic',publish_meta:{workType:'fanfiction',fandoms:['Merlin']},sections:{body:[]}}, {purchaseUrl:paid.purchaseUrl});
    assert.equal(inherited.workType,'fanfiction');assert.equal(inherited.purchaseUrl,'');assert.deepEqual(inherited.fandoms,['Merlin']);
    const oldListing=normalizePublishedWork({id:'old',data:{workType:'fanfiction',purchaseUrl:paid.purchaseUrl}});
    assert.equal(oldListing.purchaseUrl,'','existing fanfic listings do not show Buy from author');
});
