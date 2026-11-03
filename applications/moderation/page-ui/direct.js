import {esc,$,button,formShell,field,select,modal} from './common.js';

export function conversationKindLabel(kind){
 return kind==='direct'?'Private':'Official';
}

export function privateMessageForm(userId=''){
 modal('New private message',formShell('mc-direct-form',
  field('mc-direct-recipient','Recipient account ID','text',userId)+
  field('mc-direct-subject','Subject','text','A private message')+
  field('mc-direct-message','Private message the user will receive in their on-site inbox')+
  field('mc-direct-deadline','Response date (optional)','date')+
  '<div class="md-callout">Delivered only to the user’s on-site inbox and Moderation Messages. Nothing is emailed. Other staff cannot read this unless you invite one additional moderator.</div>',
  'Send private message'));
 $('#mc-direct-deadline').required=false;
}

export function threadPrivateChrome(data){
 const thread=data.thread||{};
 if(thread.kind!=='direct')return '';
 const second=data.secondStaffName;
 let html='<div class="md-callout">Private on-site conversation. Visible to '+esc(data.ownerName||'you')+(second?' and '+esc(second):' only')+' plus the user. It is not emailed, and other staff cannot open it.</div>';
 if(data.canInvite){
  const staff=data.staff||[];
  html+=staff.length?formShell('mc-invite-form',
   select('mc-invite-staff','Invite a second moderator',[['','Choose a moderator'],...staff.map(s=>[s.id,s.name])])+
   '<p class="md-muted md-small">They can read and reply here. You cannot add a third staff member.</p>',
   'Invite moderator'):'<p class="md-muted md-small">No other staff accounts are available to invite.</p>';
 }else if(second)html+='<p class="md-muted md-small">Second moderator: '+esc(second)+'</p>';
 return html;
}

export function conversationRowKind(thread){
 return conversationKindLabel(thread.kind)+(thread.kind==='direct'?'<small>You and one invited moderator</small>':'');
}

export function conversationsHeadingActions(){
 return button('New official message','new-message')+button('New private message','new-direct');
}
