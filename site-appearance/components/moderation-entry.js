import {supabase} from '/core/authentication/client.js';
let epoch=0;
function clearEntries(){
 for(const id of ['mc-profile-entry','mc-profile-messages','mc-profile-nav','mc-profile-messages-nav'])document.getElementById(id)?.remove();
}
function navLink(id,text,href){
 const nav=document.querySelector('.settings-nav-list');if(!nav)return;
 const link=document.createElement('a');link.id=id;link.className='settings-nav-page';link.href=href;link.textContent=text;nav.append(link);
}
async function update(){
 const version=++epoch;clearEntries();
 const {data}=await supabase.auth.getSession();if(version!==epoch||!data?.session)return;
 navLink('mc-profile-messages-nav','Moderation messages','/moderation-inbox');
 const content=document.querySelector('.settings-content');
 // Settings uses tabs; its navigation is the entry point. Profile also has cards.
 const isSettings=Boolean(document.querySelector('[data-section="securityPanel"]'));
 if(content&&!isSettings){
 const messages=document.createElement('section');messages.id='mc-profile-messages';messages.className='panel';messages.innerHTML='<h2>Moderation messages</h2><p class="hint">Private conversations with Alysum staff and account appeals.</p><a class="btn" href="/moderation-inbox">Open moderation messages</a>';content.append(messages);
 }
 const {data:access,error}=await supabase.rpc('mc_call',{p_action:'access',p_payload:{}});
 if(version!==epoch||error||!access?.role)return;
 navLink('mc-profile-nav','Moderation Center','/moderation');
 if(!content||isSettings)return;
 const section=document.createElement('section');section.id='mc-profile-entry';section.className='panel';section.innerHTML='<h2>Moderation</h2><p class="hint">Your private staff workspace. Sign in separately and verify with your authenticator to enter.</p><a class="btn" href="/moderation">Open Moderation Center</a>';content.append(section);
}
void update().catch(()=>{});
supabase.auth.onAuthStateChange(()=>setTimeout(()=>void update().catch(()=>{}),0));
