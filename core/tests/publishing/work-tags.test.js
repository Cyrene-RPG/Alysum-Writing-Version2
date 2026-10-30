import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkTags, normalizeWorkTags, publicWorkTags } from '../../publishing/work-tags.js';
import { readPublishDraft } from '../../publishing/publish-meta.js';
import { buildLibraryPayload } from '../../publishing/post-work.js';

test('legacy books retain their genres and tags while explicit work type wins', () => {
    assert.equal(readWorkTags({genres:['fanfic']}).workType,'fanfiction');
    assert.equal(readWorkTags({workType:'original',genres:['fanfic']}).workType,'original');
    const draft=readPublishDraft({publish_meta:{genre:'fantasy',tags:['Found family'],workType:'fanfiction',fandoms:['Merlin'],characters:['Arthur'],relationships:['Arthur/Merlin']}});
    assert.deepEqual(draft.fandoms,['Merlin']); assert.deepEqual(draft.tags,['Found family']);
    assert.deepEqual(draft.genres,['fantasy']);assert.deepEqual(draft.relationships,['Arthur/Merlin']);
});

test('new metadata saves in drafts but inactive fan-fiction fields stay out of original listings', () => {
    const metadata={workType:'fanfiction',fandoms:['Harry Potter','Merlin'],characters:['Hermione Granger'],relationships:['Arthur/Merlin']};
    const form={...metadata,title:'Test',genres:['fantasy'],chapterIds:[],tags:['Found family']};
    const payload=buildLibraryPayload({id:'book',sections:{body:[]}},form);
    assert.deepEqual(payload.fandoms,metadata.fandoms); assert.equal(payload.workType,'fanfiction');
    const original=publicWorkTags({...metadata,workType:'original'});
    assert.deepEqual(original,{workType:'original',fandoms:[],characters:[],relationships:[]});
    assert.deepEqual(readPublishDraft({publish_meta:{...metadata,workType:'original'}}).fandoms,metadata.fandoms);
});

test('case-insensitive duplicates, blanks and unbounded metadata cannot inflate selections', () => {
    assert.deepEqual(normalizeWorkTags([' Merlin ','merlin','','Harry Potter']),['Merlin','Harry Potter']);
    assert.equal(normalizeWorkTags(Array.from({length:150},(_,i)=>'tag'+i)).length,100);
    assert.equal(normalizeWorkTags(['x'.repeat(400)])[0].length,250);
});
