import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Minimal DOM surface to exercise the menu while its network refresh is pending.
class Element {
    constructor(tag='div') { this.tag=tag;this.children=[];this.parts=new Map();this.listeners={};this.attrs={}; }
    setAttribute(name,value){this.attrs[name]=value;}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    querySelector(selector){if(!this.parts.has(selector))this.parts.set(selector,new Element(selector==='[data-close]'?'button':'div'));return this.parts.get(selector);}
    querySelectorAll(tag){return [...this.children,...this.parts.values()].flatMap(item=>[...(item.tag===tag?[item]:[]),...item.querySelectorAll(tag)]);}
    addEventListener(name,handler){this.listeners[name]=handler;}
    fire(name){return this.listeners[name]?.();}
    showModal(){this.open=true;}
    close(){this.open=false;this.fire('close');}
    focus(){}
}
test('cached drafts are selectable before refresh completes and a late refresh cannot interrupt saving',async()=>{
    const previousDocument=globalThis.document,previousWindow=globalThis.window;
    let dialog,finishRefresh,finishSave,navigated;
    globalThis.document={body:new Element(),createElement(tag){const element=new Element(tag);if(tag==='dialog')dialog=element;return element;}};
    globalThis.window={location:{href:'https://alysumwriting.com/editor?book=revision'}};
    try {
        const sourceFile=new URL('../../../applications/editor/page-ui/draft-switcher.js',import.meta.url);
        const model=new URL('../../writing-engine/draft-revisions.js',import.meta.url).href;
        const source=(await readFile(sourceFile,'utf8')).replace("'/core/writing-engine/draft-revisions.js'",JSON.stringify(model));
        const {mountDraftSwitcher}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
        const current={id:'revision',draft_parent_id:'original',draft_label:'Draft 2'};
        const cached=[{id:'original'},current];const trigger=new Element('button');
        mountDraftSwitcher({button:trigger,getBook:()=>current,api:{peekDrafts:()=>cached,listDrafts:()=>new Promise(resolve=>{finishRefresh=resolve;}),listBooks:()=>{throw Error('Must not download manuscripts');}},saveCurrent:()=>new Promise(resolve=>{finishSave=resolve;}),navigate:url=>{navigated=url;}});
        const opening=trigger.fire('click');
        const list=dialog.querySelector('[data-drafts]');assert.equal(list.children.length,2,'Cached choices must render without waiting for the server');
        const originalButton=list.children[0];const switching=originalButton.fire('click');
        assert.equal(navigated,undefined);assert.equal(originalButton.disabled,true);
        finishRefresh([{id:'original'},{id:'another',draft_parent_id:'original'}]);await opening;
        assert.equal(list.children[0],originalButton,'A late refresh must not replace controls during a save');assert.equal(originalButton.disabled,true);
        finishSave('saved');await switching;
        assert.equal(new URL(navigated).searchParams.get('book'),'original');assert.equal(dialog.open,false);
    } finally {globalThis.document=previousDocument;globalThis.window=previousWindow;}
});

test('making a draft main requires confirmation, saves first and opens the stable main book ID',async()=>{
    const previousDocument=globalThis.document,previousWindow=globalThis.window;let dialog;
    globalThis.document={body:new Element(),createElement(tag){const element=new Element(tag);if(tag==='dialog')dialog=element;return element;}};
    globalThis.window={location:{href:'https://alysumwriting.com/editor?book=revision&referenceBook=main'}};
    try{
        const sourceFile=new URL('../../../applications/editor/page-ui/draft-switcher.js',import.meta.url);
        const model=new URL('../../writing-engine/draft-revisions.js',import.meta.url).href;
        const source=(await readFile(sourceFile,'utf8')).replace("'/core/writing-engine/draft-revisions.js'",JSON.stringify(model));
        const {mountDraftSwitcher}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
        const current={id:'revision',draft_parent_id:'main',draft_label:'Draft 2'},order=[];let destination;
        const trigger=new Element('button');
        mountDraftSwitcher({button:trigger,getBook:()=>current,api:{peekDrafts:()=>[current,{id:'main'}],listDrafts:async()=>[current,{id:'main'}],async promoteDraft(id){assert.equal(id,'revision');order.push('promote');return {main:{id:'main'}};}},async saveCurrent(){order.push('save');return 'saved';},navigate:url=>{order.push('navigate');destination=url;}});
        await trigger.fire('click');dialog.querySelector('[data-promote]').fire('click');assert.deepEqual(order,[]);
        await dialog.querySelector('[data-confirm-promote]').fire('click');
        assert.deepEqual(order,['save','promote','navigate']);assert.equal(new URL(destination).searchParams.get('book'),'main');assert.equal(new URL(destination).searchParams.has('referenceBook'),false);
    }finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}
});
