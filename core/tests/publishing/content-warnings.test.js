import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CORE_WARNINGS,WARNING_CATALOG,searchWarnings,warningDefinition} from '../../publishing/warning-catalog.js';
import {normalizeWarningState,warningLabels,validateWarningState,addWarning,addCustomWarning,removeWarning,warningSummary} from '../../publishing/content-warnings.js';
import {readPublishDraft} from '../../publishing/publish-meta.js';
import {buildLibraryPayload} from '../../publishing/post-work.js';
import {normalizePublishedWork} from '../../library/work.js';
const none=()=>({version:1,reviewed:true,noneApply:true,coreIds:[],entries:[],note:''});
test('The large catalog has stable unique IDs, categorized adult descriptors and no opt-out tag',()=>{
    assert.ok(WARNING_CATALOG.length>=1000);assert.equal(new Set(WARNING_CATALOG.map(item=>item.id)).size,WARNING_CATALOG.length);
    assert.equal(new Set(WARNING_CATALOG.map(item=>item.label.toLowerCase())).size,WARNING_CATALOG.length);
    assert.equal(CORE_WARNINGS.length,3);assert.ok(!WARNING_CATALOG.some(item=>/chose not|choose not/i.test(item.label)));
    assert.ok(WARNING_CATALOG.filter(item=>item.kind==='adult').length>150);
    assert.ok(!WARNING_CATALOG.some(item=>item.kind==='adult'&&/\b(child|children|minor|underage|infant)\b/i.test(item.label)));
});
test('Aliases find canonical warnings without merging distinct consent meanings',()=>{
    assert.equal(warningDefinition('dubcon').id,'ambiguous-consent');assert.equal(warningDefinition('CNC').id,'consensual-non-consent-roleplay');
    assert.notEqual(warningDefinition('dubcon').id,warningDefinition('Non-con').id);
    assert.equal(searchWarnings('birth control').items[0].id,'contraceptive-sabotage');
    assert.ok(searchWarnings('noncon').items.some(item=>item.kind==='core'));
    const groups=searchWarnings('',{category:'Sexual activities — adults',limit:100});assert.ok(groups.items.length>10&&groups.items.every(item=>item.kind==='adult'));
});
test('Core warnings require a decision and none-apply is mutually exclusive',()=>{
    assert.match(validateWarningState(null),/core/);assert.match(validateWarningState(normalizeWarningState(null)),/core/);
    assert.equal(validateWarningState(none()),'');
    const state=addWarning(none(),'graphic-violence');assert.equal(state.noneApply,false);assert.equal(validateWarningState(state),'');
    assert.match(validateWarningState({...state,noneApply:true}),/cannot/);
    assert.match(validateWarningState({...none(),coreIds:['not-a-core-warning']}),/Review/);
    assert.match(validateWarningState({...none(),coreIds:'bad'}),/Review/);
    assert.match(validateWarningState(removeWarning(state,'graphic-violence')),/core/);
});
test('Existing broad and unknown warnings are retained without inventing a major-death warning',()=>{
    const state=normalizeWarningState(null,['Death','Abuse','Mental Health Issue','Substance Abuse','Child Abuse','Personal <warning>']);
    assert.equal(state.coreIds.length,0);assert.deepEqual(warningLabels(state),['Death','Abuse','Mental Health Issue','Substance Abuse','Child Abuse','Personal <warning>']);
    assert.match(validateWarningState(state),/core/);
    const graphic=normalizeWarningState(null,['Graphic Violence','Self-harm']);assert.deepEqual(graphic.coreIds,['graphic-violence']);assert.equal(validateWarningState(graphic),'');
});
test('Optional context and chapter warnings survive draft and public payload round trips',()=>{
    let state=addWarning(none(),'pet-death');state.entries[0]={...state.entries[0],scope:'chapters',chapterIds:['two'],depiction:'mentioned',timing:'past',detail:'brief',frequency:'isolated'};state.note='Extra context <not markup>';
    assert.equal(validateWarningState(state,{chapterIds:['one','two']}),'');assert.match(validateWarningState(state,{chapterIds:['one']}),/valid chapters/);
    const book={id:'book',sections:{body:[{id:'two',title:'Two',content:'word '.repeat(3000)}]},publish_meta:{warnings:warningLabels(state),warningMeta:state}};
    assert.deepEqual(readPublishDraft(book).warningMeta,state);
    const form={isPublished:true,chapterIds:['two'],warnings:warningLabels(state),warningMeta:state};
    const payload=buildLibraryPayload(book,form),published=normalizePublishedWork({id:'book',data:payload});
    assert.deepEqual(published.warningMeta,state);assert.ok(published.warnings.includes('Pet death'));
    assert.equal(warningSummary(state,{chapterId:'one'}).rows.length,0);
    assert.equal(warningSummary(state,{chapterId:'two'}).rows[0].label,'Pet death');
    assert.match(warningSummary(state,{chapters:[{id:'two',title:'Two'}]}).rows[0].context,/Two/);
});
test('Selecting adult content never silently selects non-consent or changes a core decision',()=>{
    const state=addWarning(none(),'consensual-non-consent-roleplay');assert.deepEqual(state.coreIds,[]);assert.equal(state.noneApply,true);assert.equal(validateWarningState(state),'');
    assert.equal(addWarning(state,'Non-con').noneApply,false);
});
test('Custom warnings are text, deduplicated and cannot provide an opt-out',()=>{
    const state=addCustomWarning(none(),'<img onerror=bad>');assert.equal(state.entries[0].label,'<img onerror=bad>');
    assert.equal(addCustomWarning(state,'<img onerror=bad>').entries.length,1);
    assert.throws(()=>addCustomWarning(none(),'Author chose not to warn'),/not available/);
    assert.throws(()=>addCustomWarning(none(),'None of these core warnings apply'),/checkboxes/);
    assert.throws(()=>addCustomWarning(none(),'Gay'),/Additional tags/);
});
async function saveModule(){
    let source=await readFile(new URL('../../../applications/studio/page-ui/publish-save.js',import.meta.url),'utf8');
    source=source.replace(/(["'])(@alysum\/publishing\/|\/core\/writing-engine\/)([^"']+)\1/g,(_m,_q,prefix,tail)=>JSON.stringify(new URL((prefix.startsWith('@')?'../../publishing/':'../../writing-engine/')+tail,import.meta.url).href));
    return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('Publishing rejects an unfinished warning decision before cover, access or library writes',async()=>{
    const {runPublishSave}=await saveModule();let writes=0;const error={};
    await runPublishSave({isPublished:true,session:{mode:'cloud',user:{id:'owner'}},listed:false,book:{id:'book'},chapters:[],readForm:()=>({title:'Book',genres:['fantasy'],rating:'mature',chapterIds:['one'],warningMeta:normalizeWarningState(null)}),postError:error,loadDraftCoverFile(){writes++;},saveChapterAccess(){writes++;},supabase:{from(){writes++;}},api:{updateBook(){writes++;}}});
    assert.match(error.textContent,/core content warnings/);assert.equal(writes,0);
});
test('Unfinished warning selections can still be saved as publishing drafts',async()=>{
    const {runPublishSave}=await saveModule(),previous=globalThis.window;let patch;
    globalThis.window={location:{replace(){}}};
    try{await runPublishSave({isPublished:false,session:{mode:'local'},book:{id:'book'},readForm:()=>({title:'Book',chapterIds:[],warnings:['Death'],warningMeta:normalizeWarningState(null,['Death'])}),api:{async updateBook(id,value){patch=value;return value;}},postError:{}});assert.equal(patch.publish_meta.warningMeta.reviewed,false);assert.deepEqual(patch.publish_meta.warnings,['Death']);}finally{globalThis.window=previous;}
});

test('Requested aliases resolve without merging unrelated harm or consent labels',()=>{
    for(const term of ['Animal abuse','Animal harm','Beastiality','SA','SH (sexual harassment)','SV','Domestic violence','Incest','Pedophilia','Human trafficking','Stalking','Kidnapping','Body fluids','Religious trauma','Religious abuse','Cannibalism','Child death','Arachnophobia','Uncommon phobia/s','General PTSD','C-PTSD','Veteran/Wartime trauma/PTSD','Graphic depiction of illness/disease','Kink/Fetish','Fetish','Vore','Colonial Violence']){
        const item=warningDefinition(term);assert.ok(item,term);assert.ok(searchWarnings(term,{limit:100}).items.some(result=>result.id===item.id),term+' is searchable');
    }
    assert.equal(warningDefinition('Arachnophobia').id,'spiders');
    assert.notEqual(warningDefinition('PTSD').id,warningDefinition('C-PTSD').id);
    assert.notEqual(warningDefinition('Vore').id,warningDefinition('Gore').id);
    assert.equal(warningDefinition('Beastiality').kind,'warning');
    assert.equal(warningDefinition('Pedophilia').kind,'warning');
    assert.equal(warningDefinition('Incest').kind,'warning');
    assert.equal(warningDefinition('SH'),null,'Ambiguous initials must not silently mean harassment or self-harm');
});


test('removed warning is never offered, restored from saved metadata, or added as a custom label',()=>{
    const label='Sexual content involving minors',id='sexual-content-involving-minors';
    for(const value of [label,id,'Underage sexual activity','Underage sex']){
        assert.equal(warningDefinition(value),null);
        assert.ok(!searchWarnings(value).items.some(item=>item.id===id));
        assert.throws(()=>addCustomWarning(none(),value),/not available/);
    }
    const restored=normalizeWarningState({...none(),coreIds:[id]},[label]);
    assert.deepEqual(warningLabels(restored),[]);assert.equal(restored.reviewed,false);
    assert.match(validateWarningState(restored),/core/);
    const entry=normalizeWarningState({...none(),entries:[{id,label}]});
    assert.deepEqual(entry.entries,[]);
});
