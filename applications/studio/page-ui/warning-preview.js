import {bindWarningPicker} from './warning-picker.js?v=6';
import {normalizeWarningState,validateWarningState,warningLabels} from '/core/publishing/content-warnings.js';
const chapters=[{id:'sample-one',title:'Chapter 1 — Arrival'},{id:'sample-two',title:'Chapter 2 — The discovery'},{id:'sample-three',title:'Chapter 3 — Home'}];
const key='alysum:warning-preview:v1';
let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
const legacy=saved?.warnings||['Death','Self-harm'];
const picker=bindWarningPicker(document,{initialState:saved?.warningMeta||null,chapters,getSelected:()=>legacy,setSelected(){}});
document.title='Content warning preview — Alysum';
document.querySelector('.pub-page h1').textContent='Publishing preview';
document.querySelector('.pub-sub').textContent='Sample work only. Try the warning section below; nothing here publishes to the live library.';
document.querySelector('#workTitle').value='The Lantern Keeper';
document.querySelector('#workSummary').value='A sample listing for trying the content warning picker.';
const status=document.querySelector('#pubStatus'),error=document.querySelector('#postError');
function save(publish){const warningMeta=picker.read();const issue=publish?validateWarningState(warningMeta,{chapterIds:chapters.map(ch=>ch.id)}):'';error.hidden=!issue;error.textContent=issue;if(issue){picker.focusCore();return;}try{localStorage.setItem(key,JSON.stringify({warningMeta,warnings:warningLabels(warningMeta)}));status.textContent=publish?'Preview validated. Nothing was published.':'Preview saved on this device.';}catch{status.textContent='Device storage is unavailable. This preview has not been saved.';}}
document.querySelector('#saveDraftBtn').onclick=()=>save(false);
document.querySelector('#postBtn').textContent='Check publishing warnings';
document.querySelector('#postBtn').onclick=()=>save(true);
const manuscript=document.querySelector('#chapterList')||document.querySelector('#manuscriptList');if(manuscript)manuscript.textContent='Three invented chapters are available in warning details.';
for(const input of document.querySelectorAll('input[type=file]'))input.disabled=true;
window.warningPreview={read:()=>picker.read(),chapters,validate:()=>validateWarningState(picker.read(),{chapterIds:chapters.map(ch=>ch.id)})};
