import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModerationService} from '../../moderation/service.js';
import {conversationResolved,threadResolveChrome} from '../../../applications/moderation/page-ui/resolve.js';

test('conversationResolved reads staff snake_case and recipient camelCase fields',()=>{
 assert.equal(conversationResolved({}),false);
 assert.equal(conversationResolved({resolved_at:null,resolvedAt:null}),false);
 assert.equal(conversationResolved({resolved_at:'2026-11-03T22:50:00.000Z'}),true);
 assert.equal(conversationResolved({resolvedAt:'2026-11-03T22:50:00.000Z'}),true);
});

test('staff thread chrome offers resolve or reopen without a reply form',()=>{
 assert.match(threadResolveChrome({thread:{id:'t1'}}),/Mark conversation resolved/);
 assert.match(threadResolveChrome({thread:{id:'t1',resolved_at:'2026-11-03T22:50:00.000Z'}}),/Reopen conversation/);
 assert.doesNotMatch(threadResolveChrome({thread:{id:'t1',resolved_at:'2026-11-03T22:50:00.000Z'}}),/Mark conversation resolved/);
});

test('resolve and reopen send only the thread id and a retry identifier',async()=>{
 const calls=[];
 const service=createModerationService({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'thread'}};}});
 await service.call('resolve_thread',{threadId:'thread-1'},'request-1');
 await service.call('reopen_thread',{threadId:'thread-1'},'request-2');
 assert.deepEqual(calls[0],{name:'mc_call',args:{p_action:'resolve_thread',p_payload:{threadId:'thread-1',requestId:'request-1'}}});
 assert.equal(calls[1].args.p_payload.requestId,'request-2');
});

test('resolve-conversation SQL patches still match the private-message mc_call source',async()=>{
 const src=await readFile(new URL('../../../supabase/live-site/supabase-moderation-direct-messages.sql',import.meta.url),'utf8');
 const snippets=[
  "IF p_action NOT IN ('sanction','revoke_sanction','message','staff_reply','direct_message','invite_staff','report_save','book_visibility','appeal_decision','set_staff','ip_add','ip_remove') THEN RAISE EXCEPTION 'Unknown moderation action.'; END IF;",
  "IF length(txt) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Enter a clear explanation in 10–4,000 characters.'; END IF;",
  "PERFORM 1 FROM public.mc_threads WHERE id=tid AND recipient_id=uid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.'; END IF;",
  "IF NOT FOUND OR NOT public.mc_staff_sees_thread(thread.kind,thread.owner_id,thread.second_staff_id,uid) THEN RAISE EXCEPTION 'Conversation not found.'; END IF;\n INSERT INTO public.mc_messages(thread_id,sender_id,side,body) VALUES(tid,uid,'staff',txt) RETURNING id INTO total;",
  "AND (coalesce(p_payload->>'kind','all')='all' OR t.kind=p_payload->>'kind'))",
  "AND EXISTS(SELECT 1 FROM public.mc_messages m WHERE m.thread_id=t.id AND side='user' AND m.created_at>coalesce(t.staff_read_at,'epoch')))",
  "SELECT t.id,t.subject,t.book_id,t.deadline,t.updated_at,t.recipient_read_at FROM public.mc_threads t WHERE t.recipient_id=uid",
  "RETURN jsonb_build_object('id',tid,'subject',thread.subject,'bookId',thread.book_id,'deadline',thread.deadline,'messages',items,'total',total);",
 ];
 for(const snippet of snippets)assert.equal(src.split(snippet).length,2,snippet);
});
