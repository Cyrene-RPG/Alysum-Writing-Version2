import {supabase} from '/core/authentication/client.js';
let epoch=0;
async function update(){
 const version=++epoch;
 document.getElementById('mc-profile-entry')?.remove();document.getElementById('mc-profile-messages')?.remove();
 const {data}=await supabase.auth.getSession();if(version!==epoch||!data?.session)return;
 const {data:access,error}=await supabase.rpc('mc_call',{p_action:'access',p_payload:{}});
 if(version!==epoch||error)return;
 const content=document.querySelector('.settings-content');if(!content)return;
 const messages=document.createElement('section');messages.id='mc-profile-messages';messages.className='panel';messages.innerHTML='<h2>Moderation messages</h2><p class="hint">Private conversations with Alysum staff and account appeals.</p><a class="btn" href="/moderation-inbox">Open moderation messages</a>';content.append(messages);
 if(!access?.role)return;
 const section=document.createElement('section');section.id='mc-profile-entry';section.className='panel';section.innerHTML='<h2>Moderation</h2><p class="hint">Your private staff workspace. Sign in separately and verify with your authenticator to enter.</p><a class="btn" href="/moderation">Open Moderation Center</a>';content.append(section);
}
void update().catch(()=>{});
supabase.auth.onAuthStateChange(()=>setTimeout(()=>void update().catch(()=>{}),0));
