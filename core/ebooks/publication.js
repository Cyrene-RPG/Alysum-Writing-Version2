import {wholeBookAccess,buildEpubListing} from './model.js';
import {validateWarningState} from '../publishing/content-warnings.js';
import {readWorkTags} from '../publishing/work-tags.js';
export function validateEpubDetails(form,book){
 if(readWorkTags(form).workType==='fanfiction'||readWorkTags(book.publish_meta).workType==='fanfiction')throw Error('Fan fiction cannot be sold.');
 if(!form.title?.trim()||!form.author?.trim()||!form.summary?.trim()||!form.genres?.length||!form.rating)throw Error('Add a title, author, description, genre and rating.');
 const warningError=validateWarningState(form.warningMeta,{chapterIds:book.sections.body.map(ch=>String(ch.id))});if(warningError)throw Error(warningError);
 const chapterIds=new Set(book.sections.body.map(ch=>String(ch.id)));if(!Array.isArray(form.freeChapterIds)||new Set(form.freeChapterIds).size!==form.freeChapterIds.length||form.freeChapterIds.some(id=>!chapterIds.has(String(id))))throw Error('Select valid free chapters.');
 if(!form.rightsConfirmed)throw Error('Confirm that you own the rights to sell this original book.');
 if(!/^\d{1,4}(\.\d{1,2})?$/.test(form.price)||Number(form.price)<0.5||Number(form.price)>1000)throw Error('Set the whole-book price from 0.50 to 1,000.');

}
/** Configure protection first. A failed access save must never publish book text. */
export async function publishEpub({book,edition,form,configure,saveListing}){
 validateEpubDetails(form,book);
 const access=wholeBookAccess(book,edition,form);
 await configure(access);
 const data=buildEpubListing(book,edition,form);
 await saveListing(data);
 return data;
}
