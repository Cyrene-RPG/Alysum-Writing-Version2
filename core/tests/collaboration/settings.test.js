import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bookEditorsError} from '../../collaboration/book-editors-client.js';
const source=(await readFile(new URL('../../../applications/editor/page-ui/settings.js',import.meta.url),'utf8'))
 .replace(/^import[\s\S]*?;\n/gm,'').replace('export function mountBookSettings','function mountBookSettings')
 .replace('import("@alysum/collaboration/book-editors.js")','loadEditors()');
class Element {
 constructor(){this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';this.listeners={};this.dataset={};this.classList={add(){},remove(){}};}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name){if(name==='hidden')this.hidden=true;}
 removeAttribute(name){if(name==='hidden')this.hidden=false;}
 replaceChildren(){this.innerHTML='';} focus(){}
 async click(target=this){return this.listeners.click?.({target:{closest:()=>target}});}
}
async function fixture({owner=true,fail=true}={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const mount=new Element();mount.querySelector=id=>node(id.slice(1));
 let imports=0,removed='';
 const api={listBookCollaborators:async()=>({owner:{userId:'owner',displayName:'Owner',role:'owner'},editors:[{userId:'editor',displayName:'Editor',role:'editor'}],isOwner:owner}),revokeBookEditor:async(id,user)=>{removed=user;}};
 const loadEditors=async()=>{imports++;if(fail)throw Error('Failed to fetch dynamically imported module');return api;};
 const mountSettings=new Function('document','window','navigator','loadEditors','bookEditorsError','listBookVersions','createBookVersion','formatVersionWhen','restoreBookVersion','sourceLabel','downloadBookZip','openManuscriptDialog',source+';return mountBookSettings;')(
  {getElementById:node},{alert(){}},{},loadEditors,bookEditorsError,async()=>[],async()=>{},()=>'',async()=>{},()=>'',async()=>{},()=>{}
 );
 mountSettings({mount,bookId:'shared',session:{mode:'cloud',user:{id:owner?'owner':'editor'}},getBook:()=>({id:'shared',user_id:'owner'})});
 await new Promise(setImmediate);
 return {node,get imports(){return imports;},recover(){fail=false;},get removed(){return removed;}};
}
test('failed module loading keeps invite disabled and retry loads the module again',async()=>{
 const f=await fixture();assert.equal(f.node('inviteBtn').disabled,true);assert.equal(f.node('collabRetry').hidden,false);
 assert.match(f.node('collabStatus').textContent,/connection/);assert.equal(f.imports,1);
 f.recover();await f.node('collabRetry').click();await new Promise(setImmediate);
 assert.equal(f.imports,2);assert.equal(f.node('inviteBtn').disabled,false);assert.equal(f.node('collabRetry').hidden,true);
});
test('editors never receive invite controls and version history explains owner access',async()=>{
 const f=await fixture({owner:false,fail:false});assert.equal(f.node('inviteBtn').hidden,true);
 assert.equal(f.node('saveVersionBtn').hidden,true);assert.match(f.node('versionCount').textContent,/book owner/);
});
test('roster remove controls use the editor ID and prevent repeat removal',async()=>{
 const f=await fixture({fail:false});assert.match(f.node('collabList').innerHTML,/data-revoke="editor"/);
 const button=new Element();button.dataset.revoke='editor';
 const pending=f.node('collabList').click(button);assert.equal(button.disabled,true);await pending;
 assert.equal(f.removed,'editor');assert.equal(button.disabled,false);
});
