import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=await readFile(resolve(root,'applications/studio/pages/studio.html'),'utf8');
const fixture=source.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(all,attributes)=>attributes.includes('importmap')?all:'').replace('</body>',`
<button type="button" id="fixtureGear" data-book-gear="book">Book menu</button>
<script type="module">
import {mountStudioBookReminders} from '/applications/studio/page-ui/book-reminders.js';
import {bindBookMenu} from '/applications/studio/page-ui/book-menu.js';
import {mountBookReminderPopup} from '/site-appearance/js-runtime/book-reminder-popup.js';
window.saved={};window.calls=[];window.failSave=false;window.authListeners=[];
const session={mode:'cloud',user:{id:'owner'}};
const client={auth:{onAuthStateChange(fn){window.authListeners.push(fn);return{data:{subscription:{unsubscribe(){}}}};}},async rpc(name,args){
 window.calls.push({name,args});
 if(name==='get_book_reminder')return{data:window.saved[args.p_book_id]||null};
 if(window.failSave)return{error:{message:'Could not save your reminder. Try again.'}};
 const data={enabled:args.p_enabled,goal:args.p_goal,cadence:args.p_cadence,everyDays:args.p_every_days,timezone:args.p_timezone,firstDueLocal:args.p_first_due_local,popupEnabled:args.p_popup_enabled,nextDue:'2027-01-01T18:00:00Z'};
 window.saved[args.p_book_id]=data;return{data};
}};
const reminders=mountStudioBookReminders({client,session});
const book={id:'book',title:'The Quiet Harbor',user_id:'owner'};
const menu=bindBookMenu({getBooks:()=>[book],setBooks(){},paintShelf(){},api:{},supabase:client,session,onReminders:book=>reminders.open(book)});
document.getElementById('fixtureGear').onclick=event=>menu.openFromGear(event.target);
window.state={userId:'owner',ready:true,loading:false,error:''};window.nextPopup=null;window.claims=0;window.listeners=[];
window.service={async claimReminderPopup(){window.claims++;const result=window.nextPopup;window.nextPopup=null;return result;},subscribe(fn){window.listeners.push(fn);fn(window.state);return()=>{};},async resolveDestination(){return'/editor?book=book';},async setRead(){}};
window.emit=()=>window.listeners.forEach(fn=>fn(window.state));
mountBookReminderPopup({service:window.service});
window.signOut=()=>{window.authListeners.forEach(fn=>fn('SIGNED_OUT',null));window.state={...window.state,userId:''};window.emit();};
window.ready=true;
</script></body>`);
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
 if(url.pathname==='/core/publishing/post-work.js'){res.setHeader('Content-Type','text/javascript');res.end('export const isLibraryListed=()=>false;export const unlistLibraryListing=async()=>{};');return;}
 const aliases={'/css/studio/page.css':'applications/studio/studio-css/page.css','/css/workspace-nav.css':'applications/main-site/pages-css/workspace-nav.css'};
 const path=resolve(root,aliases[url.pathname]||url.pathname.slice(1));if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{const data=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const output=process.env.REMINDER_SCREENSHOTS||'test-results/reminders';await mkdir(output,{recursive:true});
try{
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(base);await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('#bookReminders').evaluate(el=>el.open),false);
  await page.locator('#fixtureGear').click();await page.locator('#bookMenuReminders').click();
  await page.locator('#saveBookReminder').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('saveBookReminder').disabled);
  assert.equal(await page.locator('[name="enabled"]').isChecked(),false);
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name==='save_book_reminder')),false);
  await page.locator('[name="enabled"]').check();
  await page.locator('[name="goal"]').selectOption('post');await page.locator('[name="cadence"]').selectOption('monthly');
  await page.locator('[name="timezone"]').fill('America/Los_Angeles');
  await page.locator('#saveBookReminder').click();
  await page.waitForFunction(()=>document.getElementById('bookReminderStatus').textContent.includes('Reminder saved'));
  assert.equal(await page.evaluate(()=>window.saved.book.cadence),'monthly');assert.equal(await page.evaluate(()=>window.saved.book.goal),'post');
  const box=await page.locator('#bookReminders').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  await page.screenshot({path:output+'/settings-'+width+'.png'});
  await page.locator('[name="enabled"]').uncheck();await page.locator('#saveBookReminder').click();
  await page.waitForFunction(()=>document.getElementById('bookReminderStatus').textContent.includes('are off'));
  await page.evaluate(()=>{window.failSave=true;});await page.locator('[name="enabled"]').check();await page.locator('#saveBookReminder').click();
  await page.waitForFunction(()=>document.getElementById('bookReminderStatus').textContent.includes('Could not save'));
  assert.equal(await page.evaluate(()=>window.saved.book.enabled),false);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.nextPopup={id:'9',title:'Time for your book update',message:'Your reminder for The Quiet Harbor is due.'};window.emit();});
  await page.waitForFunction(()=>document.getElementById('book-reminder-popup').open);
  assert.equal(await page.locator('[data-reminder-dismiss]').evaluate(el=>el===document.activeElement),true);
  await page.screenshot({path:output+'/popup-'+width+'.png'});
  await page.keyboard.press('Escape');const claims=await page.evaluate(()=>window.claims);
  await page.evaluate(()=>window.emit());assert.equal(await page.evaluate(()=>window.claims),claims);
  await page.locator('#fixtureGear').click();await page.locator('#bookMenuReminders').click();
  await page.waitForFunction(()=>!document.getElementById('saveBookReminder').disabled);
  await page.evaluate(()=>window.signOut());
  assert.equal(await page.locator('#bookReminders').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#book-reminder-popup-message').innerText(),'');
  await page.close();
 }
 console.log('Studio reminder browser checks passed: opt-in, recurrence settings, disabling, failed saves, mobile/desktop dialogs, popup focus/dismissal, deduplication and sign-out cleanup.');
}finally{await browser.close();server.close();}
