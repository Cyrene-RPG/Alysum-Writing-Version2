import {supabase} from '@alysum/authentication/client.js';
import {requireStudioSession} from '@alysum/desktop/studio-session.js';
import {loadWorkspaceProfile} from '@alysum/account/workspace-profile.js';
import {passTestRequest} from '/core/purchase-passes/client.js';
import {mountPassLab} from './pass-lab-ui.js';
import {initWorkspaceShell} from './shell.js';
async function boot(){const session=await requireStudioSession(supabase,location.pathname);if(!session)return;if(session.mode!=='cloud')throw Error('Sign in online to test Purchase Passes.');const welcome={lead:'Writing ',accent:'Studio',subtitle:'Purchase Pass Lab · Test only'};initWorkspaceShell(welcome);void loadWorkspaceProfile(supabase,session).then(profile=>initWorkspaceShell({...welcome,name:profile.name,imageUrl:profile.imageUrl})).catch(()=>{});const lab=await mountPassLab({request:passTestRequest});supabase.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'&&next?.user?.id!==session.user.id)lab.clear();});}
boot().catch(error=>document.querySelector('#passStatus').textContent=error.message);
