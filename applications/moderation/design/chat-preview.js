/** Invented in-memory room. Never imports authentication or a production service. */
import {mountModeratorChat} from '../page-ui/chat.js';
const host=document.getElementById('md-screen');
host.innerHTML='<div class="md-heading"><div><p class="md-eyebrow">Alysum / Moderation preview</p><h1>Moderator Chat</h1><p class="md-muted">Try the shared staff room. Every message here is sample data and resets on reload.</p></div></div>';
document.getElementById('md-nav').innerHTML='<a href="/moderation-preview">Moderation overview</a><a href="/moderation-preview?view=chat" aria-current="page">Moderator Chat</a>';
document.getElementById('md-role').parentElement.remove();
for(const control of document.querySelectorAll('[data-action="profile"],[data-action="policy"]'))control.remove();
const messages=[
 {id:'1',senderId:'sample-mod',name:'Sample Moderator',role:'moderator',body:'I’m reviewing the new reports. Has anyone already picked up the missing-tags case?',createdAt:new Date(Date.now()-180000).toISOString()},
 {id:'2',senderId:'sample-admin',name:'Sample Admin',role:'admin',body:'I have that one. Please leave any evidence in the private case notes so it stays with the report.',createdAt:new Date(Date.now()-120000).toISOString()},
 {id:'3',senderId:'sample-mod',name:'Sample Moderator',role:'moderator',body:'Thanks! I’ll take the next report in the queue.',createdAt:new Date(Date.now()-60000).toISOString()},
];
const requests=new Map();
const service={
 async list({before=null,after=null}={}){return {items:messages.filter(m=>(!before||BigInt(m.id)<BigInt(before))&&(!after||BigInt(m.id)>BigInt(after))),hasOlder:false,hasNewer:false};},
 async send(body,key){if(requests.has(key))return requests.get(key);const row={id:String(messages.length+1),senderId:'sample-admin',name:'Sample Admin',role:'admin',body,createdAt:new Date().toISOString()};messages.push(row);const result={id:row.id};requests.set(key,result);return result;},
};
const room=mountModeratorChat({host,service,userId:'sample-admin'});
document.querySelector('[data-action="lock"]').onclick=()=>{room.destroy();host.replaceChildren();const message=document.createElement('p');message.textContent='Sample room locked. Reload to restart the preview.';host.append(message);};
window.modChatPreview={sampleData:true,messages,room};
