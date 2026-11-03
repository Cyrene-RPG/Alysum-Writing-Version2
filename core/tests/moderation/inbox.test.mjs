import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveNotificationDestination} from '../../notifications/client.js';

const inboxPage=new URL('../../../applications/moderation/pages/inbox.html',import.meta.url);
const staffPage=new URL('../../../applications/moderation/pages/moderation.html',import.meta.url);
const inboxJs=new URL('../../../applications/moderation/page-ui/inbox.js',import.meta.url);

test('recipient inbox keeps a static nav and never clears staff #md-nav',async()=>{
 const html=await readFile(inboxPage,'utf8');
 const source=await readFile(inboxJs,'utf8');
 const staff=await readFile(staffPage,'utf8');
 assert.match(staff,/id="md-nav"/);
 assert.equal(/id=["']md-nav["']/.test(html),false);
 assert.match(html,/id="md-screen"/);
 assert.match(html,/id="md-identity"/);
 assert.match(html,/id="md-dialog"/);
 assert.match(html,/aria-label="Your moderation inbox"/);
 assert.doesNotMatch(source,/\$\('#md-nav'\)\.replaceChildren/);
 assert.match(source,/URLSearchParams\(location\.search\)\.get\('thread'\)/);
});

test('moderation notifications open the recipient inbox conversation, not the staff workspace',async()=>{
 const calls=[];
 const client={async rpc(name,payload){calls.push({name,payload});return {data:{threadId:'thread & 1'},error:null};}};
 assert.equal(await resolveNotificationDestination(client,{id:'42',kind:'moderation_message'}),
  '/moderation-inbox?thread=thread%20%26%201');
 assert.deepEqual(calls[0],{name:'mc_call',payload:{p_action:'my_notification',p_payload:{id:'42'}}});
});
