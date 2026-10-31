import {listBodyChapters} from '../writing-engine/manuscript.js';
import {countWordsInHtml} from '../writing-engine/word-count.js';
import {buildLibraryPayload} from '../publishing/post-work.js';
export const EPUB_BUCKET='book-epubs';
export const MAX_EPUB_BYTES=30*1024*1024;
export function validateEpubFile(file){
 if(!file || !/\.epub$/i.test(file.name||''))throw Error('Choose an EPUB (.epub) file.');
 if(!file.size || file.size>MAX_EPUB_BYTES)throw Error('Choose an EPUB up to 30 MB.');
}
export function wholeBookAccess(book,edition,form){
 const chapters=listBodyChapters(book.sections),ids=chapters.map(ch=>String(ch.id));
 if(!ids.length || ids.length>500 || new Set(ids).size!==ids.length || ids.length!==edition.chapterIds.length || ids.some(id=>!edition.chapterIds.includes(id)))throw Error('The EPUB chapters have changed. Upload it as a new EPUB book.');
 if(book.publish_meta?.workType==='fanfiction'||form.workType==='fanfiction')throw Error('Fan fiction cannot be sold.');
 return {book:book.id,workType:'original',complete:true,selectedIds:ids,chapterIds:ids,pricingMode:'bundle',connectionId:form.connectionId,purchaseUrl:form.productUrl,minimumAmount:Math.round(Number(form.price)*100),currency:form.currency};
}
export function buildEpubListing(book,edition,form){
 const access=wholeBookAccess(book,edition,form);
 const data=buildLibraryPayload(book,{...form,chapterIds:[],workType:'original',complete:true,isPublished:true,purchaseUrl:''});
 data.editionFormat='epub';
 data.chapters=listBodyChapters(book.sections).map(ch=>({id:ch.id,title:ch.title||'Untitled',content:'',wordCount:countWordsInHtml(ch.content||''),locked:true,purchaseUrl:form.productUrl}));
 data.publishedChapterIds=access.chapterIds;data.chapterCount=data.chapters.length;
 data.wordCount=data.chapters.reduce((sum,ch)=>sum+ch.wordCount,0);
 return data;
}
