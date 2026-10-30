import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const baseBook={id:'book',user_id:'writer',title:'The Lantern',updated:1,created:1,media_format:'novel',words:4,
    sections:{front:[],back:[],body:[{id:'one',title:'Chapter 1',content:'Original writing.'}]},publish_meta:{},published_chapter_ids:[]};
let remote=structuredClone(baseBook),writes=0,failRead=false;
const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/sync-data'){
        res.setHeader('Content-Type','application/json');
        if(req.method==='GET'){if(failRead){res.statusCode=503;res.end('{}');return;}res.end(JSON.stringify(remote));return;}
        let body='';for await(const part of req)body+=part;const {filters,patch,insert}=JSON.parse(body);
        if(insert)throw Error('No inserts expected in this scenario');
        if(String(filters.updated)!==String(remote.updated)){res.end('[]');return;}
        writes++;remote={...remote,...patch};res.end(JSON.stringify([remote]));return;
    }
    const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream'));res.end(await readFile(file));
}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),name=process.env.EDITOR_BROWSER||'chromium',browser=await pw[name].launch();
const out='test-results/save-conflict';await mkdir(out,{recursive:true});
try{
    const pc=await browser.newPage({viewport:{width:1440,height:900}}),phone=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    for(const page of [pc,phone]){page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());await page.goto(base+'/applications/editor/tests/fixtures/force-sync.html');await page.waitForFunction(()=>window.forceSyncFixture);}
    await pc.locator('#writing').fill('New writing from PC.');
    await pc.getByRole('button',{name:'Force sync',exact:true}).click();await pc.getByRole('status').filter({hasText:'Synced with'}).waitFor();
    assert.equal(remote.sections.body[0].content,'New writing from PC.');assert.equal(writes,1);
    await phone.getByRole('button',{name:'Force sync',exact:true}).click();await phone.getByRole('status').filter({hasText:'Synced with'}).waitFor();
    assert.equal(await phone.locator('#writing').inputValue(),'New writing from PC.');assert.equal(writes,1,'a clean phone downloads without writing its stale copy');
    await phone.locator('#writing').fill('Then edited on phone.');await phone.getByRole('button',{name:'Force sync',exact:true}).click();
    await phone.getByRole('status').filter({hasText:'Synced with'}).waitFor();assert.equal(writes,2,'download updates the next save base');
    await pc.locator('#writing').fill('Different unsaved PC writing.');await pc.getByRole('button',{name:'Force sync',exact:true}).click();
    const dialog=pc.getByRole('dialog');await dialog.waitFor();await pc.getByRole('textbox',{name:'Online manuscript',exact:true}).waitFor();
    assert.match(await pc.getByRole('textbox',{name:'Manuscript in this tab',exact:true}).inputValue(),/Different unsaved PC/);
    await pc.waitForFunction(()=>document.querySelector('[data-online]')?.value.includes('Then edited on phone.'));
    assert.equal(remote.sections.body[0].content,'Then edited on phone.');assert.equal(writes,2,'Force sync does not overwrite a conflict');
    assert.equal(await pc.locator('#writing').inputValue(),'Different unsaved PC writing.');
    await pc.screenshot({path:`${out}/force-sync-conflict-${name}.png`});await pc.getByRole('button',{name:'Close save review',exact:true}).click();
    for(const width of [320,390,1440]){
        await phone.setViewportSize({width,height:900});
        assert.ok(await phone.locator('#forceEditorSync').evaluate(node=>{const r=node.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;}),'Force sync fits '+width);
        await phone.screenshot({path:`${out}/force-sync-${width}-${name}.png`});
    }
    failRead=true;await phone.getByRole('button',{name:'Force sync',exact:true}).click();await phone.getByRole('status').filter({hasText:'Could not sync'}).waitFor();
    assert.equal(await phone.locator('#writing').inputValue(),'Then edited on phone.');assert.equal(writes,2);
    failRead=false;await phone.goto(base+'/applications/editor/tests/fixtures/force-sync.html?local=1');await phone.waitForFunction(()=>window.forceSyncFixture);assert.equal(await phone.locator('#forceEditorSync').isVisible(),false);
    assert.deepEqual(errors,[]);console.log(name+': PC/phone upload and download, version base, conflict review, failed reads, local mode and touch layouts passed.');
}finally{await browser.close();server.close();}
