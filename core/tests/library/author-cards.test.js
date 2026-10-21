import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {authorProfileUrl} from "../../library/author-links.js";
import {authorNameHtml} from "../../../site-appearance/js-runtime/author-link.js";
const escapeHtml=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function assertIndependentLinks(html,bookUrl,authorUrl) {
    assert.ok(html.includes('href="'+bookUrl+'"'));
    assert.ok(html.includes('href="'+authorUrl+'"'));
    let depth=0;
    for(const match of html.matchAll(/<\/?a(?:\s[^>]*|)>/g)) {
        if(match[0].startsWith("</"))depth--;else{depth++;assert.equal(depth,1,"author link must not be nested in the book link");}
    }
    assert.equal(depth,0);
}
test("Library cards retain author identity and have independent book and profile links",async()=>{
    const source=await readFile(new URL("../../../applications/library/page-ui/page.js",import.meta.url),"utf8");
    const body=source.slice(source.indexOf("function cardHtml("),source.indexOf("function genreCounts("));
    const render=new Function("coverImg","genreColor","escapeHtml","authorNameHtml","authorProfileUrl","getShelf","genreLabel","readingState","SHELF_LABELS",body+";return cardHtml;")(
        ()=>"",()=>"red",escapeHtml,authorNameHtml,authorProfileUrl,()=>"none",x=>x,{persistent:true},{none:"None"});
    const book={id:"book",title:"Title",author:"Writer",ownerUserId:"author",genres:[],status:"Ongoing",chapters:3};
    assertIndependentLinks(render(book),"/book?id=book","/author?id=author");
    assert.ok(!render({...book,isAnonymous:true}).includes("/author?"));
    assert.match(source,/ownerUserId:book.ownerUserId/);
});
test("homepage tiles keep book navigation and author navigation as separate links",async()=>{
    const source=await readFile(new URL("../../../applications/main-site/homepage/homepage-library.js",import.meta.url),"utf8");
    const body=source.slice(source.indexOf("function tileHtml("),source.indexOf("function skeletonTiles("));
    const render=new Function("mainGenre","genreLabel","escapeHtml","readHref","bookHref","coverHtml","authorNameHtml","authorProfileUrl",body+";return tileHtml;")(
        ()=>"",x=>x,escapeHtml,()=>"/read?id=book",()=>"/book?id=book",()=>"",authorNameHtml,authorProfileUrl);
    const book={id:"book",title:"Title",author:"Writer",ownerUserId:"author"};
    assertIndependentLinks(render(book),"/book?id=book","/author?id=author");
    assert.ok(!render({...book,ownerUserId:""}).includes("/author?"));
});
