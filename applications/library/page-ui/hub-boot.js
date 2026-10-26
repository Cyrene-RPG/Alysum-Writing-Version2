import {supabase} from '/core/authentication/client.js';
import {openReadingState} from '/core/library/reading-state.js';
import {createLibraryHub} from '/core/library/hub.js';
import {resolveStudioSession} from '/core/desktop/studio-session.js';
import {loadWorkspaceProfile,peekWorkspaceProfile} from '/core/account/workspace-profile.js';
import {initWorkspaceShell} from '/js/studio/shell.js?v=9';
import {mountLibraryHub} from './hub.js';
const root=document.getElementById('hubMain');let controller=null;
async function boot(){
 initWorkspaceShell({lead:'The ',accent:'Library',subtitle:'Find your next story.'});
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
}
boot().catch(error=>{root.textContent='We couldn’t open the Library. Refresh to try again.';console.error(error);});
