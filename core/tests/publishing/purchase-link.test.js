import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePurchaseUrl, readPublishDraft } from '../../publishing/publish-meta.js';
import { buildLibraryPayload } from '../../publishing/post-work.js';
import { normalizePublishedWork } from '../../library/work.js';

async function publishing() {
    let source = await readFile(new URL('../../../applications/studio/page-ui/publish-save.js', import.meta.url), 'utf8');
    source = source.replace(/(["'])(@alysum\/publishing\/|\/core\/writing-engine\/)([^"']+)\1/g, (_match, _quote, prefix, tail) => JSON.stringify(new URL((prefix.startsWith('@') ? '../../publishing/' : '../../writing-engine/') + tail, import.meta.url).href));
    return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

test('saving a restored fan-fiction draft removes legacy purchase links and paid chapter settings',async()=>{
    const {runPublishSave}=await publishing();let patch;
    const before=globalThis.window;globalThis.window={location:{replace(){}}};
    try{
        await runPublishSave({isPublished:false,session:{mode:'local'},book:{id:'fanfic'},postError:{},
            readForm:()=>({title:'Fanfic',workType:'fanfiction',fandoms:['Merlin'],genres:['fantasy'],chapterIds:['one'],
                purchaseUrl:'https://shop.example/paid',lockedChapterIds:['one'],chapterAccess:{productUrl:'https://ko-fi.com/s/old',minimum:'3.00',chapterProducts:[{chapterId:'one',minimum:'3.00'}]}}),
            api:{async updateBook(_id,value){patch=value;return value;}}});
        assert.equal(patch.publish_meta.purchaseUrl,'');assert.deepEqual(patch.publish_meta.lockedChapterIds,[]);assert.equal(patch.publish_meta.chapterAccess,null);
        assert.deepEqual(patch.publish_meta.fandoms,['Merlin']);assert.deepEqual(patch.published_chapter_ids,['one']);
    }finally{globalThis.window=before;}
});

test('only complete HTTPS purchase URLs without embedded credentials are accepted', () => {
    for (const unsafe of ['javascript:alert(1)', 'data:text/html,hello', '//shop.example/book', 'http://shop.example/book', 'https://user:password@shop.example/book', 'not a link', 'https://shop.example/' + 'x'.repeat(2000)]) assert.equal(normalizePurchaseUrl(unsafe), '');
    assert.equal(normalizePurchaseUrl(' https://ko-fi.com/s/abc?ref=book '), 'https://ko-fi.com/s/abc?ref=book');
});

test('purchase URL survives draft save, public listing and reader normalization without publishing private chapters', async () => {
    const { publishMetaFromForm } = await publishing();
    const form = { purchaseUrl: 'https://shop.example/book', chapterIds: ['sample'], isPublished: true };
    const metadata = publishMetaFromForm(form);
    assert.equal(readPublishDraft({ publish_meta: metadata }).purchaseUrl, form.purchaseUrl);
    const book = { id: 'book', sections: { body: [
        { id: 'sample', content: 'sample '.repeat(3000) },
        { id: 'private', content: 'private '.repeat(3000) },
    ] } };
    const payload = buildLibraryPayload(book, form);
    const work = normalizePublishedWork({ id: book.id, data: payload });
    assert.equal(work.purchaseUrl, form.purchaseUrl);
    assert.deepEqual(work.chapters.map(ch => ch.id), ['sample']);
    assert.equal(JSON.stringify(payload).includes('private'), false);
    assert.equal(publishMetaFromForm({ ...form, purchaseUrl: '' }).purchaseUrl, '');
    assert.equal(buildLibraryPayload(book, { ...form, purchaseUrl: '' }).purchaseUrl, '');
});

test('invalid purchase link cannot write a draft or public listing', async () => {
    const { runPublishSave } = await publishing();
    const postError = {};
    await runPublishSave({ isPublished: true, readForm: () => ({ title: 'Book', purchaseUrl: 'javascript:alert(1)' }), postError,
        api: { updateBook() { assert.fail('Must not save'); } }, supabase: { from() { assert.fail('Must not publish'); } } });
    assert.match(postError.textContent, /https/);
});

test('old and malicious public listing links do not become reader URLs', () => {
    assert.equal(normalizePublishedWork({ id: 'book', data: { title: 'Book' } }).purchaseUrl, '');
    assert.equal(normalizePublishedWork({ id: 'book', data: { purchaseUrl: 'javascript:alert(1)' } }).purchaseUrl, '');
});
