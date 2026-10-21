import {supabase} from '@alysum/authentication/client.js';
import {requireStudioSession} from '@alysum/desktop/studio-session.js';
import {createBooksApi} from '@alysum/synchronization-engine/books.js?v=12';
import {loadWorkspaceProfile} from '@alysum/account/workspace-profile.js';
import {createAudiobooksApi} from '/core/audiobooks/client.js';
import {audioError} from '/core/audiobooks/model.js';
import {initWorkspaceShell} from './shell.js?v=9';
import {mountAudiobookEditor} from './audiobook-editor.js';

async function boot(){
    const mount=document.querySelector('#audiobookEditor'),params=new URLSearchParams(window.location.search),id=params.get('id');
    const session=await requireStudioSession(supabase,window.location.pathname+window.location.search);
    if(!session)return;
    if(session.mode!=='cloud')throw new Error('Sign in online to manage audiobook recordings.');
    if(!/^[a-f0-9-]{36}$/.test(id || ''))throw new Error('Open an audiobook from your Studio to manage its recordings.');
    initWorkspaceShell({lead:'Audiobook ',accent:'Studio',subtitle:'Your recordings, chapters, and credits.'});
    void loadWorkspaceProfile(supabase,session).then(profile=>initWorkspaceShell({lead:'Audiobook ',accent:'Studio',subtitle:'Your recordings, chapters, and credits.',name:profile.name,imageUrl:profile.imageUrl})).catch(()=>{});
    const api=createAudiobooksApi(supabase,session.user.id);
    let writtenBooks=[];
    try{writtenBooks=(await createBooksApi(session,supabase).listBooks()).filter(book=>String(book.user_id)===String(session.user.id)&&!book.draft_parent_id);}catch{}
    await mountAudiobookEditor({mount,id,api,writtenBooks,focusUpload:params.get('upload')==='1'});
}
boot().catch(error=>{
    const mount=document.querySelector('#audiobookEditor');mount.replaceChildren();mount.className='audio-workspace';
    const title=document.createElement('h1');title.textContent='Could not open audiobook';
    const copy=document.createElement('p');copy.textContent=audioError(error).message;
    const back=document.createElement('a');back.href='/studio';back.textContent='Back to Studio';mount.append(title,copy,back);
});
