import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getBookReminder,saveBookReminder,defaultBookReminder} from '../../publishing/reminders.js';
import {resolveNotificationDestination,claimBookReminderPopup} from '../../notifications/client.js';
test('reminders are off by default and persist only through owner-checked RPCs',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return{data:{...defaultBookReminder(),enabled:true}};}};
 const defaults=defaultBookReminder(new Date('2026-10-27T12:00:00Z'));assert.equal(defaults.enabled,false);assert.equal(defaults.popupEnabled,true);
 await getBookReminder(client,'book');await saveBookReminder(client,'book',{...defaults,enabled:true,everyDays:'14'});
 assert.equal(calls[1].args.p_every_days,14);assert.equal(calls[1].args.p_book_id,'book');assert.equal(Object.hasOwn(calls[1].args,'user_id'),false);
 await assert.rejects(getBookReminder({rpc:async()=>({error:{code:'PGRST202'}})},'book'),/not available/);
 await assert.rejects(saveBookReminder({rpc:async()=>({data:null})},'book',defaults),/confirm/);
});
test('inbox targets and popup claims never trust caller-provided book or recipient IDs',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return{name,data:name==='claim_book_reminder_popup'?{id:'9',kind:'book_reminder',title:'Reminder',message:'Update',created_at:'2026-10-27T10:00:00Z'}:[{book_id:'draft & title',goal:'post'}]};}};
 assert.equal(await resolveNotificationDestination(client,{id:'9',kind:'book_reminder',bookId:'untrusted'}),'/publish?book=draft%20%26%20title');
 assert.deepEqual(calls[0].args,{p_notification_id:'9'});assert.equal((await claimBookReminderPopup(client)).id,'9');assert.equal(calls[1].args,undefined);
});
test('reminder settings and popup mounts exist only in Studio, never in Library or Publish',async()=>{
 const read=path=>readFile(new URL('../../../'+path,import.meta.url),'utf8');
 const studio=await read('applications/studio/pages/studio.html');assert.match(studio,/id="bookReminderForm"/);assert.match(studio,/id="bookMenuReminders"/);
 const dashboard=await read('applications/studio/page-ui/page.js');assert.match(dashboard,/mountStudioBookReminders/);assert.match(dashboard,/if\(reminders\) mountBookReminderPopup/);
 for(const file of ['applications/studio/pages/screenplay-preview.html','applications/studio/pages/audiobook-preview.html','applications/studio/pages/publish.html','applications/library/pages/library.html','applications/library/pages/book.html','applications/main-site/pages/settings.html'])assert.doesNotMatch(await read(file),/id="bookReminderForm"/);
 for(const file of ['applications/studio/page-ui/shell.js','applications/studio/page-ui/publish.js','applications/main-site/page-ui/workspace-nav.js','site-appearance/js-runtime/notification-bell.js','applications/library/page-ui/book.js'])assert.doesNotMatch(await read(file),/mountBookReminderPopup|mountStudioBookReminders/);
});
