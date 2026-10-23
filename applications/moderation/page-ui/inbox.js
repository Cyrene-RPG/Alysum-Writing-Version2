import {supabase as client} from '/core/authentication/client.js';
import {createModerationService} from '/core/moderation/service.js';
import {esc,$,date,label,badge,button,title,table,formShell,field,modal,close,toast,showError,clearPrivate,bindDialog} from './common.js';
const api=createModerationService(client);let userId='',epoch=0,threads=[],sanctions=[],opened=null,messages=[],offset=0,busy=false;
const call=(action,payload={},key)=>api.call(action,payload,key);
async function start(more=false){
 const generation=++epoch;try{
 const {data,error}=await client.auth.getSession();if(error)throw error;
 if(!data?.session){clearPrivate();$('#md-screen').innerHTML=title('Moderation messages','Sign in to read private staff conversations or appeal an account restriction.')+'<a href="/login?next=%2Fmoderation-inbox">Sign in</a>';return;}
 userId=data.session.user.id;$('#md-identity').textContent='Your private conversations';
 $('#md-nav').replaceChildren();if(!more)$('#md-screen').innerHTML=title('Moderation messages','Loading your conversations…');
 const dataInbox=await call('my_inbox',{offset:more?threads.length:0});if(generation!==epoch)return;
 threads=more?[...threads,...dataInbox.threads]:dataInbox.threads;sanctions=dataInbox.sanctions;
 $('#md-screen').innerHTML=title('Moderation messages','Official on-site conversations with Alysum staff. You can reply and appeal even while your account is suspended.')+
 '<p id="mc-page-error" class="md-error" role="alert"></p>'+
 (sanctions.length?'<section class="md-panel"><h2>Account notices</h2>'+sanctions.map(s=>'<div class="md-item"><strong>'+esc(label(s.kind))+'</strong><p>'+esc(s.reason)+'</p><p class="md-pre">'+esc(s.explanation)+'</p><small class="md-muted">Issued '+date(s.createdAt)+' · '+(s.expiresAt?'Expires '+date(s.expiresAt):s.kind==='warning'?'Official warning':'No expiry')+'</small><div class="md-actions">'+(['pending','awaiting_information'].includes(s.appealStatus)?badge('Appeal '+label(s.appealStatus)):button('Request appeal','appeal',s.id))+'</div></div>').join('')+'</section>':'')+
 table(['Conversation','Requested response date','Updated'],threads.map(t=>[button(t.subject,'thread',t.id,'md-text-button')+(!t.recipient_read_at||new Date(t.updated_at)>new Date(t.recipient_read_at)?'<small>New message</small>':''),t.deadline||'—',date(t.updated_at)]))+(threads.length<dataInbox.total?button('Load more conversations','more'):'');
 const thread=new URLSearchParams(location.search).get('thread');if(thread&&!more){history.replaceState(null,'',location.pathname);await openThread(thread);}
 }catch(error){if(generation===epoch)showError(error);}
}
async function openThread(id,more=false){
 const generation=epoch,data=await call('my_thread',{id,offset:more?offset:0});if(generation!==epoch)return;
 opened=data;messages=more?[...data.messages,...messages]:data.messages;offset=more?offset+data.messages.length:data.messages.length;
 modal(data.subject,(data.deadline?'<p class="md-muted">Requested response date: '+esc(data.deadline)+'</p>':'')+
 '<div class="md-messages">'+messages.map(m=>'<article class="md-message '+esc(m.side)+'"><strong>'+esc(m.side==='staff'?'Alysum Moderation':'You')+'</strong><p>'+esc(m.body)+'</p><small>'+date(m.createdAt)+'</small></article>').join('')+'</div>'+
 formShell('mc-user-reply',field('mc-user-body','Reply to moderation'),'Send reply')+(offset<data.total?button('Load earlier messages','earlier',String(offset)):''));
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-live]');if(!b)return;
 const {live:a,id}=b.dataset;const run=async()=>{if(a==='close')return close();if(a==='thread')return openThread(id);if(a==='more')return start(true);if(a==='earlier')return openThread(opened.id,true);
 if(a==='appeal'){const s=sanctions.find(s=>s.id===id);modal('Request an appeal',formShell('mc-user-appeal','<p><strong>'+esc(label(s.kind))+'</strong> · '+esc(s.reason)+'</p>'+field('mc-user-body','What would you like staff to review?'),'Submit appeal','data-sanction="'+esc(id)+'"'));}};
 void run().catch(showError);
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['mc-user-reply','mc-user-appeal'].includes(form.id))return;e.preventDefault();if(busy)return;busy=true;const generation=epoch,buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{const body=$('#mc-user-body').value.trim();if(body.length<10)throw Error('Enter at least 10 characters.');
 if(form.id==='mc-user-reply'){await call('user_reply',{threadId:opened.id,body},form.dataset.requestId);if(generation===epoch){await openThread(opened.id);toast('Your reply has been sent to staff.');}}
 else{await call('submit_appeal',{sanctionId:form.dataset.sanction,body},form.dataset.requestId);if(generation===epoch){close();await start();toast('Your appeal has been submitted for review.');}}
 }catch(error){showError(error);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
});
bindDialog();client.auth.onAuthStateChange((_event,session)=>{if((session?.user?.id||'')!==userId){epoch++;clearPrivate();userId=session?.user?.id||'';threads=[];messages=[];opened=null;setTimeout(()=>void start(),0);}});
window.addEventListener('pagehide',()=>{epoch++;clearPrivate();});
void start();

window.addEventListener('pageshow',event=>{if(event.persisted)void start();});
