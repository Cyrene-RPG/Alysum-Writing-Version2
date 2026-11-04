import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModerationService} from '../../moderation/service.js';
import {listingAppealSection,listingAppealThreadNote,listingAppealForm,appealKindLabel,appealGrantLabel} from '../../../applications/moderation/page-ui/listing-appeal.js';
import {bookDeadlineRecipientNote} from '../../../applications/moderation/page-ui/deadline.js';

test('inbox lists an appeal ticket for an auto-unpublished book',()=>{
 const html=listingAppealSection([{id:'thread-1',subject:'Please update your book cover',enforcedAt:'2026-11-03T22:50:00.000Z'}]);
 assert.match(html,/Library listings/);
 assert.match(html,/Submit appeal ticket/);
 assert.match(listingAppealSection([{id:'thread-1',subject:'Cover',enforcedAt:'2026-11-03T22:50:00.000Z',appealStatus:'pending'}]),/Appeal Pending/);
 assert.equal(listingAppealSection([]),'');
});

test('an enforced conversation offers an appeal ticket until one is open',()=>{
 assert.equal(listingAppealThreadNote({}), '');
 assert.match(listingAppealThreadNote({id:'thread-1',deadlineEnforcedAt:'2026-11-03T22:50:00.000Z'}),/Submit appeal ticket/);
 assert.match(listingAppealThreadNote({id:'thread-1',deadlineEnforcedAt:'2026-11-03T22:50:00.000Z',listingAppealStatus:'pending'}),/appeal ticket for this listing is with staff/);
 assert.equal(listingAppealThreadNote({id:'thread-1',deadlineEnforcedAt:'2026-11-03T22:50:00.000Z',listingAppealStatus:'granted'},[]),'');
 assert.match(listingAppealThreadNote({id:'thread-1',deadlineEnforcedAt:'2026-11-03T22:50:00.000Z',listingAppealStatus:'upheld'},[{id:'thread-1'}]),/Submit appeal ticket/);
 assert.match(listingAppealForm({id:'thread-1',subject:'Please update your book cover'}),/mc-listing-appeal/);
 assert.equal(bookDeadlineRecipientNote({bookId:'book-1',deadline:'2026-11-10',deadlineEnforcedAt:'2026-11-03T22:50:00.000Z'}), '');
});

test('staff appeal copy names a library listing restore',()=>{
 assert.equal(appealKindLabel('listing'),'Library listing');
 assert.equal(appealKindLabel('suspension'),'Suspension');
 assert.equal(appealGrantLabel('listing'),'Restore library listing');
 assert.equal(appealGrantLabel('suspension'),'Reverse restriction');
});

test('submit_listing_appeal sends the thread id and a retry identifier',async()=>{
 const calls=[];
 const service=createModerationService({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'appeal'}};}});
 await service.call('submit_listing_appeal',{threadId:'thread-1',body:'Please restore this listing to the Library.'},'request-1');
 assert.deepEqual(calls[0],{name:'mc_call',args:{p_action:'submit_listing_appeal',p_payload:{threadId:'thread-1',body:'Please restore this listing to the Library.',requestId:'request-1'}}});
});

test('listing-appeal SQL patches still match the resolve-conversation mc_call source',async()=>{
 const src=await readFile(new URL('../../../supabase/live-site/supabase-moderation-listing-appeals.sql',import.meta.url),'utf8');
 const direct=await readFile(new URL('../../../supabase/live-site/supabase-moderation-direct-messages.sql',import.meta.url),'utf8');
 const resolve=await readFile(new URL('../../../supabase/live-site/supabase-moderation-resolve-conversations.sql',import.meta.url),'utf8');
 assert.match(direct,/RETURN jsonb_build_object\('threads',items,'total',total,'sanctions',result\);/);
 assert.match(direct,/IF p_action IN \('user_reply','submit_appeal'\) THEN/);
 assert.match(direct,/ELSIF p_action='appeal_decision' THEN/);
 assert.match(resolve,/resolvedAt'',thread.resolved_at,''messages'',items,''total'',total\);/);
 assert.match(src,/submit_listing_appeal/);
});
