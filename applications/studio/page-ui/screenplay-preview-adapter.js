import {createScreenplaysApi as createLocalScripts} from '/core/screenplays/client.js?preview-local=1';
import {mountScreenplayEditor} from '/applications/studio/page-ui/screenplay-editor.js';
import {block} from '/core/screenplays/model.js';
// This module is substituted only by the no-login preview's import map.
// The preview runs the actual Studio page, cards and styles with invented data.
import {mountBookFormatChoice as mountActualChoice,loadAudiobookStyles} from '/applications/studio/page-ui/book-format-choice.js';
import {mountAudiobookEditor} from '/applications/studio/page-ui/audiobook-editor.js';
import {audiobookDetails,inspectAudioFile} from '/core/audiobooks/model.js';
export {loadAudiobookStyles};

const owner='10000000-0000-0000-0000-000000000001';
const sampleAudio='20000000-0000-0000-0000-000000000001';
let written=[{id:'sample-written',user_id:owner,title:'The Lantern Keeper',created:1,updated:1,words:12,
 sections:{front:[],body:[{id:'sample-chapter',kind:'chapter',title:'Chapter 1',content:'<p>The lantern waited by the door.</p>',notes:[]}],back:[]}}];
const books=new Map([[sampleAudio,{id:sampleAudio,owner_id:owner,title:'The Lantern Keeper — Audio',linked_book_id:'sample-written',description:'',narrator:'Sample narrator',credits:'',rights_confirmed:false}]]);
const tracks=new Map(),recordings=new Map(),urls=new Map();
const copy=value=>structuredClone(value);
const profile={name:'Preview',username:'preview',imageUrl:'',dailyWritingEnabled:false,writingDayTotals:{},writingDayRemoved:{},xp:0,reputation:0};

export const supabase={
 auth:{async getSession(){return {data:{session:{user:{id:owner}}}};},async getUser(){return {data:{user:{id:owner}}};}},
 async rpc(){return {data:{granted:false}};},
 from(){throw new Error('The preview cannot read or write live tables.');},
};
export async function requireStudioSession(){return {mode:'cloud',user:{id:owner}};}
export function peekWorkspaceProfile(){return copy(profile);}
export async function loadWorkspaceProfile(){return copy(profile);}
export function createBooksApi(){return {
 peekBooks:()=>copy(written),listBooks:async()=>copy(written),getBook:async id=>copy(written.find(book=>book.id===id)),
 insertBook:async value=>{const book={...copy(value),id:crypto.randomUUID(),user_id:owner};written.push(book);return copy(book);},
 deleteBook:async id=>{written=written.filter(book=>book.id!==id);},syncPending:async()=>({synced:0,failed:0}),hasPending:()=>false,
};}
export async function markBooksWithLiveListings(_,rows){return rows;}
export function isLibraryListed(){return false;}
export async function unlistLibraryListing(){}

