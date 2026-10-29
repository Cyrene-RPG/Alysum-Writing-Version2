import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname),rules=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8')).rewrites;
const fixtureBooks=[{id:'mine',user_id:'me',title:'My own manuscript',words:50,sections:{front:[],body:[],back:[]},updated:4},{id:'invited',user_id:'creator',title:'The Creator’s Story',words:200,sections:{front:[],body:[],back:[]},updated:3},{id:'revision',user_id:'creator',title:'The Creator’s Story',draft_parent_id:'invited',draft_label:'Revision',sections:{body:[]},updated:2},{id:'other',user_id:'other-creator',title:'A long shared story title that wraps on phones',words:90,sections:{body:[]},updated:1}];
const stubs={
 '/core/authentication/client.js':`export const supabase={rpc:async(name,args)=>{if(name==='list_book_collaborators')return {data:{owner:{user_id:args.p_book_id==='other'?'other-creator':'creator',display_name:args.p_book_id==='other'?'Another Creator':'Creator <name> & friends',role:'owner'},editors:[],is_owner:false}};return {data:{}};},auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`,
 '/core/desktop/studio-session.js':`export async function requireStudioSession(){return {mode:'cloud',user:{id:'me'}};}`,
 '/core/synchronization-engine/books.js':`window.studioFixture={books:${JSON.stringify(fixtureBooks)}};export function createBooksApi(){return {peekBooks:()=>window.studioFixture.books,listBooks:async()=>window.studioFixture.books,hasPending:()=>false,syncPending:async()=>({synced:0,failed:0})};}`,
 '/core/account/workspace-profile.js':`export const peekWorkspaceProfile=()=>({name:'Sample Writer',wordGoalMode:'track',writingGoal:200});export async function loadWorkspaceProfile(){return peekWorkspaceProfile();}`,
 '/core/audiobooks/client.js':`export function createAudiobooksApi(){return {list:async()=>[]};}`,
 '/core/screenplays/client.js':`export function createScreenplaysApi(){return {list:async()=>[]};}`,
 '/core/publishing/post-work.js':`export async function markBooksWithLiveListings(client,books){return books;}export function isLibraryListed(){return false;}export async function unlistLibraryListing(){}`,
 '/core/notifications/service.js':`export function createNotificationService(){return {};}`,
 '/site-appearance/js-runtime/book-reminder-popup.js':`export function mountBookReminderPopup(){}`,
 '/applications/studio/page-ui/shell.js':`export function initWorkspaceShell(){};export function setWelcomeCopy(){}`,
};
const server=createServer(async(req,res)=>{try{
 let path=new URL(req.url,'http://localhost').pathname;
 if(path==='/editor'){res.setHeader('Content-Type','text/html');res.end('<p>Editor destination</p>');return;}
 for(const rule of rules){const m=path.match(new RegExp('^'+rule.source.replace(/:path\*/g,'(.*)')+'$'));if(m){path=rule.destination.replace(/:path\*/g,m[1]||'');break;}}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream'));
 if(stubs[path]){res.end(stubs[path]);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error();
 let content=await readFile(file);if(path==='/applications/studio/pages/studio.html')content=Buffer.from(content.toString().replace(/<script src="\/js\/pwa-register[^>]*><\/script>/,''));res.end(content);
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),name=process.env.STUDIO_SHARED_BROWSER||'chromium',browser=await pw[name].launch();await mkdir('test-results/studio-shared',{recursive:true});
try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/studio');await page.getByText('By Creator <name> & friends',{exact:true}).waitFor();
  const shared=page.getByRole('region',{name:'Shared with you'});
  assert.equal(await page.locator('#bookList .studio-book').count(),1,'owned shelf excludes invited manuscripts');
  assert.match(await page.locator('#bookList').textContent(),/My own manuscript/);assert.equal(await page.locator('#shelfCount').textContent(),'1 book');
  assert.equal(await shared.locator('.studio-book').count(),2,'shared revisions group only within the shared section');
  assert.equal(await shared.getByText('Co-editor',{exact:true}).count(),2);assert.equal(await shared.locator('[data-book-gear]').count(),0,'shared cards do not expose owner publishing/deletion menus');
  assert.match(await shared.textContent(),/By Another Creator/);assert.equal(await shared.locator('name').count(),0,'creator names are escaped');
  assert.ok(await page.locator('#studioStats').textContent().then(t=>t.includes('50')),'own total words excludes collaborators’ manuscripts');
  assert.ok(await shared.evaluate(n=>n.getBoundingClientRect().right<=innerWidth+1),'shared section fits '+width);
  for(const card of await shared.locator('.studio-book').all())assert.ok(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'card text fits '+width);
  await shared.screenshot({path:`test-results/studio-shared/shared-${width}-${name}.png`});
  await page.locator('#layoutToggle').click();assert.equal(await shared.locator('.studio-book').count(),2,'layout switching keeps shared section');
  await shared.getByRole('link').filter({hasText:'The Creator’s Story'}).click();await page.waitForURL('**/editor?book=invited');
  await page.goto(base+'/studio');await page.getByText('By Creator <name> & friends',{exact:true}).waitFor();
  await page.evaluate(()=>{window.studioFixture.books=window.studioFixture.books.filter(b=>b.user_id==='me');window.dispatchEvent(new Event('online'));});
  await page.waitForFunction(()=>document.getElementById('studioSharedBooks').hidden);assert.equal(await page.locator('#bookList .studio-book').count(),1,'losing shared access preserves own shelf');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(name+': Studio shared section, creator attribution, owned totals, layout and editor destinations passed at phone and desktop widths.');
}finally{await browser.close();server.close();}
