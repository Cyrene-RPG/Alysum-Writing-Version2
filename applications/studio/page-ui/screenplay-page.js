import {supabase} from '@alysum/authentication/client.js';
import {requireStudioSession} from '@alysum/desktop/studio-session.js';
import {loadWorkspaceProfile} from '@alysum/account/workspace-profile.js';
import {initWorkspaceShell} from './shell.js?v=9';
import {createScreenplaysApi} from '/core/screenplays/client.js?v=2';
import {mountScreenplayEditor} from './screenplay-editor.js?v=2';

async function boot() {
    const session=await requireStudioSession(supabase,location.pathname+location.search);if(!session)return;
    initWorkspaceShell({lead:'Writing ',accent:'Studio',subtitle:'Screenplay'});
    void loadWorkspaceProfile(supabase,session).then(profile=>initWorkspaceShell({lead:'Writing ',accent:'Studio',subtitle:'Screenplay',name:profile.name,imageUrl:profile.imageUrl})).catch(()=>{});
    const api=createScreenplaysApi(session.mode==='cloud'?supabase:null,session.user.id),params=new URLSearchParams(location.search),id=params.get('id');
    if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Open a screenplay from Studio, or choose Script from New book.');
    await mountScreenplayEditor({mount:document.querySelector('#screenplayEditor'),record:await api.get(id),api,importOnOpen:params.get('import')==='1'});
}
boot().catch(error=>{const mount=document.querySelector('#screenplayEditor');mount.replaceChildren();const title=document.createElement('h1');title.textContent='Could not open screenplay';const copy=document.createElement('p');copy.textContent=error.message;const link=document.createElement('a');link.href='/studio';link.textContent='Back to Studio';mount.append(title,copy,link);});
