import {test} from 'node:test';
import assert from 'node:assert/strict';
import {block,normalize,scenes,textOf} from '../../screenplays/model.js';
import {moveScene,updateScene,addScene} from '../../screenplays/outline.js';
import {compareDrafts,diffWords} from '../../screenplays/compare.js';
const sample=()=>normalize({blocks:[block('action','A prologue.'),block('scene','INT. ROOM - DAY'),block('action','The door opens.'),block('scene','EXT. HARBOR - NIGHT'),block('action','A boat departs.')]});

test('Scene numbers exclude the prologue and metadata stays attached through moves',()=>{
    const original=sample(),list=scenes(original);assert.deepEqual(list.map(s=>s.number),[0,1,2]);
    const planned=updateScene(original,list[1].id,{synopsis:'A visitor arrives.',act:'Act I',color:'amber',status:'drafting'});
    const moved=moveScene(planned,list[2].id,list[1].id);
    assert.equal(textOf(moved.blocks[0]),'A prologue.');assert.equal(scenes(moved)[2].outline.synopsis,'A visitor arrives.');
    assert.deepEqual(scenes(moved).map(s=>s.blocks.map(textOf)),[['A prologue.'],['EXT. HARBOR - NIGHT','A boat departs.'],['INT. ROOM - DAY','The door opens.']]);
    assert.equal(original.blocks[1].outline,undefined,'Planning does not mutate the old draft');
});
test('A scene can be placed after another scene without dropping its body',()=>{
    const doc=sample(),list=scenes(doc),moved=moveScene(doc,list[1].id,list[2].id,{after:true});assert.equal(moved.blocks.length,doc.blocks.length);assert.equal(textOf(moved.blocks.at(-1)),'The door opens.');assert.equal(moveScene(doc,list[0].id,list[2].id),doc);assert.equal(moveScene(doc,list[2].id,'missing'),doc);
});
test('Planning metadata survives full JSON backups and normalization',()=>{
    let doc=sample();const id=doc.blocks[1].id;doc=updateScene(doc,id,{heading:'INT. OFFICE - DUSK',synopsis:'<script> stays plain text',act:'Sequence 2',color:'invalid',status:'invalid'});
    const restored=normalize(JSON.parse(JSON.stringify(doc)));assert.equal(restored.blocks[1].outline.synopsis,'<script> stays plain text');assert.equal(restored.blocks[1].outline.color,'neutral');assert.equal(restored.blocks[1].outline.status,'planned');assert.equal(textOf(restored.blocks[2]),'The door opens.');
});
test('Adding a scene creates a heading and an action element with unique IDs',()=>{const doc=sample(),added=addScene(doc);assert.equal(added.document.blocks.length,doc.blocks.length+2);assert.equal(added.document.blocks.at(-2).id,added.id);assert.equal(added.document.blocks.at(-1).type,'action');assert.equal(new Set(added.document.blocks.map(b=>b.id)).size,added.document.blocks.length);});
test('Inserting text does not mark the following elements moved',()=>{const before=sample(),after={...before,blocks:[before.blocks[0],block('action','Added'),...before.blocks.slice(1)]},result=compareDrafts(before,after);assert.equal(result.counts.added,1);assert.equal(result.counts.moved,0);assert.equal(result.counts.changed,0);});
test('Reordered scenes are moved rather than reported as text rewrites',()=>{const before=sample(),list=scenes(before),after=moveScene(before,list[2].id,list[1].id),result=compareDrafts(before,after);assert.equal(result.counts.changed,0);assert.equal(result.counts.added,0);assert.equal(result.counts.removed,0);assert.ok(result.counts.moved>0);});
test('Text, formatting, title and outline changes are all visible',()=>{
    const before=sample(),after=structuredClone(before);after.title='Second draft';after.blocks[2].runs=[{text:'The door closes.',bold:true}];after.blocks[1].outline={synopsis:'New summary',act:'Act II'};
    const result=compareDrafts(before,after);assert.equal(result.counts.changed,1);assert.equal(result.counts.outline,1);assert.deepEqual(result.metadata.map(m=>m.field),['title']);
    const formatOnly=structuredClone(before);formatOnly.blocks[2].runs[0].italic=true;assert.equal(compareDrafts(before,formatOnly).counts.changed,1);
});
test('A rewrite and summary edit on the same element are counted together',()=>{const before=sample(),after=updateScene(before,before.blocks[1].id,{heading:'INT. OFFICE - DAY',synopsis:'Different place'}),result=compareDrafts(before,after);assert.equal(result.counts.changed,1);assert.equal(result.counts.outline,1);});
test('Imports with regenerated IDs match uniquely identical elements',()=>{const before=sample(),after={...before,blocks:before.blocks.map(b=>({...b,id:crypto.randomUUID()}))};assert.deepEqual(compareDrafts(before,after).counts,{added:0,removed:0,changed:0,outline:0,moved:0});});
test('Repeated content is not incorrectly matched to an unrelated imported element',()=>{const before=normalize({blocks:[block('dialogue','Yes.'),block('dialogue','Yes.')]}),after=normalize({blocks:[block('dialogue','Yes.')]});const result=compareDrafts(before,after);assert.equal(result.counts.added,1);assert.equal(result.counts.removed,2);});
test('Word differences preserve both drafts including unicode and spacing',()=>{const before='Hello, café.\nA quiet room.',after='Hello, Mara.\nA bright room. 漢字';const diff=diffWords(before,after);assert.equal(diff.filter(t=>t.kind!=='added').map(t=>t.text).join(''),before);assert.equal(diff.filter(t=>t.kind!=='removed').map(t=>t.text).join(''),after);});
test('Large replacements use the bounded comparison path without losing text',()=>{const before='old '.repeat(2000),after='new '.repeat(2000),diff=diffWords(before,after);assert.equal(diff.filter(t=>t.kind!=='added').map(t=>t.text).join(''),before);assert.equal(diff.filter(t=>t.kind!=='removed').map(t=>t.text).join(''),after);});
