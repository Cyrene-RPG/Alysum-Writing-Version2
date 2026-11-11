import {supabase} from '/core/authentication/client.js';
import {openReadingState} from '/core/library/reading-state.js';
import {createLibraryHub} from '/core/library/hub.js';
import {resolveStudioSession} from '/core/desktop/studio-session.js';
import {loadWorkspaceProfile,peekWorkspaceProfile} from '/core/account/workspace-profile.js';
import {getUiMode} from '@alysum/account/mode.js';
import {paintReaderNav} from '/applications/reader/page-ui/chrome.js';
import {initWorkspaceShell} from '/js/studio/shell.js?v=9';
import {mountLibraryHub} from './hub.js';

const root=document.getElementById('hubMain');let controller=null;

function paintReaderChrome(){
  const writerNav=document.getElementById('writerLibraryNav');
  const readerIcons=document.getElementById('reader-icons');
  if(!writerNav||!readerIcons)return;
  const readerMode=getUiMode()==='library';
  writerNav.hidden=readerMode;
  readerIcons.hidden=!readerMode;
  if(readerMode){
    document.body.classList.add('reader-shell');
    paintReaderNav();
  }
}

async function boot(){
 initWorkspaceShell({lead:'The ',accent:'Library',subtitle:'Find your next story.'});
 paintReaderChrome();
 const initial=await resolveStudioSession(supabase);
 const opened=await openReadingState(supabase,{local:initial.mode==='local',onAccountChange(){controller?.stop();root.replaceChildren();document.getElementById("hubDialog").close();document.getElementById("hubDialogBody").replaceChildren();location.reload();}});
 if(opened.session.mode!=='none'){
  const profile=peekWorkspaceProfile(opened.session);initWorkspaceShell({lead:'The ',accent:'Library',name:profile.name,imageUrl:profile.imageUrl});
  void loadWorkspaceProfile(supabase,opened.session).then(profile=>initWorkspaceShell({lead:'The ',accent:'Library',name:profile.name,imageUrl:profile.imageUrl})).catch(()=>{});
 }
 if(!opened.state.active)return;
 const api=createLibraryHub(supabase,{readingState:opened.state,subscriptions:()=>opened.snapshot?.subscriptions||[],viewerId:opened.session.user?.id||null});
 controller=mountLibraryHub(root,{api,opened});
 void opened.flush().then(saved=>{if(saved&&opened.state.active)void controller.render();}).catch(()=>{});
 const resumeSync=()=>{void opened.flush().then(saved=>{if(saved&&opened.state.active)void controller.render();}).catch(()=>{});};
 window.addEventListener('online',resumeSync);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void opened.flush().catch(()=>{});else resumeSync();});
 window.addEventListener('pagehide',()=>{void opened.flush().catch(()=>{});document.body.hidden=true;});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 window.addEventListener('popstate',()=>paintReaderChrome());
}
boot().catch(error=>{root.textContent='We couldn’t open the Library. Refresh to try again.';console.error(error);});
