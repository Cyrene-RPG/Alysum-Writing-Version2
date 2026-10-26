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
await mkdir('test-results/comment-replies',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],backend=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(/supabase/.test(url.hostname))backend.push(url.href);return url.origin===base?route.continue():route.abort();});
 await page.goto(base+'/applications/library/design/author-comment-replies.html');
 await page.getByRole('button',{name:'Reply to Sample Reader',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Write an author reply'});
 await editor.fill('The next chapter will explain the letter.');
 await page.getByRole('button',{name:'Post reply',exact:true}).click();
 await page.locator('.reader-comment-replies').getByText('The next chapter will explain the letter.').waitFor();
 assert.equal(await page.locator('.reader-comment-author').textContent(),'Author');
 for(const width of [1200,390,320]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'comment threads fit '+width);
  await page.screenshot({path:`test-results/comment-replies/${name}-${width}.png`,fullPage:true});
 }
 assert.deepEqual(backend,[]);assert.deepEqual(errors,[]);
 console.log(name+': author reply saved beneath selected comment; desktop/390/320px layouts passed');
}finally{await browser.close();server.close();}