const api={
 async list(){return [...books.values()].map(copy);},
 async get(id){if(!books.has(id))throw new Error('Choose one of the sample audiobooks.');return copy(books.get(id));},
 async tracks(id){return copy(tracks.get(id)||[]);},
 async save(id,details){
  const value={...(id?await api.get(id):{}),...audiobookDetails(details),id:id||crypto.randomUUID(),owner_id:owner};
  books.set(value.id,value);return copy(value);
 },
 async upload(id,file,{title,duration}){
  await inspectAudioFile(file);if(!(await api.get(id)).rights_confirmed)throw new Error('Confirm your recording permissions first.');
  const track={id:crypto.randomUUID(),audiobook_id:id,title,duration_seconds:duration,size_bytes:file.size};
  recordings.set(track.id,file);tracks.set(id,[...(tracks.get(id)||[]),track]);return copy(track);
 },
 async preview(track){if(!recordings.has(track.id))throw new Error('Choose a recording to try playback.');if(!urls.has(track.id))urls.set(track.id,URL.createObjectURL(recordings.get(track.id)));return urls.get(track.id);},
 async removeTrack(id){for(const [bookId,rows] of tracks)tracks.set(bookId,rows.filter(row=>row.id!==id));if(urls.has(id))URL.revokeObjectURL(urls.get(id));urls.delete(id);recordings.delete(id);return {cleanupFailed:false};},
};
export function createAudiobooksApi(){return api;}
const scriptApi=createLocalScripts(null,'screenplay-preview-only');
const sampleId='30000000-0000-0000-0000-000000000001';
if(!scriptApi.read(sampleId))scriptApi.backup(sampleId,{title:'The Last Light',author:'Sample Writer',contact:'',blocks:[
 block('scene','INT. LIGHTHOUSE — NIGHT'),block('action','A beam turns across a restless sea. Inside, MARA listens to the radio.'),
 block('character','MARA'),block('dialogue','You said the water would be calm.'),
 block('character','ELI'),block('parenthetical','(over the radio)'),block('dialogue','I said we would make it home.'),
 block('scene','EXT. HARBOR — DAWN'),block('action','The first boat returns. Its running lights flicker out.')
]},0);
export function createScreenplaysApi(){return scriptApi;}
async function openScript(id,importOnOpen=false){
 document.querySelector('#preview-editor')?.remove();
 const mount=document.createElement('main');mount.id='preview-editor';mount.className='script-workbench';document.querySelector('.wrap').append(mount);
 document.querySelector('#studioShell').classList.add('hidden');
 await mountScreenplayEditor({mount,record:await scriptApi.get(id),api:scriptApi,preview:true,importOnOpen});
 mount.scrollIntoView({block:'start'});
}


function showStudio(){
 document.querySelector('#preview-editor')?.classList.add('hidden');document.querySelector('#studioShell').classList.remove('hidden');
 document.querySelector('#newBookCard')?.focus();window.dispatchEvent(new Event('focus'));
}
async function openAudio(id,focusUpload=false){
 let mount=document.querySelector('#preview-editor');
 if(!mount){mount=document.createElement('main');mount.id='preview-editor';mount.className='audio-workspace';document.querySelector('.wrap').append(mount);}
 for(const player of mount.querySelectorAll('audio'))player.pause();
 await mountAudiobookEditor({mount,id,api,writtenBooks:written,focusUpload});
 document.querySelector('#studioShell').classList.add('hidden');mount.classList.remove('hidden');
 mount.scrollIntoView({block:'start'});
}
export function mountBookFormatChoice(options){return mountActualChoice({...options,navigate(url){
 const next=new URL(url,location.origin);
 if(next.pathname==='/screenplay-studio')void openScript(next.searchParams.get('id'),next.searchParams.get('import')==='1').catch(error=>document.querySelector('#studioStatus').textContent=error.message);
 else if(next.pathname==='/audiobook-studio')void openAudio(next.searchParams.get('id'),next.searchParams.get('upload')==='1').catch(error=>document.querySelector('#studioStatus').textContent=error.message);
 else document.querySelector('#studioStatus').textContent='Sample preview: the written-book option opens the existing editor on Alysum.';
}});}

export function initWorkspaceShell(){
 const sub=document.querySelector('#welcomeSubtitle');if(sub)sub.textContent='Preview · Sample books and screenplay drafts. No live accounts or books are used.';
 const button=document.querySelector('#welcomePfpBtn'),panel=document.querySelector('#welcomePfpDropdown');
 if(button&&!button.dataset.previewWired){button.dataset.previewWired='1';button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));});}
}
document.addEventListener('click',event=>{
 const link=event.target.closest('a');if(!link)return;const url=new URL(link.href,location.origin);
 if(url.origin!==location.origin)return;event.preventDefault();
 if(url.pathname==='/screenplay-studio')void openScript(url.searchParams.get('id')).catch(error=>document.querySelector('#studioStatus').textContent=error.message);
 else if(url.pathname==='/audiobook-studio')void openAudio(url.searchParams.get('id')).catch(error=>document.querySelector('#studioStatus').textContent=error.message);
 else if((url.pathname==='/studio'||url.pathname==='/screenplay-preview'))showStudio();
 else document.querySelector('#studioStatus').textContent='Sample preview only. Use New book or Upload book to choose Script.';
},true);
window.addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url);});

