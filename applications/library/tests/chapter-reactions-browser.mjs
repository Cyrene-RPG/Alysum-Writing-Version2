import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error('Invalid path');
 res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'}[extname(path)]||'application/octet-stream'));res.end(await readFile(path));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const name=process.env.REACTION_BROWSER||'chromium',browser=await pw[name].launch();
await mkdir('test-results/chapter-reactions',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],backend=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(/supabase/.test(url.hostname))backend.push(url.href);return url.origin===base?route.continue():route.abort();});
 await page.goto(base+'/applications/library/design/chapter-reactions.html');
 const love=page.getByRole('button',{name:/Loved it/}),shock=page.getByRole('button',{name:/Shocked me/});
 await love.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.reader-reaction-count')?.textContent==='24');
 await love.click();assert.equal(await love.getAttribute('aria-pressed'),'true');assert.match(await love.getAttribute('aria-label'),/25 reactions/);
 await shock.click();assert.equal(await love.getAttribute('aria-pressed'),'false');assert.match(await love.getAttribute('aria-label'),/24 reactions/);assert.equal(await shock.getAttribute('aria-pressed'),'true');
 await shock.click();assert.equal(await shock.getAttribute('aria-pressed'),'false');
 for(const width of [1200,390,320]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page fits '+width);
  assert.ok(await page.locator('.reader-reaction').evaluateAll(nodes=>nodes.every(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.left>=0&&b.right<=innerWidth;})),'touch targets fit '+width);
  await page.screenshot({path:`test-results/chapter-reactions/${name}-${width}.png`,fullPage:true});
 }
 await page.goto(base+'/applications/library/design/chapter-reactions.html?guest=1');await page.getByRole('link',{name:'Sign in to react'}).waitFor();
 assert.ok(await page.locator('.reader-reaction').evaluateAll(nodes=>nodes.every(n=>n.disabled)));
 assert.deepEqual(backend,[]);assert.deepEqual(errors,[]);
 console.log(name+': reaction switching, removing, guest state and desktop/390/320px layouts passed');
}finally{await browser.close();server.close();}
