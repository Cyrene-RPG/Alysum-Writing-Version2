import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname),rules=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8')).rewrites;
const authStub=`
const first='10000000-0000-0000-0000-000000000001',second='10000000-0000-0000-0000-000000000002';
let user=new URL(location.href).searchParams.has('guest')?null:'member-one';const listeners=[];
window.reactionFixture={writes:0,failNext:false,changeAccount(id){user=id;for(const fn of listeners)fn('SIGNED_IN',id?{user:{id}}:null);}};
const posts=[{id:first,author_id:'20000000-0000-0000-0000-000000000001',scope:'site',category:'improved',title:'A little more room to celebrate',body:'Share your reaction to the latest Alysum improvements. You can choose more than one.',status:'published',published_at:'2026-10-29T12:00:00Z'},{id:second,author_id:'20000000-0000-0000-0000-000000000001',scope:'author',category:'announcement',title:'A new chapter is here',body:'Thank you for reading along. Here is a note from the writing desk.',status:'published',published_at:'2026-10-28T12:00:00Z'}];
function read(){return JSON.parse(localStorage.getItem('update-reaction-fixture')||'{}');}
function state(id){const votes=read()[id]||{},counts={};for(const selections of Object.values(votes))for(const id of selections)counts[id]=(counts[id]||0)+1;return{counts,mine:user?votes[user]||[]:[]};}
export const supabase={auth:{getSession:async()=>({data:{session:user?{user:{id:user}}:null}}),onAuthStateChange:fn=>{listeners.push(fn);return{data:{subscription:{unsubscribe(){}}}};}},
 from(table){const conditions=[];const q={select(){return q;},eq(k,v){conditions.push([k,v]);return q;},order(){return q;},range(){return q;},maybeSingle:async()=>({data:{display_name:'Sample Author'}}),then(resolve){return Promise.resolve({data:posts.filter(p=>conditions.every(([k,v])=>p[k]===v))}).then(resolve);}};return q;},
 async rpc(name,args){if(name==='get_announcement_reactions')return{data:Object.fromEntries(args.p_posts.filter(id=>posts.some(p=>p.id===id)).map(id=>[id,state(id)]))};
 window.reactionFixture.writes++;if(!user||user!==args.p_expected_user)throw Error('Account changed');const all=read(),votes=all[args.p_post]||{},mine=new Set(votes[user]||[]);args.p_selected?mine.add(args.p_reaction):mine.delete(args.p_reaction);votes[user]=[...mine];all[args.p_post]=votes;localStorage.setItem('update-reaction-fixture',JSON.stringify(all));if(window.reactionFixture.failNext){window.reactionFixture.failNext=false;throw Error('Lost response');}return{data:state(args.p_post)};}};
`;
const server=createServer(async(req,res)=>{try{
 let path=new URL(req.url,'http://localhost').pathname;
 for(const rule of rules){const m=path.match(new RegExp('^'+rule.source.replace(/:path\*/g,'(.*)')+'$'));if(m){path=rule.destination.replace(/:path\*/g,m[1]||'');break;}}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream'));
 if(path==='/core/authentication/client.js'){res.end(authStub);return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error();let content=await readFile(file);
 if(path==='/applications/updates/pages/updates.html')content=Buffer.from(content.toString().replace(/<script type="module" src="\/applications\/updates\/page-ui\/shell.js"><\/script>/,''));res.end(content);
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),name=process.env.UPDATE_BROWSER||'chromium',browser=await pw[name].launch();await mkdir('test-results/update-reactions',{recursive:true});
try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/updates');const card=page.locator('.update-card').first(),buttons=card.locator('.update-reaction');
  await page.waitForFunction(()=>document.querySelector('.update-reaction')?.disabled===false);assert.equal(await buttons.count(),6);assert.equal(await page.locator('.update-card').count(),2);
  await buttons.nth(0).click();await page.waitForFunction(()=>document.querySelector('.update-reaction')?.getAttribute('aria-pressed')==='true');
  await buttons.nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('.update-reaction')[1]?.getAttribute('aria-pressed')==='true');assert.equal(await buttons.nth(0).getAttribute('aria-pressed'),'true');
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.update-reaction')[1]?.getAttribute('aria-pressed')==='true');assert.equal(await buttons.nth(0).getAttribute('aria-pressed'),'true','multiple choices survive reload');
  await buttons.nth(0).click();await page.waitForFunction(()=>document.querySelector('.update-reaction')?.getAttribute('aria-pressed')==='false');assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true','removing heart preserves purple');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Updates fits '+width);
  for(const button of await buttons.all())assert.ok(await button.evaluate(n=>{const r=n.getBoundingClientRect();return r.height>=44&&r.width>=44&&r.right<=innerWidth;}),'reaction touch target fits '+width);
  await page.screenshot({path:`test-results/update-reactions/member-${width}-${name}.png`,fullPage:true});
  await page.evaluate(()=>{window.reactionFixture.failNext=true;});await buttons.nth(2).click();await card.getByRole('button',{name:'Refresh reactions'}).waitFor();assert.equal(await buttons.nth(2).isDisabled(),true);await card.getByRole('button',{name:'Refresh reactions'}).click();await page.waitForFunction(()=>document.querySelectorAll('.update-reaction')[2]?.getAttribute('aria-pressed')==='true');
  await page.evaluate(()=>window.reactionFixture.changeAccount('member-two'));await page.waitForFunction(()=>document.querySelectorAll('.update-reaction')[1]?.getAttribute('aria-pressed')==='false'&&!document.querySelector('.update-reaction').disabled);assert.match(await buttons.nth(1).getAttribute('aria-label'),/1 reaction/);await buttons.nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('.update-reaction')[1]?.getAttribute('aria-label').includes('2 reactions'));
  await page.evaluate(()=>window.reactionFixture.changeAccount(null));await card.getByRole('link',{name:'Sign in to react'}).waitFor();assert.equal(await buttons.nth(1).isDisabled(),true);assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'false');
  await page.screenshot({path:`test-results/update-reactions/guest-${width}-${name}.png`,fullPage:true});
  await page.goto(base+'/updates?post=10000000-0000-0000-0000-000000000001');await page.waitForFunction(()=>document.querySelector('.update-reaction')?.disabled===false);assert.equal(await page.locator('.update-card').count(),1);assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true','detail reads persisted member-one reaction');
  await page.goto(base+'/updates?author=20000000-0000-0000-0000-000000000001');await page.waitForFunction(()=>document.querySelector('.update-reaction')?.disabled===false);assert.equal(await page.locator('.update-card').count(),1);assert.match(await page.locator('.update-card').textContent(),/A new chapter is here/);
  await page.selectOption('#category-filter','fixed');await page.getByRole('heading',{name:'No updates yet'}).waitFor();assert.equal(await page.locator('.update-reaction').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(name+': multi-reactions, independent removal, persistence, account changes, uncertain saves, detail/author feeds and phone layouts passed.');
}finally{await browser.close();server.close();}
