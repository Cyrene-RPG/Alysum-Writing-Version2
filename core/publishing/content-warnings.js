import {CORE_WARNINGS,WARNING_CATALOG,warningDefinition,warningKey} from './warning-catalog.js';
export {CORE_WARNINGS,WARNING_CATALOG};
export const WARNING_OPTIONS=Object.freeze({
    depiction:['','mentioned','implied','depicted'],
    timing:['','past','present'],
    detail:['','brief','detailed','graphic'],
    frequency:['','isolated','recurring'],
});
const coreIds=new Set(CORE_WARNINGS.map(item=>item.id));
export function isWarningOptOut(value){return /(?:chose|choose|chooses|chosen).{0,30}not.{0,30}(?:warn|apply)|(?:decline|withhold).{0,20}warnings/i.test(String(value));}
const strings=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string').map(v=>v.trim()).filter(Boolean))]:[];
function entry(raw) {
    const def=warningDefinition(raw?.id)||warningDefinition(raw?.label);
    if(def?.kind==='core')return null;
    const label=String(def?.label||raw?.label||'').trim().slice(0,250);
    if(!label)return null;
    const result={id:def?.id||'custom:'+warningKey(label),label,kind:def?.kind||'custom',category:def?.category||'Custom warning',scope:raw?.scope==='chapters'?'chapters':'work',chapterIds:strings(raw?.chapterIds)};
    for(const [field,values] of Object.entries(WARNING_OPTIONS))result[field]=values.includes(raw?.[field])?raw[field]:'';
    if(result.scope==='work')result.chapterIds=[];
    return result;
}
export function normalizeWarningState(raw,legacy=[]) {
    const supplied=raw&&raw.version===1;
    const state={version:1,reviewed:supplied&&raw.reviewed===true,noneApply:supplied&&raw.noneApply===true,coreIds:supplied?strings(raw.coreIds).filter(id=>coreIds.has(id)):[],entries:[],note:String(supplied?raw.note||'':'').slice(0,4000)};
    const seen=new Set();
    function add(value){const item=entry(value);if(item&&!seen.has(item.id)){seen.add(item.id);state.entries.push(item);}}
    if(supplied)for(const item of Array.isArray(raw.entries)?raw.entries:[])add(item);
    // Published strings remain backward compatible; broad legacy labels never
    // imply a more specific core warning, and unknown labels are retained.
    for(const label of strings(legacy)) {
        const def=warningDefinition(label);
        if(def?.kind==='core'){if(!supplied&&!state.coreIds.includes(def.id))state.coreIds.push(def.id);}
        else if(!supplied||!state.entries.some(item=>item.id===(def?.id||'custom:'+warningKey(label))))add({id:def?.id,label});
    }
    if(state.coreIds.length||state.noneApply)state.reviewed=true;
    return state;
}
export function warningLabels(state) {
    const value=normalizeWarningState(state);
    return [...new Set([...value.coreIds.map(id=>CORE_WARNINGS.find(item=>item.id===id).label),...value.entries.map(item=>item.label)])];
}
export function validateWarningState(raw,{chapterIds}={}) {
    if(!raw||raw.version!==1)return 'Select the core content warnings, or explicitly confirm that none apply.';
    const state=normalizeWarningState(raw);
    if(state.entries.some(item=>isWarningOptOut(item.label)))return 'Choosing not to specify core warnings is not available. Select the applicable core warnings.';
    if(raw.coreIds!=null&&(!Array.isArray(raw.coreIds)||raw.coreIds.some(id=>!coreIds.has(id))))return 'Review the core warning selection.';
    if(state.noneApply&&state.coreIds.length)return '“None of these core warnings apply” cannot be selected with a core warning.';
    if(!state.reviewed||!state.noneApply&&!state.coreIds.length)return 'Select the core content warnings, or explicitly confirm that none apply.';
    const allowed=chapterIds?new Set(chapterIds.map(String)):null;
    for(const item of state.entries)if(item.scope==='chapters'&&(!item.chapterIds.length||allowed&&item.chapterIds.some(id=>!allowed.has(id))))return 'Choose valid chapters for “'+item.label+'”, or apply it to the whole work.';
    return '';
}
export function addWarning(raw,id) {
    const state=normalizeWarningState(raw),def=warningDefinition(id);if(!def)return state;
    if(def.kind==='core'){state.coreIds=[...new Set([...state.coreIds,def.id])];state.noneApply=false;state.reviewed=true;}
    else if(!state.entries.some(item=>item.id===def.id))state.entries.push(entry(def));
    return state;
}
export function addCustomWarning(raw,label) {
    const value=String(label||'').trim();if(!value||value.length>250)throw Error('Use 1–250 characters for a custom warning.');
    if(/^(?:none of (?:these |the )?core warnings apply|no (?:archive|core|content) warnings(?: apply)?)$/i.test(value))throw Error('Use the core warning checkboxes to confirm that none apply.');
    if(isWarningOptOut(value))throw Error('Choosing not to specify warnings is not available.');
    if(/^(?:gay|lesbian|bisexual|transgender|trans|lgbtq?\+?|queer|autism|autistic|disabled|disability|neurodivergent)$/i.test(value))throw Error('Identity labels belong in Additional tags. Use a warning for harmful content such as discrimination or abuse.');
    const def=warningDefinition(value);if(def)return addWarning(raw,def.id);
    const state=normalizeWarningState(raw),item=entry({label:value});if(!state.entries.some(other=>other.id===item.id))state.entries.push(item);return state;
}
export function removeWarning(raw,id) {
    const state=normalizeWarningState(raw);state.coreIds=state.coreIds.filter(value=>value!==id);state.entries=state.entries.filter(item=>item.id!==id);return state;
}
export function warningSummary(raw,{chapterId='',chapters=[]}={}) {
    const state=normalizeWarningState(raw),titles=new Map(chapters.map(ch=>[String(ch.id),ch.title||'Untitled chapter']));
    const rows=state.coreIds.map(id=>({label:CORE_WARNINGS.find(item=>item.id===id).label,context:'Core warning',core:true}));
    for(const item of state.entries){if(chapterId&&item.scope==='chapters'&&!item.chapterIds.includes(String(chapterId)))continue;
        const context=[item.kind==='adult'?'Adult content':item.kind==='media'?'Media content':item.kind==='content'?'Content detail':'Content warning',...Object.keys(WARNING_OPTIONS).map(key=>item[key]).filter(Boolean)];
        if(!chapterId&&item.scope==='chapters')context.push(item.chapterIds.map(id=>titles.get(id)||'Selected chapter').join(', '));
        rows.push({label:item.label,context:context.join(' · '),core:false});
    }
    return {rows,note:state.note,noneApply:state.noneApply,reviewed:state.reviewed};
}
