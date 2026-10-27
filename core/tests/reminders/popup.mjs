import test from 'node:test';
import assert from 'node:assert/strict';
import {mountBookReminderPopup} from '../../../site-appearance/js-runtime/book-reminder-popup.js';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(claim){
 const dom=new JSDOM('<html><head></head><body></body></html>');const root=dom.window.document;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let emit;const service={claimReminderPopup:claim,subscribe(fn){emit=fn;fn({userId:'a',ready:true,loading:false,error:''});return()=>{};}};
 mountBookReminderPopup({service,root});return{dom,root,emit:state=>emit({ready:true,loading:false,error:'',...state}),dialog:()=>root.getElementById('book-reminder-popup')};
}
test('popup shows safe text once per dashboard visit and clears immediately on sign-out',async()=>{
 let claims=0;const f=fixture(async()=>{claims++;return{id:'1',title:'<img src=x>',message:'Book update due'};});
 try{await tick();assert.equal(f.dialog().open,true);assert.equal(f.root.querySelector('h2').textContent,'<img src=x>');assert.equal(f.root.querySelector('img'),null);
 f.root.querySelector('[data-reminder-dismiss]').click();assert.equal(f.dialog().open,false);f.emit({userId:'a'});await tick();assert.equal(claims,1);
 f.emit({userId:''});assert.equal(f.root.getElementById('book-reminder-popup-message').textContent,'');assert.equal(f.dialog().open,false);
 }finally{f.dom.window.close();}
});
test('an old account’s pending popup cannot appear after switching accounts',async()=>{
 let finish,claims=0;const f=fixture(()=>++claims===1?new Promise(resolve=>finish=resolve):Promise.resolve(null));
 try{f.emit({userId:'b'});finish({id:'1',title:'Private A book',message:'Do not leak'});await tick();assert.equal(f.dialog().open,false);assert.equal(f.root.querySelector('h2').textContent,'');}
 finally{f.dom.window.close();}
});
