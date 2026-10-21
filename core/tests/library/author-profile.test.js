import test from "node:test";
import assert from "node:assert/strict";
import {authorProfileUrl} from "../../library/author-links.js";
import {authorNameHtml} from "../../../site-appearance/js-runtime/author-link.js";
import {mountAuthorProfile} from "../../../applications/library/page-ui/author.js";
test("author links are canonical, encoded, and never inferred for anonymous or unidentified names",()=>{
    assert.equal(authorProfileUrl({userId:"a&b",username:"ignored"}),"/author?id=a%26b");
    assert.equal(authorProfileUrl({username:"name /?"}),"/author?u=name%20%2F%3F");
    assert.equal(authorProfileUrl({userId:"private",anonymous:true}),null);
    assert.equal(authorProfileUrl(),null);
    assert.equal(authorNameHtml({url:null,label:"<Unknown>"}),"&lt;Unknown&gt;");
    assert.equal(authorNameHtml({url:"javascript:alert(1)",label:"Author"}),"Author");
    assert.match(authorNameHtml({url:"/author?id=author",label:'Writer <One> "two"'}),/Writer &lt;One&gt; &quot;two&quot;/);
});
class Element {
    constructor(tag="div"){this.tag=tag;this.children=[];this.events={};this.attributes={};this.textContent="";this.hidden=false;this.disabled=false;this.classList={add(){},remove(){}};}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=[...items];}
    addEventListener(n,f){this.events[n]=f;}
    setAttribute(n,v){this.attributes[n]=v;}
    removeAttribute(n){delete this.attributes[n];}
}
function fixture(overrides={}) {
    const elements=new Map();
    const root={title:"",createElement:tag=>new Element(tag),getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
    const changes=[],destinations=[];
    const profile={id:"author",username:"writer",displayName:"Writer",bio:"Public biography",links:[],email:"DO NOT DISPLAY",following:["PRIVATE"]};
    const api={async getProfile(){return profile;},async getWorks(){return [{id:"book",title:"Published book",publishedChapterCount:3}];},
        async getFollow(){return {following:false};},async setFollow(authorId,viewerId,follow){changes.push({authorId,viewerId,follow});return {following:follow};},...overrides};
    const page=mountAuthorProfile({api,root,location:{pathname:"/author",search:"?id=author",assign:url=>destinations.push(url)}});
    return {page,root,el:id=>root.getElementById(id),changes,destinations};
}
const tick=()=>new Promise(r=>setTimeout(r,5));
test("full profiles show public facts and books; follow and unfollow confirm persisted results",async()=>{
    const f=fixture();await f.page.load();f.page.setViewer("reader");await tick();
    assert.equal(f.el("author-name").textContent,"Writer");
    assert.equal(f.el("author-bio").textContent,"Public biography");
    assert.equal(f.el("author-books").children.length,1);
    assert.equal(f.el("author-follow").textContent,"Follow");
    await f.el("author-follow").events.click();
    assert.equal(f.el("author-follow").textContent,"Following");
    await f.el("author-follow").events.click();
    assert.equal(f.el("author-follow").textContent,"Follow");
    assert.deepEqual(f.changes.map(x=>x.follow),[true,false]);
    const rendered=[...["author-name","author-bio","author-handle","author-book-count"].map(id=>f.el(id).textContent)].join(" ");
    assert.ok(!rendered.includes("DO NOT DISPLAY") && !rendered.includes("PRIVATE"));
});
test("guest follow returns through login; own profile offers editing instead of self-follow",async()=>{
    const f=fixture();await f.page.load();f.page.setViewer("");await tick();
    await f.el("author-follow").events.click();
    assert.deepEqual(f.destinations,["/login?next=%2Fauthor%3Fid%3Dauthor"]);
    assert.equal(f.changes.length,0);
    f.page.setViewer("author");await tick();
    assert.equal(f.el("author-follow").hidden,true);
    assert.equal(f.el("author-edit").hidden,false);
});
test("failed follow writes remain unconfirmed and offer status retry",async()=>{
    const f=fixture({async setFollow(){throw Error("Offline");}});
    await f.page.load();f.page.setViewer("reader");await tick();
    await f.el("author-follow").events.click();
    assert.equal(f.el("author-follow").attributes["aria-pressed"],"false");
    assert.equal(f.el("author-follow").textContent,"Retry follow status");
    assert.equal(f.el("author-follow-status").textContent,"Offline");
});
test("account changes clear follow state and discard a previous account's pending mutation",async()=>{
    let finish;
    const f=fixture({setFollow(){return new Promise(r=>{finish=r;});}});
    await f.page.load();f.page.setViewer("reader-one");await tick();
    const pending=f.el("author-follow").events.click();
    f.page.setViewer("reader-two");await tick();
    finish({following:true});await pending;
    assert.equal(f.el("author-follow").attributes["aria-pressed"],"false");
    assert.equal(f.el("author-follow").textContent,"Follow");
});
test("missing profiles and failed book loads have explicit states",async()=>{
    const missing=fixture({async getProfile(){return null;}});await missing.page.load();
    assert.equal(missing.el("author-sheet").hidden,true);
    assert.match(missing.el("author-status").textContent,/unavailable/);
    const failure=fixture({async getWorks(){throw Error("Books unavailable");}});await failure.page.load();
    assert.equal(failure.el("author-sheet").hidden,false);
    assert.equal(failure.el("author-books-status").textContent,"Books unavailable");
});
