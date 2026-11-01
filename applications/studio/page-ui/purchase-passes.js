import {supabase} from '@alysum/authentication/client.js';
import {requireStudioSession} from '@alysum/desktop/studio-session.js';
import {loadWorkspaceProfile} from '@alysum/account/workspace-profile.js';
import {purchasePassRequest} from '/core/purchase-access/client.js';
import {mountPurchasePasses} from './purchase-passes-ui.js';
import {initWorkspaceShell} from './shell.js';
async function boot(){
 const session=await requireStudioSession(supabase,location.pathname+location.search);if(!session)return;
 if(session.mode!=='cloud')throw Error('Sign in online to use Purchase Passes.');
 const welcome={lead:'Writing ',accent:'Studio',subtitle:'Purchase Passes'};initWorkspaceShell(welcome);
 let changed=false,screen;
 const clear=()=>{changed=true;screen?.clear();};
 supabase.auth.onAuthStateChange((event,next)=>{if(next?.user?.id!==session.user.id)clear();});
 window.addEventListener('pagehide',clear);
 void loadWorkspaceProfile(supabase,session).then(profile=>{if(!changed)initWorkspaceShell({...welcome,name:profile.name,imageUrl:profile.imageUrl});}).catch(()=>{});
 screen=await mountPurchasePasses({request:async(...args)=>{if(changed)throw Error('Your account changed. Reload to continue.');const result=await purchasePassRequest(...args);if(changed)throw Error('Your account changed. Reload to continue.');return result;}});
 if(changed)screen.clear();
}
boot().catch(error=>document.querySelector('#passStatus').textContent=error.message);
