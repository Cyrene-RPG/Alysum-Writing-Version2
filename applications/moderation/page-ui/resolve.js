import {esc,date,badge,button} from './common.js';

export function conversationResolved(thread){
 return Boolean(thread?.resolved_at||thread?.resolvedAt);
}

export function conversationStatusBadge(thread){
 return conversationResolved(thread)?badge('resolved'):'';
}

export function threadResolveChrome(data){
 const thread=data.thread||{};
 const id=thread.id;
 if(conversationResolved(thread)){
  return '<div class="md-callout">Resolved '+esc(date(thread.resolved_at||thread.resolvedAt))+'. The user can still read this conversation. Reopen it to send another reply.</div>'+
   '<div class="md-actions">'+button('Reopen conversation','reopen-thread',id)+'</div>';
 }
 return '<div class="md-actions">'+button('Mark conversation resolved','resolve-thread',id)+'</div>';
}
