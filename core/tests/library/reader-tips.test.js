import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
class Element {
    constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events={};this.value='';}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(event,callback){this.events[event]=callback;}
    focus(){this.focused=true;}
    get childElementCount(){return this.children.length;}
}
const find=(root,predicate)=>{if(predicate(root))return root;for(const child of root.children||[]){const match=find(child,predicate);if(match)return match;}return null;};
async function fixture(run) {
    let source=await readFile(new URL('../../../applications/library/page-ui/reader-tips.js',import.meta.url),'utf8');
    source=source.replace("'/core/library/author-tips.js'",JSON.stringify(new URL('../../library/author-tips.js',import.meta.url).href));
    const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const keys=['document','Option','navigator','window'];const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
    const opened=[],copied=[];
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag)}});
    Object.defineProperty(globalThis,'Option',{configurable:true,value:function(label,value){const el=new Element('option');el.textContent=label;el.value=value;return el;}});
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{async writeText(value){copied.push(value);}}}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{open(...args){opened.push(args);}}});
    try{await run({mount:module.mountReaderTips,root:new Element('root'),opened,copied});}finally{keys.forEach((key,index)=>{if(previous[index])Object.defineProperty(globalThis,key,previous[index]);else delete globalThis[key];});}
}
test('reader can visibly choose Cash App beside Ko-fi and enter a tip amount',async()=>fixture(async({mount,root,opened,copied})=>{
    mount(root,{supportLinks:{kofi:'https://ko-fi.com/writer',cashapp:'https://cash.app/$Writer'}});
    const leave=find(root,el=>el.tag==='button'&&el.textContent==='Leave a tip');leave.events.click();
    const cash=find(root,el=>el.tag==='button'&&el.textContent==='Cash App');assert.ok(cash);cash.events.click();
    const amount=find(root,el=>el.tag==='input');assert.ok(amount);assert.equal(amount.inputMode,'decimal');amount.value='2.50';
    const submit=find(root,el=>el.tag==='button'&&el.type==='submit');assert.equal(submit.textContent,'Copy amount & open Cash App');
    await find(root,el=>el.tag==='form').events.submit({preventDefault(){}});
    assert.deepEqual(copied,['2.50']);assert.equal(opened[0][0],'https://cash.app/$Writer');
    assert.match(find(root,el=>el.attributes?.role==='status').textContent,/Copied \$2.50 USD/);
}));
test('invalid Cash App amounts neither copy nor open the payment service',async()=>fixture(async({mount,root,opened,copied})=>{
    mount(root,{supportLinks:{cashapp:'$Writer'}});find(root,el=>el.tag==='button').events.click();
    const amount=find(root,el=>el.tag==='input');amount.value='-10';await find(root,el=>el.tag==='form').events.submit({preventDefault(){}});
    assert.equal(opened.length,0);assert.equal(copied.length,0);assert.equal(amount.focused,true);
}));
