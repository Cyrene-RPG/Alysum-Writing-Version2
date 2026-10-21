// Isolated UI demo. No auth SDK, backend client, database, or network uploads.
import {mountBookFormatChoice} from './book-format-choice.js';
import {mountAudiobookEditor} from './audiobook-editor.js';
import {audiobookDetails,inspectAudioFile} from '/core/audiobooks/model.js';

const owner='10000000-0000-0000-0000-000000000001';
const written=[{id:'sample-written',user_id:owner,title:'The Lantern Keeper'}];
const books=new Map(),tracks=new Map(),recordings=new Map(),urls=new Map();
const status=document.querySelector('#preview-status'),mount=document.querySelector('#preview-editor');
let currentId;
const api={
    async get(id){if(!books.has(id))throw new Error('Choose one of the demo audiobooks.');return structuredClone(books.get(id));},
    async tracks(id){return structuredClone(tracks.get(id)||[]);},
    async save(id,details){
        const value={...(id?await api.get(id):{}),...audiobookDetails(details),id:id||crypto.randomUUID(),owner_id:owner};
        books.set(value.id,value);return structuredClone(value);
    },
    async upload(id,file,{title,duration}){
        await inspectAudioFile(file);const book=await api.get(id);
        if(!book.rights_confirmed)throw new Error('Confirm your recording permissions first.');
        const track={id:crypto.randomUUID(),audiobook_id:id,title,duration_seconds:duration,size_bytes:file.size};
        recordings.set(track.id,file);tracks.set(id,[...(tracks.get(id)||[]),track]);return structuredClone(track);
    },
    async preview(track){
        if(!recordings.has(track.id))throw new Error('Choose a recording to try playback.');
        if(!urls.has(track.id))urls.set(track.id,URL.createObjectURL(recordings.get(track.id)));
        return urls.get(track.id);
    },
    async removeTrack(id){
        for(const [bookId,rows] of tracks)tracks.set(bookId,rows.filter(row=>row.id!==id));
        if(urls.has(id))URL.revokeObjectURL(urls.get(id));urls.delete(id);recordings.delete(id);return {cleanupFailed:false};
    },
};

async function open(id,focusUpload=false){
    if(currentId&&currentId!==id&&mount.querySelector('[data-details-status]')?.textContent==='Unsaved changes'){
        if(!window.confirm('Leave this demo draft without saving its details?'))return;
    }
    for(const audio of mount.querySelectorAll('audio'))audio.pause();
    await mountAudiobookEditor({mount,id,api,writtenBooks:written,focusUpload});currentId=id;
    // Keep demo navigation entirely inside this page.
    const back=mount.querySelector('a[href="/studio"]');back.href='#preview-new';
    back.addEventListener('click',event=>{event.preventDefault();document.querySelector('#preview-new').focus();document.querySelector('header').scrollIntoView();});
    status.textContent='Preview only: details and recordings stay in this tab. Nothing has been published.';
    if(!focusUpload)mount.scrollIntoView({block:'start'});
}

const choice=mountBookFormatChoice({
    session:{mode:'cloud',user:{id:owner}},getBooks:()=>written,
    async createWritten(){return {id:'preview-written'};},
    importWritten(){status.textContent='Written book selected. On your real Studio this opens the existing manuscript importer.';},
    createAudio:details=>api.save(null,details),
    navigate(url){
        const next=new URL(url,location.origin);
        if(next.pathname==='/audiobook-studio')void open(next.searchParams.get('id'),next.searchParams.get('upload')==='1').catch(error=>status.textContent=error.message);
        else status.textContent='Written book selected. On your real Studio this opens a new written draft in the editor.';
    },
});
document.querySelector('#preview-new').addEventListener('click',event=>choice.open('new',event.currentTarget));
document.querySelector('#preview-upload').addEventListener('click',event=>choice.open('upload',event.currentTarget));
document.querySelector('#preview-sample').addEventListener('click',async()=>{
    const sample=await api.save(null,{title:'The Lantern Keeper — Audio edition',linked_book_id:'sample-written',narrator:'Sample narrator',credits:'Example recording credits'});
    await open(sample.id);
});
window.addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url);});
