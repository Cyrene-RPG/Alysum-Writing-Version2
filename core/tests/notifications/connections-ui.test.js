import test from "node:test";
import assert from "node:assert/strict";
import {mountConnections} from "../../../applications/connections/page-ui/page.js";
class Element{
    constructor(tag="div"){this.tag=tag;this.children=[];this.events={};this.attributes={};this.textContent="";this.hidden=false;this.disabled=false;}
    append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
    setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,fn){this.events[k]=fn;}remove(){}
}
const tick=()=>new Promise(r=>setTimeout(r,5));
const row=(id="author")=>({id,displayName:"Writer <One>",username:"writer",authorId:id,bookId:"",imageUrl:"",available:true,createdAt:"2026-10-20T12:00:00Z"});
function fixture(overrides={}){
    const elements=new Map(),calls=[],summary={following:1,followers:1,subscriptions:1};
    const root={createElement:tag=>new Element(tag),getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
    const api={async summary(){calls.push("summary");return {...summary};},
        async list(options){calls.push(options);return [row()];},
        async remove(options){calls.push(options);summary[options.kind]--;},...overrides};
    const page=mountConnections({api,root,location:{hash:""}});
    return{page,el:id=>root.getElementById(id),calls};
}
test("signed-out accounts make no list requests and show the sign-in state",async()=>{
    const f=fixture();f.page.setViewer("");await tick();
    assert.equal(f.el("connections-content").hidden,true);
    assert.equal(f.el("connections-sign-in").hidden,false);
    assert.equal(f.calls.length,0);
});
test("following renders safe text and profile links; successful unfollow removes the row",async()=>{
    const f=fixture();f.page.setViewer("reader");await tick();
    const card=f.el("connections-list").children[0],heading=card.children[1].children[0];
    assert.equal(heading.children[0].textContent,"Writer <One>");
    assert.equal(heading.children[0].href,"/author?id=author");
    card.children[2].events.click();await tick();
    assert.equal(f.el("connections-list").children.length,0);
    assert.equal(f.el("count-following").textContent,"0");
    assert.ok(f.calls.some(c=>c.kind==="following"&&c.userId==="reader"&&c.id==="author"));
});
test("failed removal retains the row and offers an explicit error",async()=>{
    const f=fixture({async remove(){throw Error("Offline");}});f.page.setViewer("reader");await tick();
    f.el("connections-list").children[0].children[2].events.click();await tick();
    assert.equal(f.el("connections-list").children.length,1);
    assert.equal(f.el("connections-status").textContent,"Offline");
});
test("account switching clears private rows immediately and ignores old account responses",async()=>{
    let finish;let first=true;
    const f=fixture({list(){if(first){first=false;return new Promise(r=>finish=r);}return Promise.resolve([row("new-account")]);}});
    f.page.setViewer("first");await tick();
    f.page.setViewer("second");
    assert.equal(f.el("connections-list").children.length,0);
    await tick();finish([row("old-account")]);await tick();
    const link=f.el("connections-list").children[0].children[1].children[0].children[0];
    assert.equal(link.href,"/author?id=new-account");
    f.page.setViewer("");assert.equal(f.el("connections-list").children.length,0);
});
test("pagination preserves the list and passes the last row cursor",async()=>{
    const f=fixture({async list(options){f.calls.push(options);return options.afterId?[row("last")]:Array.from({length:50},(_,i)=>row("id-"+i));}});
    f.page.setViewer("reader");await tick();
    assert.equal(f.el("connections-more").hidden,false);
    f.el("connections-more").events.click();await tick();
    assert.equal(f.el("connections-list").children.length,51);
    assert.ok(f.calls.some(c=>c.afterId==="id-49"));
});
test("reader followers have no remove action or public author link; unavailable books can be unsubscribed",async()=>{
    const f=fixture({async list({kind}){return [{...row("reader"),authorId:"",bookId:"book",available:false,displayName:kind==="followers"?"Reader":"Unavailable book"}];}});
    f.page.setViewer("me");await tick();f.page.setKind("followers");await tick();
    const follower=f.el("connections-list").children[0];
    assert.equal(follower.children.length,2);
    assert.equal(follower.children[1].children[0].children.length,0);
    f.page.setKind("subscriptions");await tick();
    const book=f.el("connections-list").children[0];
    assert.equal(book.children[2].textContent,"Unsubscribe");
    assert.equal(book.children[1].children[0].children.length,0);
});
test("load failures are visible and never display the empty-list message",async()=>{
    const f=fixture({async list(){throw Error("Permission denied");}});f.page.setViewer("me");await tick();
    assert.equal(f.el("connections-status").textContent,"Permission denied");
    assert.equal(f.el("connections-empty").hidden,true);
});
