import test from 'node:test';
import assert from 'node:assert/strict';
import {epubChapters,selectEpubChapters} from '../epub-chapters.js';
test('chapter purchases only contain selected EPUB chapter',()=>{
 const chapters=epubChapters([{id:'a',title:'One',html:'<p>First</p>'},{id:'b',title:'Two',html:'<p>Second</p>'}]);
 assert.deepEqual(selectEpubChapters(chapters,'bundle',['b']).map(x=>x.text),['Second']);
 assert.equal(selectEpubChapters(chapters,'book').length,2);
});
test('reject duplicate chapter IDs',()=>assert.throws(()=>epubChapters([{id:'a',html:'Hi'},{id:'a',html:'Again'}])));
test('reject missing selected chapters',()=>assert.throws(()=>selectEpubChapters(epubChapters([{id:'a',html:'Hi'}]),'bundle',['b'])));
